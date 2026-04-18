import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { aiTurnSchema, chapterSummaryResponseSchema, type AiTurn, type ChapterSummaryResponse } from "./schema.js";
import { buildMetricsDescription } from "./metrics.js";
import { getVisibleNpcs } from "./npcs.js";
import type { Choice, GameSession, NpcProfile } from "../types.js";

// --- 预加载世界设定（启动时读一次） ---

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const worldDoc = readFileSync(path.join(workspaceRoot, "世界设定包.md"), "utf8");

// --- NPC 上下文构建 ---

function buildNpcContext(npcs: NpcProfile[]): string {
  const visible = getVisibleNpcs(npcs);
  if (visible.length === 0) {
    return "当前尚未接触任何关键人物。";
  }
  return visible
    .map((npc) => `${npc.name}（${npc.title}）—— 态度：${npc.attitude}，关系：${npc.relationship}`)
    .join("\n");
}

// --- 记忆上下文构建 ---

function buildMemoryContext(session: GameSession): string {
  const parts: string[] = [];

  if (session.state.chapterSummaries.length > 0) {
    parts.push("【已完成章节】");
    for (const cs of session.state.chapterSummaries) {
      parts.push(`${cs.chapterId}：${cs.summary}`);
    }
  }

  const visibleNpcs = getVisibleNpcs(session.state.npcs);
  if (visibleNpcs.length > 0) {
    parts.push("\n【人物关系】");
    for (const npc of visibleNpcs) {
      parts.push(`${npc.name}（${npc.title}）—— ${npc.relationship}`);
    }
  }

  const hooks = session.state.storyMemory.unresolvedHooks;
  if (hooks.length > 0) {
    parts.push("\n【未解悬念】");
    for (const hook of hooks) {
      parts.push(`- ${hook}`);
    }
  }

  const recentHistory = session.history
    .slice(-6)
    .map((item) => `第${item.turn}回合：玩家选择「${item.playerChoice}」；摘要：${item.summary}`)
    .join("\n");

  if (recentHistory) {
    parts.push(`\n【本章近期经过】\n${recentHistory}`);
  }

  return parts.join("\n");
}

function buildRecentChoicesContext(session: GameSession): string {
  const recent = session.history.slice(-3);
  if (recent.length === 0) {
    return "";
  }

  const lines = recent.map((item) => {
    const allLabels = [item.playerChoice, ...item.rejectedChoices];
    return `第${item.turn}回合：${allLabels.join(" / ")}（玩家选择了：${item.playerChoice}）`;
  });

  return [
    "【最近 3 轮出现过的选项（本章内）】",
    ...lines,
    "",
    "新生成的选项必须在【推进目标】【接触对象】【行动方式】三个维度的至少两个维度上，与上述选项明显不同。不得出现语义重复或仅换词改写的选项。",
  ].join("\n");
}

// --- Prompt 构建 ---

function buildPrompt(session: GameSession, selectedChoice: Choice) {
  const metricsDesc = buildMetricsDescription(session.state.metrics);
  const npcContext = buildNpcContext(session.state.npcs);
  const memoryContext = buildMemoryContext(session);
  const recentChoicesContext = buildRecentChoicesContext(session);

  const system = [
    "你是架空古风互动小说引擎，只为《大雍逆袭录》生成下一回合剧情。",
    "固定要求：男主、强主线、专注权谋线、禁止脱离统一王朝与女帝主线、禁止现代词汇泛滥。",
    "关键状态由引擎裁定，你只能提出建议变更，不能越权决定主角直接升天或跳过阶段。",
    "文风要求：古风白话，简洁有画面感，每次推进必须体现因果。",
    "玩家当前只能通过按钮选项推进剧情，不要要求自由输入。",
    "选项设计要求：每回合必须体现新的推进目标、接触对象或行动方式，不能只是重复上一轮的换词改写。",
    "选项多样性要求：\n- 三个选项应体现不同的推进方向（例如：接触新对象 / 变换行动方式 / 引入新场景 / 触发新事件）\n- 禁止套用「激进行动 + 温和周旋 + 谨慎观望」的固定三元模板\n- intent 分布尽量多样：同一回合内避免 3 个选项都落在 power/people/caution 这个常见组合上",
    "优先推动阶段变化：流民求生 -> 县署立足 -> 入京见识 -> 朝堂博弈 -> 皇权扩张。",
    "你必须只返回一个 JSON 对象，不要输出解释、前后缀、markdown 代码块。",
    `【世界设定】\n${worldDoc}`,
    `【主角当前属性】\n${metricsDesc}`,
    `【已知关键人物】\n${npcContext}`,
    "要求：NPC 的言行举止必须与其当前态度和与主角的关系一致。若某 NPC 尚未接触主角，不得安排其主动出场。",
  ].join("\n\n");

  const userParts = [
    `主角姓名：${session.protagonistName}`,
    `当前路线：${session.route}`,
    `当前阶段：${session.state.world.phase}`,
    `当前章节：${session.state.world.chapter}`,
    `当前回合：${session.state.world.turn}（本章第 ${session.state.world.chapterTurn} 回合）`,
    memoryContext,
  ];

  if (recentChoicesContext) {
    userParts.push(recentChoicesContext);
  }

  userParts.push(
    `本回合玩家选择：${selectedChoice.label}`,
    "请生成紧接这一选择之后的下一幕剧情，给出 2-4 段叙述、2-4 个按钮选项，并提供小幅度的建议状态变化。",
    "所有 suggestedState 字段都必须填写，即使数值为 0；flagsToAdd 也必须返回数组。",
    "新选项必须与上一轮按钮明显不同，且都服务于权谋主线，不能跑偏到无关支线。",
    '返回 JSON 结构必须为：{"title":string,"location":string,"chapterLabel":string,"narrative":string[],"summary":string,"suggestedState":{"reputationDelta":number,"imperialFavorDelta":number,"peopleSupportDelta":number,"intrigueDelta":number,"militaryDelta":number,"wealthDelta":number,"imperialAuthorityDelta":number,"factionProgressDelta":number,"flagsToAdd":string[]},"choices":[{"label":string,"intent":"power|people|caution|emotion|action"}]}',
  );

  const user = userParts.join("\n\n");

  return { system, user };
}

function buildNarrativePrompt(session: GameSession, selectedChoice: Choice) {
  const metricsDesc = buildMetricsDescription(session.state.metrics);
  const npcContext = buildNpcContext(session.state.npcs);
  const memoryContext = buildMemoryContext(session);
  const recentChoicesContext = buildRecentChoicesContext(session);

  const system = [
    "你是架空古风互动小说引擎。",
    "请只生成下一幕的剧情正文，不要生成 JSON，不要生成选项，不要解释规则。",
    "固定要求：男主、强主线、专注权谋线、古风白话、因果明确、承接当前选择。",
    `【世界设定】\n${worldDoc}`,
    `【主角当前属性】\n${metricsDesc}`,
    `【已知关键人物】\n${npcContext}`,
    "NPC 言行必须与其态度和关系一致。未接触的 NPC 不得主动出场。",
  ].join("\n\n");

  const userParts = [
    `主角姓名：${session.protagonistName}`,
    `当前阶段：${session.state.world.phase}`,
    `当前章节：${session.state.world.chapter}`,
    `当前回合：${session.state.world.turn}（本章第 ${session.state.world.chapterTurn} 回合）`,
    memoryContext,
  ];

  if (recentChoicesContext) {
    userParts.push(recentChoicesContext);
  }

  userParts.push(
    `本回合玩家选择：${selectedChoice.label}`,
    "请紧接上一幕，直接写下一幕剧情正文。",
    "要求：2-3 段，每段自然分段；不能跳脱主线；不能换主角；不能改设定；不要标题；不要列表；不要问用户问题；只输出正文。",
  );

  const user = userParts.join("\n\n");

  return { system, user };
}

function buildPromptFromNarrative(session: GameSession, selectedChoice: Choice, narrative: string[]) {
  const recentChoicesContext = buildRecentChoicesContext(session);

  const system = [
    "你是架空古风互动小说引擎的结构化输出模块。",
    "你会收到一段已经生成好的剧情正文。你必须基于这段正文返回结构化 JSON。",
    "不要改写 narrative 的内容，只为它补齐 title、location、chapterLabel、summary、suggestedState、choices。",
    "choices 的 intent 只能是 power、people、caution、emotion、action。",
    "选项多样性要求：\n- 三个选项应体现不同的推进方向（例如：接触新对象 / 变换行动方式 / 引入新场景 / 触发新事件）\n- 禁止套用「激进行动 + 温和周旋 + 谨慎观望」的固定三元模板\n- intent 分布尽量多样：同一回合内避免 3 个选项都落在 power/people/caution 这个常见组合上",
    `【世界设定】\n${worldDoc}`,
  ].join("\n\n");

  const userParts = [
    `主角姓名：${session.protagonistName}`,
    `当前阶段：${session.state.world.phase}`,
    `当前章节：${session.state.world.chapter}`,
    `当前回合：${session.state.world.turn}`,
    `本回合玩家选择：${selectedChoice.label}`,
    `已生成剧情正文：\n${narrative.join("\n\n")}`,
  ];

  if (recentChoicesContext) {
    userParts.push(recentChoicesContext);
  }

  userParts.push(
    "请返回一个 JSON 对象，不要输出 markdown 代码块或解释。",
    "所有 suggestedState 字段都必须填写，即使数值为 0；flagsToAdd 也必须返回数组。",
    '返回 JSON 结构必须为：{"title":string,"location":string,"chapterLabel":string,"narrative":string[],"summary":string,"suggestedState":{"reputationDelta":number,"imperialFavorDelta":number,"peopleSupportDelta":number,"intrigueDelta":number,"militaryDelta":number,"wealthDelta":number,"imperialAuthorityDelta":number,"factionProgressDelta":number,"flagsToAdd":string[]},"choices":[{"label":string,"intent":"power|people|caution|emotion|action"}]}',
  );

  const user = userParts.join("\n\n");

  return { system, user };
}

// --- 章节总结 prompt ---

function buildChapterSummaryPrompt(session: GameSession) {
  const npcContext = buildNpcContext(session.state.npcs);
  const historyLines = session.history
    .map((item) => `第${item.turn}回合：玩家选择「${item.playerChoice}」；摘要：${item.summary}`)
    .join("\n");

  const system = [
    "你是架空古风互动小说引擎的章节总结模块。",
    "你需要根据本章的经过，生成一段章节总结和结构化元数据。",
    "返回 JSON，不要输出 markdown 代码块或解释。",
    `【世界设定】\n${worldDoc}`,
  ].join("\n\n");

  const npcIds = session.state.npcs.filter((n) => n.visible).map((n) => n.id);

  const user = [
    `当前章节：${session.state.world.chapter}（${session.state.world.chapterId}）`,
    `主角姓名：${session.protagonistName}`,
    `本章经过：\n${historyLines}`,
    `当前已知人物：\n${npcContext}`,
    "请返回 JSON：",
    `{"summary":"200-300字的本章叙事总结","keyEvents":["关键事件1","关键事件2"],"npcUpdates":[{"npcId":"${npcIds[0] ?? "npc_id"}","attitude":"当前态度","relationship":"与主角的关系描述","visible":true}],"unresolvedHooks":["悬念1","悬念2"]}`,
    `可用的 npcId 列表：${JSON.stringify(npcIds)}`,
    "npcUpdates 只需要更新本章有变化的 NPC。attitude 用简短词语如：冷淡、观察、试探、信任、倚重等。",
  ].join("\n\n");

  return { system, user };
}

// --- 工具函数 ---

function extractMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item) {
          return typeof item.text === "string" ? item.text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("模型返回了空内容");
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return trimmed;
}

function normalizeIntent(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const intent = value.trim().toLowerCase();
  const aliasMap: Record<string, "power" | "people" | "caution" | "emotion" | "action"> = {
    power: "power", intrigue: "power", political: "power", politics: "power", authority: "power",
    people: "people", populace: "people", support: "people",
    caution: "caution", careful: "caution", stealth: "caution", observe: "caution",
    emotion: "emotion", affection: "emotion", relation: "emotion",
    action: "action", military: "action", battle: "action", combat: "action",
  };
  return aliasMap[intent] ?? intent;
}

function normalizeAiTurn(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const turn = raw as Record<string, unknown>;
  const choices = Array.isArray(turn.choices)
    ? turn.choices.map((choice) => {
        if (!choice || typeof choice !== "object") return choice;
        const item = choice as Record<string, unknown>;
        return { ...item, intent: normalizeIntent(item.intent) };
      })
    : turn.choices;
  return { ...turn, choices };
}

const DELTA_BOUNDS: Record<string, [number, number]> = {
  reputationDelta: [-3, 4],
  imperialFavorDelta: [-2, 3],
  peopleSupportDelta: [-2, 3],
  intrigueDelta: [-2, 4],
  militaryDelta: [-2, 3],
  wealthDelta: [-2, 3],
  imperialAuthorityDelta: [0, 3],
  factionProgressDelta: [0, 5],
};

const STRING_BOUNDS: Record<string, number> = {
  title: 40,
  location: 60,
  chapterLabel: 30,
  summary: 300,
};

function normalizeNarrativeParagraphs(paragraphs: readonly unknown[]): string[] {
  const cleaned = paragraphs
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => (p.length > 500 ? p.slice(0, 500) : p));

  // 如果只有一段长文本，尝试按中文句末标点拆分成 2-4 段，便于阅读
  if (cleaned.length === 1 && cleaned[0].length > 120) {
    const sentences = cleaned[0].split(/(?<=[。！？])/).filter((s) => s.trim().length > 0);
    if (sentences.length >= 2) {
      const mid = Math.ceil(sentences.length / 2);
      return [
        sentences.slice(0, mid).join("").trim(),
        sentences.slice(mid).join("").trim(),
      ].filter((p) => p.length > 0);
    }
  }

  return cleaned.slice(0, 6);
}

function sanitizeAiTurnJson(raw: unknown, overrideNarrative?: string[]): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  if (overrideNarrative) {
    obj.narrative = normalizeNarrativeParagraphs(overrideNarrative);
  } else if (Array.isArray(obj.narrative)) {
    obj.narrative = normalizeNarrativeParagraphs(obj.narrative as unknown[]);
  }

  for (const [key, maxLen] of Object.entries(STRING_BOUNDS)) {
    const value = obj[key];
    if (typeof value === "string" && value.length > maxLen) {
      obj[key] = value.slice(0, maxLen);
    }
  }

  if (Array.isArray(obj.choices)) {
    obj.choices = (obj.choices as unknown[]).slice(0, 4).map((choice) => {
      if (!choice || typeof choice !== "object") return choice;
      const item = { ...(choice as Record<string, unknown>) };
      if (typeof item.label === "string" && item.label.length > 60) {
        item.label = (item.label as string).slice(0, 60);
      }
      return item;
    });
  }

  if (obj.suggestedState && typeof obj.suggestedState === "object") {
    const state = { ...(obj.suggestedState as Record<string, unknown>) };
    for (const [key, [min, max]] of Object.entries(DELTA_BOUNDS)) {
      const value = state[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        state[key] = Math.min(max, Math.max(min, Math.round(value)));
      }
    }
    if (Array.isArray(state.flagsToAdd)) {
      state.flagsToAdd = (state.flagsToAdd as unknown[])
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => (f.length > 60 ? f.slice(0, 60) : f))
        .slice(0, 6);
    }
    obj.suggestedState = state;
  }

  return obj;
}

function toNarrativeParagraphs(raw: string): string[] {
  const parts = raw.replace(/```(?:text|markdown)?/gi, "").split(/\n\s*\n/);
  return normalizeNarrativeParagraphs(parts);
}

// --- OpenAI 客户端 ---

function createClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  });
}

async function createChatCompletion(client: OpenAI, system: string, user: string) {
  const model = (process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const params = Object.assign(
    {
      model,
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ],
    },
    { enable_thinking: false },
  );
  try {
    return await client.chat.completions.create(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unsupportedJsonMode = message.includes("response_format") || message.includes("json_object") || message.includes("not supported");
    if (!unsupportedJsonMode) throw error;
    return client.chat.completions.create(params);
  }
}

async function createStructuredTurnFromPrompt(
  client: OpenAI,
  system: string,
  user: string,
  overrideNarrative?: string[],
): Promise<AiTurn> {
  const response = await createChatCompletion(client, system, user);
  const content = extractMessageContent(response.choices[0]?.message?.content);
  const parsedJson = JSON.parse(extractJsonObject(content));
  const sanitized = sanitizeAiTurnJson(parsedJson, overrideNarrative);
  return aiTurnSchema.parse(normalizeAiTurn(sanitized));
}

// --- 公开接口 ---

export async function streamNarrativeTurn(
  session: GameSession,
  selectedChoice: Choice,
  onDelta: (delta: string) => Promise<void> | void,
): Promise<{ narrative: string[] }> {
  const client = createClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY 未配置，无法生成剧情。");
  }

  const prompt = buildNarrativePrompt(session, selectedChoice);
  const model = (process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const streamParams = Object.assign(
    {
      model,
      messages: [
        { role: "system" as const, content: prompt.system },
        { role: "user" as const, content: prompt.user },
      ],
      stream: true as const,
      max_tokens: 420,
    },
    { enable_thinking: false },
  );
  const stream = await client.chat.completions.create(streamParams);

  let text = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      text += delta;
      await onDelta(delta);
    }
  }

  const narrative = toNarrativeParagraphs(text);
  if (!narrative.length) {
    throw new Error("模型返回了空的剧情正文。");
  }
  return { narrative };
}

export async function generateAiTurnFromNarrative(
  session: GameSession,
  selectedChoice: Choice,
  narrative: string[],
): Promise<{ turn: AiTurn }> {
  const client = createClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY 未配置，无法生成剧情。");
  }

  const prompt = buildPromptFromNarrative(session, selectedChoice, narrative);
  const parsedTurn = await createStructuredTurnFromPrompt(client, prompt.system, prompt.user, narrative);
  return { turn: parsedTurn };
}

export async function generateAiTurn(
  session: GameSession,
  selectedChoice: Choice,
): Promise<{ turn: AiTurn }> {
  const client = createClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY 未配置，无法生成剧情。");
  }

  const prompt = buildPrompt(session, selectedChoice);
  const parsedTurn = await createStructuredTurnFromPrompt(client, prompt.system, prompt.user);
  return { turn: parsedTurn };
}

export async function generateChapterSummary(
  session: GameSession,
): Promise<{ summary: ChapterSummaryResponse }> {
  const client = createClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY 未配置，无法生成章节总结。");
  }

  const prompt = buildChapterSummaryPrompt(session);
  const response = await createChatCompletion(client, prompt.system, prompt.user);
  const content = extractMessageContent(response.choices[0]?.message?.content);
  const parsedJson = JSON.parse(extractJsonObject(content));
  return { summary: chapterSummaryResponseSchema.parse(parsedJson) };
}
