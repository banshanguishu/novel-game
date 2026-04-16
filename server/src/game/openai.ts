import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { aiTurnSchema, chapterSummaryResponseSchema, type AiTurn, type ChapterSummaryResponse } from "./schema.js";
import { createFallbackTurn, createFallbackChapterSummary } from "./fallback.js";
import { buildMetricsDescription } from "./metrics.js";
import { getVisibleNpcs } from "./npcs.js";
import type { Choice, GameResponse, GameSession, NpcProfile } from "../types.js";

// --- 预加载世界设定（启动时读一次） ---

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const worldDoc = readFileSync(path.join(workspaceRoot, "世界设定包.md"), "utf8");

const worldSummary = [
  "世界：纯架空大雍王朝，封建乱世，中央皇权衰弱，藩镇与世家并立。",
  "主角：固定男主，现代社畜魂穿流民，靠诗词、治理思维、民生常识与权谋见识逆袭。",
  "路线：当前只做专注权谋线，成长轨迹为流民 -> 文人/小吏 -> 朝堂重臣 -> 主帅 -> 女帝夫君。",
  "女帝：萧清晏，聪慧克制，不恋爱脑，始终以天下与皇权为重。",
  "文风：古风白话，简洁有画面感，不能出现明显现代词汇泛滥。",
  "剧情约束：不能一步登天，每一步推进都要有因果与代价。",
  "输出目标：每回合必须让主角更接近县衙、军伍、世家、朝堂、皇权等核心权力节点。",
].join("\n");

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

// --- Prompt 构建 ---

function buildPrompt(session: GameSession, selectedChoice: Choice) {
  const metricsDesc = buildMetricsDescription(session.state.metrics);
  const npcContext = buildNpcContext(session.state.npcs);
  const memoryContext = buildMemoryContext(session);

  const system = [
    "你是架空古风互动小说引擎，只为《大雍逆袭录》生成下一回合剧情。",
    "固定要求：男主、强主线、专注权谋线、禁止脱离统一王朝与女帝主线、禁止现代词汇泛滥。",
    "关键状态由引擎裁定，你只能提出建议变更，不能越权决定主角直接升天或跳过阶段。",
    "文风要求：古风白话，简洁有画面感，每次推进必须体现因果。",
    "玩家当前只能通过按钮选项推进剧情，不要要求自由输入。",
    "选项设计要求：每回合必须体现新的推进目标、接触对象或行动方式，不能只是重复上一轮的换词改写。",
    "优先推动阶段变化：流民求生 -> 县署立足 -> 入京见识 -> 朝堂博弈 -> 皇权扩张。",
    "你必须只返回一个 JSON 对象，不要输出解释、前后缀、markdown 代码块。",
    `【世界摘要】\n${worldSummary}`,
    `【主角当前属性】\n${metricsDesc}`,
    `【已知关键人物】\n${npcContext}`,
    "要求：NPC 的言行举止必须与其当前态度和与主角的关系一致。若某 NPC 尚未接触主角，不得安排其主动出场。",
  ].join("\n\n");

  const user = [
    `主角姓名：${session.protagonistName}`,
    `当前路线：${session.route}`,
    `当前阶段：${session.state.world.phase}`,
    `当前章节：${session.state.world.chapter}`,
    `当前回合：${session.state.world.turn}（本章第 ${session.state.world.chapterTurn} 回合）`,
    memoryContext,
    `本回合玩家选择：${selectedChoice.label}`,
    "请生成紧接这一选择之后的下一幕剧情，给出 2-4 段叙述、2-4 个按钮选项，并提供小幅度的建议状态变化。",
    "所有 suggestedState 字段都必须填写，即使数值为 0；flagsToAdd 也必须返回数组。",
    "新选项必须与上一轮按钮明显不同，且都服务于权谋主线，不能跑偏到无关支线。",
    '返回 JSON 结构必须为：{"title":string,"location":string,"chapterLabel":string,"narrative":string[],"summary":string,"suggestedState":{"reputationDelta":number,"imperialFavorDelta":number,"peopleSupportDelta":number,"intrigueDelta":number,"militaryDelta":number,"wealthDelta":number,"imperialAuthorityDelta":number,"factionProgressDelta":number,"flagsToAdd":string[]},"choices":[{"label":string,"intent":"power|people|caution|emotion|action"}]}',
  ].join("\n\n");

  return { system, user };
}

function buildNarrativePrompt(session: GameSession, selectedChoice: Choice) {
  const metricsDesc = buildMetricsDescription(session.state.metrics);
  const npcContext = buildNpcContext(session.state.npcs);
  const memoryContext = buildMemoryContext(session);

  const system = [
    "你是架空古风互动小说引擎。",
    "请只生成下一幕的剧情正文，不要生成 JSON，不要生成选项，不要解释规则。",
    "固定要求：男主、强主线、专注权谋线、古风白话、因果明确、承接当前选择。",
    `【世界摘要】\n${worldSummary}`,
    `【主角当前属性】\n${metricsDesc}`,
    `【已知关键人物】\n${npcContext}`,
    "NPC 言行必须与其态度和关系一致。未接触的 NPC 不得主动出场。",
  ].join("\n\n");

  const user = [
    `主角姓名：${session.protagonistName}`,
    `当前阶段：${session.state.world.phase}`,
    `当前章节：${session.state.world.chapter}`,
    `当前回合：${session.state.world.turn}（本章第 ${session.state.world.chapterTurn} 回合）`,
    memoryContext,
    `本回合玩家选择：${selectedChoice.label}`,
    "请紧接上一幕，直接写下一幕剧情正文。",
    "要求：2-3 段，每段自然分段；不能跳脱主线；不能换主角；不能改设定；不要标题；不要列表；不要问用户问题；只输出正文。",
  ].join("\n\n");

  return { system, user };
}

function buildPromptFromNarrative(session: GameSession, selectedChoice: Choice, narrative: string[]) {
  const system = [
    "你是架空古风互动小说引擎的结构化输出模块。",
    "你会收到一段已经生成好的剧情正文。你必须基于这段正文返回结构化 JSON。",
    "不要改写 narrative 的内容，只为它补齐 title、location、chapterLabel、summary、suggestedState、choices。",
    "choices 的 intent 只能是 power、people、caution、emotion、action。",
    `【世界摘要】\n${worldSummary}`,
  ].join("\n\n");

  const user = [
    `主角姓名：${session.protagonistName}`,
    `当前阶段：${session.state.world.phase}`,
    `当前章节：${session.state.world.chapter}`,
    `当前回合：${session.state.world.turn}`,
    `本回合玩家选择：${selectedChoice.label}`,
    `已生成剧情正文：\n${narrative.join("\n\n")}`,
    "请返回一个 JSON 对象，不要输出 markdown 代码块或解释。",
    "所有 suggestedState 字段都必须填写，即使数值为 0；flagsToAdd 也必须返回数组。",
    '返回 JSON 结构必须为：{"title":string,"location":string,"chapterLabel":string,"narrative":string[],"summary":string,"suggestedState":{"reputationDelta":number,"imperialFavorDelta":number,"peopleSupportDelta":number,"intrigueDelta":number,"militaryDelta":number,"wealthDelta":number,"imperialAuthorityDelta":number,"factionProgressDelta":number,"flagsToAdd":string[]},"choices":[{"label":string,"intent":"power|people|caution|emotion|action"}]}',
  ].join("\n\n");

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

function toNarrativeParagraphs(raw: string): string[] {
  return raw
    .replace(/```(?:text|markdown)?/gi, "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function sleep(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function streamTextFallback(text: string, onDelta: (delta: string) => Promise<void> | void) {
  const chunkSize = 8;
  for (let index = 0; index < text.length; index += chunkSize) {
    await onDelta(text.slice(index, index + chunkSize));
    await sleep(20);
  }
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
  try {
    return await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unsupportedJsonMode = message.includes("response_format") || message.includes("json_object") || message.includes("not supported");
    if (!unsupportedJsonMode) throw error;
    return client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
  }
}

async function createStructuredTurnFromPrompt(client: OpenAI, system: string, user: string): Promise<AiTurn> {
  const response = await createChatCompletion(client, system, user);
  const content = extractMessageContent(response.choices[0]?.message?.content);
  const parsedJson = JSON.parse(extractJsonObject(content));
  return aiTurnSchema.parse(normalizeAiTurn(parsedJson));
}

// --- 公开接口 ---

export async function streamNarrativeTurn(
  session: GameSession,
  selectedChoice: Choice,
  onDelta: (delta: string) => Promise<void> | void,
): Promise<{ narrative: string[]; mode: GameResponse["mode"] }> {
  const client = createClient();
  if (!client) {
    const fallbackTurn = createFallbackTurn(session, selectedChoice.label, selectedChoice.intent);
    const text = fallbackTurn.narrative.join("\n\n");
    await streamTextFallback(text, onDelta);
    return { narrative: fallbackTurn.narrative, mode: "fallback" };
  }

  try {
    const prompt = buildNarrativePrompt(session, selectedChoice);
    const model = (process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      stream: true,
      max_tokens: 420,
    });

    let text = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        text += delta;
        await onDelta(delta);
      }
    }

    const narrative = toNarrativeParagraphs(text);
    if (!narrative.length) throw new Error("流式正文为空");
    return { narrative, mode: "openai" };
  } catch (error) {
    console.warn("[openai] narrative stream failed, falling back:", error instanceof Error ? error.message : error);
    const fallbackTurn = createFallbackTurn(session, selectedChoice.label, selectedChoice.intent);
    const text = fallbackTurn.narrative.join("\n\n");
    await streamTextFallback(text, onDelta);
    return { narrative: fallbackTurn.narrative, mode: "fallback" };
  }
}

export async function generateAiTurnFromNarrative(
  session: GameSession,
  selectedChoice: Choice,
  narrative: string[],
  preferredMode: GameResponse["mode"],
): Promise<{ turn: AiTurn; mode: GameResponse["mode"] }> {
  const client = createClient();
  if (!client || preferredMode === "fallback") {
    const fallbackTurn = createFallbackTurn(session, selectedChoice.label, selectedChoice.intent);
    return { turn: { ...fallbackTurn, narrative }, mode: "fallback" };
  }

  try {
    const prompt = buildPromptFromNarrative(session, selectedChoice, narrative);
    const parsedTurn = await createStructuredTurnFromPrompt(client, prompt.system, prompt.user);
    return { turn: { ...parsedTurn, narrative }, mode: "openai" };
  } catch (error) {
    console.warn("[openai] structured scene-from-narrative failed:", error instanceof Error ? error.message : error);
    const fallbackTurn = createFallbackTurn(session, selectedChoice.label, selectedChoice.intent);
    return { turn: { ...fallbackTurn, narrative }, mode: "fallback" };
  }
}

export async function generateAiTurn(
  session: GameSession,
  selectedChoice: Choice,
): Promise<{ turn: AiTurn; mode: GameResponse["mode"] }> {
  const client = createClient();
  if (!client) {
    return { turn: createFallbackTurn(session, selectedChoice.label, selectedChoice.intent), mode: "fallback" };
  }

  const prompt = buildPrompt(session, selectedChoice);
  try {
    const parsedTurn = await createStructuredTurnFromPrompt(client, prompt.system, prompt.user);
    return { turn: parsedTurn, mode: "openai" };
  } catch (error) {
    console.warn("[openai] chat completion failed:", error instanceof Error ? error.message : error);
    return { turn: createFallbackTurn(session, selectedChoice.label, selectedChoice.intent), mode: "fallback" };
  }
}

export async function generateChapterSummary(
  session: GameSession,
): Promise<{ summary: ChapterSummaryResponse; mode: GameResponse["mode"] }> {
  const client = createClient();
  if (!client) {
    return { summary: createFallbackChapterSummary(session), mode: "fallback" };
  }

  try {
    const prompt = buildChapterSummaryPrompt(session);
    const response = await createChatCompletion(client, prompt.system, prompt.user);
    const content = extractMessageContent(response.choices[0]?.message?.content);
    const parsedJson = JSON.parse(extractJsonObject(content));
    const validated = chapterSummaryResponseSchema.parse(parsedJson);
    return { summary: validated, mode: "openai" };
  } catch (error) {
    console.warn("[openai] chapter summary failed:", error instanceof Error ? error.message : error);
    return { summary: createFallbackChapterSummary(session), mode: "fallback" };
  }
}
