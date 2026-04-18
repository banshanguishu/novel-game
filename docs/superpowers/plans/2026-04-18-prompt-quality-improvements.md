# Prompt Quality Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把整份世界设定包注入 LLM prompt、移除 fallback 兜底、修复选项雷同问题。

**Architecture:** Prompt 层改造（`openai.ts`）+ 类型扩展（history 新增 rejectedChoices）+ Fallback 彻底移除（删除 fallback.ts、清理所有 fallback 分支、去掉 mode 字段）+ 前端加"重试本回合"机制。每步改动保持独立可编译。

**Tech Stack:** TypeScript, React 18, Express, Zod, OpenAI SDK (DashScope/qwen3.5-plus)

---

## 文件结构总览

### 删除文件

| 文件 | 原因 |
|------|------|
| `server/src/game/fallback.ts` | 兜底剧情无法承接 AI 动态剧情，全面移除 |

### 修改文件

| 文件 | 改动范围 |
|------|---------|
| `server/src/types.ts` | history 新增 `rejectedChoices`；删除 `GameResponse.mode` |
| `client/src/types.ts` | 与 server 同步 |
| `server/src/game/engine.ts` | `applyTurn` 计算 `rejectedChoices`；签名去掉 `mode` 参数 |
| `server/src/game/openai.ts` | worldDoc 注入所有 prompt、新增选项历史上下文、多样性模板；移除 fallback 分支、`streamTextFallback`、`sleep`；返回类型去掉 `mode` |
| `server/src/index.ts` | 移除 mode 使用、简化 health check、清理 `generateAiTurnFromNarrative` 参数 |
| `client/src/App.tsx` | 移除引擎模式标签；新增"重试本回合"按钮与 `lastChoiceId` 状态 |

---

## Task 1: 服务端类型扩展 — 添加 rejectedChoices

**Files:**
- Modify: `server/src/types.ts`

- [ ] **Step 1: 修改 history 项的类型**

编辑 `server/src/types.ts`，找到 `GameSession` 接口中的 `history` 定义，将其整体替换。完整替换如下：

```ts
  history: Array<{
    turn: number;
    playerChoice: string;
    rejectedChoices: string[];
    summary: string;
  }>;
```

文件中这段代码原本是：

```ts
  history: Array<{
    turn: number;
    playerChoice: string;
    summary: string;
  }>;
```

保留其他字段和接口不变。

- [ ] **Step 2: 验证编译（会报错，意料之中）**

Run: `cd "D:/DBC Projects/novel-game/server" && npx tsc --noEmit 2>&1 | head -20`

Expected: 报 engine.ts / openai.ts 中使用 history 但没有 rejectedChoices 的错误。这是预期的 —— 下一个 Task 修复 engine.ts。

- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts
git commit -m "feat: add rejectedChoices field to history items in GameSession"
```

---

## Task 2: 客户端类型同步

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: 同步 history 字段**

编辑 `client/src/types.ts`，找到 `GameSession.history` 定义，将其整体替换为：

```ts
  history: Array<{
    turn: number;
    playerChoice: string;
    rejectedChoices: string[];
    summary: string;
  }>;
```

其他字段保持不变。

- [ ] **Step 2: Commit**

```bash
git add client/src/types.ts
git commit -m "feat: sync client types with rejectedChoices field"
```

---

## Task 3: Engine 计算 rejectedChoices

**Files:**
- Modify: `server/src/game/engine.ts`

- [ ] **Step 1: 修改 applyTurn 在构造 history 项时填充 rejectedChoices**

编辑 `server/src/game/engine.ts`，找到 `applyTurn` 函数中构造 `history` 的部分（当前是直接在 `nextSession` 对象字面量中调用 `.slice(-12)` 那段）。

找到这段代码（大约在当前文件的第 117-124 行）：

```ts
    history: [
      ...session.history,
      {
        turn: session.state.world.turn,
        playerChoice: selectedChoice.label,
        summary: aiTurn.summary,
      },
    ].slice(-12),
```

替换为：

```ts
    history: [
      ...session.history,
      {
        turn: session.state.world.turn,
        playerChoice: selectedChoice.label,
        rejectedChoices: session.availableChoices
          .filter((c) => c.id !== selectedChoice.id)
          .map((c) => c.label),
        summary: aiTurn.summary,
      },
    ].slice(-12),
```

- [ ] **Step 2: 验证编译**

Run: `cd "D:/DBC Projects/novel-game/server" && npx tsc --noEmit 2>&1 | head -20`

Expected: engine.ts 中这处错误消失。可能还有其他因为 rejectedChoices 引发的 schema / opening.ts 错误 —— 检查 opening.ts 的初始 session 是否需要改（history 初始是空数组 `history: []`，不需要初始值，不会有错）。实际只剩 openai.ts 和 fallback.ts 等跟本次无关的错误（那些后续 Task 会清理）。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/engine.ts
git commit -m "feat: compute rejectedChoices when recording history in applyTurn"
```

---

## Task 4: openai.ts — 注入 worldDoc、选项历史、多样性模板

**Files:**
- Modify: `server/src/game/openai.ts`

本 Task 只修改 prompt 构建逻辑；保留现有的 fallback 调用（下一个 Task 再彻底移除 fallback）。

- [ ] **Step 1: 删除 worldSummary 常量**

编辑 `server/src/game/openai.ts`。找到文件开头的 `worldSummary` 常量声明（当前第 15-23 行）：

```ts
const worldSummary = [
  "世界：纯架空大雍王朝，封建乱世，中央皇权衰弱，藩镇与世家并立。",
  "主角：固定男主，现代社畜魂穿流民，靠诗词、治理思维、民生常识与权谋见识逆袭。",
  "路线：当前只做专注权谋线，成长轨迹为流民 -> 文人/小吏 -> 朝堂重臣 -> 主帅 -> 女帝夫君。",
  "女帝：萧清晏，聪慧克制，不恋爱脑，始终以天下与皇权为重。",
  "文风：古风白话，简洁有画面感，不能出现明显现代词汇泛滥。",
  "剧情约束：不能一步登天，每一步推进都要有因果与代价。",
  "输出目标：每回合必须让主角更接近县衙、军伍、世家、朝堂、皇权等核心权力节点。",
].join("\n");
```

将其整段删除。

`worldDoc` 常量（上方几行）保留不动，后续 prompt 会用它。

- [ ] **Step 2: 新增选项历史上下文构建函数**

在 `buildMemoryContext` 函数结束后、`buildPrompt` 函数开始之前，添加一个新函数：

```ts
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
```

- [ ] **Step 3: 改造 buildPrompt —— 注入 worldDoc、选项历史、多样性模板**

找到 `buildPrompt` 函数（当前大约第 79 行开始）。把整个函数替换为：

```ts
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
```

- [ ] **Step 4: 改造 buildNarrativePrompt**

找到 `buildNarrativePrompt` 函数（原大约第 116 行）。把整个函数替换为：

```ts
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
```

- [ ] **Step 5: 改造 buildPromptFromNarrative**

找到 `buildPromptFromNarrative` 函数（原大约第 145 行）。把整个函数替换为：

```ts
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
```

- [ ] **Step 6: 改造 buildChapterSummaryPrompt**

找到 `buildChapterSummaryPrompt` 函数（原大约第 171 行）。把整个函数替换为：

```ts
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
```

- [ ] **Step 7: 验证编译**

Run: `cd "D:/DBC Projects/novel-game/server" && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 8: Commit**

```bash
git add server/src/game/openai.ts
git commit -m "feat: inject full worldDoc into all prompts, add recent choices context and diversity template"
```

---

## Task 5: 移除 Fallback 与 mode 字段（完整清理）

本 Task 是一组必须原子完成的改动：删除 `fallback.ts`、清理 `openai.ts` 的 fallback 分支、移除 `GameResponse.mode` 字段、同步 `index.ts` 与客户端类型。

**Files:**
- Delete: `server/src/game/fallback.ts`
- Modify: `server/src/game/openai.ts`
- Modify: `server/src/types.ts`
- Modify: `client/src/types.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/game/engine.ts`

- [ ] **Step 1: 删除 fallback.ts 文件**

Run: `rm "D:/DBC Projects/novel-game/server/src/game/fallback.ts"`

- [ ] **Step 2: 修改 server/src/types.ts —— 移除 GameResponse.mode 字段**

编辑 `server/src/types.ts`，找到 `GameResponse` 接口：

```ts
export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  mode: "openai" | "fallback";
  chapterTransition?: ChapterTransitionData;
}
```

替换为：

```ts
export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  chapterTransition?: ChapterTransitionData;
}
```

- [ ] **Step 3: 修改 client/src/types.ts —— 同步移除 mode 字段**

编辑 `client/src/types.ts`，把 `GameResponse` 接口从：

```ts
export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  mode: "openai" | "fallback";
  chapterTransition?: ChapterTransitionData;
}
```

替换为：

```ts
export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  chapterTransition?: ChapterTransitionData;
}
```

- [ ] **Step 4: 重写 server/src/game/openai.ts —— 移除所有 fallback 分支**

这一步涉及多处改动，分几个编辑：

**4a. 删除顶部的 fallback 导入**

找到文件开头附近的这一行：

```ts
import { createFallbackTurn, createFallbackChapterSummary } from "./fallback.js";
```

将其删除。

**4b. 删除 sleep 和 streamTextFallback 辅助函数**

找到这段代码：

```ts
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
```

将其整段删除。

**4c. 重写 streamNarrativeTurn**

找到 `streamNarrativeTurn` 函数（它当前是 `export async function streamNarrativeTurn`），整段替换为：

```ts
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
  const stream = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      stream: true,
      max_tokens: 420,
    },
    noThinking,
  );

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
```

**4d. 重写 generateAiTurnFromNarrative**

找到 `generateAiTurnFromNarrative` 函数，整段替换为：

```ts
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
  const parsedTurn = await createStructuredTurnFromPrompt(client, prompt.system, prompt.user);
  return { turn: { ...parsedTurn, narrative } };
}
```

注意：签名去掉了 `preferredMode` 参数。

**4e. 重写 generateAiTurn**

找到 `generateAiTurn` 函数，整段替换为：

```ts
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
```

**4f. 重写 generateChapterSummary**

找到 `generateChapterSummary` 函数，整段替换为：

```ts
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
```

**4g. 清理 imports 中未使用的类型**

检查文件顶部的 `import type` 语句，把现在用不到的移除。例如 `GameResponse` 如果没被引用到（它本来只在返回类型的 `mode` 部分出现），就从 import 删掉。

打开文件顶部查看，找到这一行：

```ts
import type { Choice, GameResponse, GameSession, NpcProfile } from "../types.js";
```

改为：

```ts
import type { Choice, GameSession, NpcProfile } from "../types.js";
```

- [ ] **Step 5: 更新 server/src/game/engine.ts —— applyTurn 去掉 mode 参数**

编辑 `server/src/game/engine.ts`。

**5a. 更新 imports（如果 GameResponse 变成孤立类型，暂时保留，因为 `ApplyTurnResult` 可能还需要它——看下一步）**

**5b. 修改 ApplyTurnResult 和 applyTurn 签名**

找到这段代码（大约第 42-53 行）：

```ts
export interface ApplyTurnResult {
  response: GameResponse;
  needsChapterTransition: boolean;
  metricsBeforeTurn: Metrics;
}

export function applyTurn(
  session: GameSession,
  selectedChoice: Choice,
  aiTurn: AiTurn,
  mode: GameResponse["mode"],
): ApplyTurnResult {
```

替换为：

```ts
export interface ApplyTurnResult {
  response: GameResponse;
  needsChapterTransition: boolean;
  metricsBeforeTurn: Metrics;
}

export function applyTurn(
  session: GameSession,
  selectedChoice: Choice,
  aiTurn: AiTurn,
): ApplyTurnResult {
```

（去掉 `mode: GameResponse["mode"]` 参数）

**5c. 修改 applyTurn 末尾的 return**

找到 `applyTurn` 函数末尾的这段：

```ts
  return {
    response: { scene, session: nextSession, mode },
    needsChapterTransition,
    metricsBeforeTurn,
  };
```

替换为：

```ts
  return {
    response: { scene, session: nextSession },
    needsChapterTransition,
    metricsBeforeTurn,
  };
```

- [ ] **Step 6: 更新 server/src/index.ts —— 清理 mode 使用、简化 health check、调用签名对齐**

编辑 `server/src/index.ts`。

**6a. 简化 /api/health**

找到：

```ts
app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    mode: process.env.OPENAI_API_KEY ? "openai-configured" : "fallback-only",
  });
});
```

替换为：

```ts
app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
});
```

**6b. 简化 /api/game/start 返回体**

找到：

```ts
  const session = createInitialSession(parsed.data.protagonistName || "林墨");
  const payload: GameResponse = {
    scene: createOpeningScene(session),
    session,
    mode: process.env.OPENAI_API_KEY ? "openai" : "fallback",
  };

  response.json(payload);
```

替换为：

```ts
  const session = createInitialSession(parsed.data.protagonistName || "林墨");
  const payload: GameResponse = {
    scene: createOpeningScene(session),
    session,
  };

  response.json(payload);
```

**6c. 更新 /api/game/advance 中 applyTurn 的调用**

找到：

```ts
    const selectedChoice = findChoice(parsed.data.session, parsed.data.choiceId);
    const generated = await generateAiTurn(parsed.data.session, selectedChoice);
    const result = applyTurn(parsed.data.session, selectedChoice, generated.turn, generated.mode);
```

替换为：

```ts
    const selectedChoice = findChoice(parsed.data.session, parsed.data.choiceId);
    const generated = await generateAiTurn(parsed.data.session, selectedChoice);
    const result = applyTurn(parsed.data.session, selectedChoice, generated.turn);
```

**6d. 更新 /api/game/advance/stream 中的流式调用**

找到：

```ts
    const streamed = await streamNarrativeTurn(parsed.data.session, selectedChoice, async (delta) => {
      writeSse(response, "narrative_delta", { delta });
    });

    const generated = await generateAiTurnFromNarrative(
      parsed.data.session,
      selectedChoice,
      streamed.narrative,
      streamed.mode,
    );

    const result = applyTurn(parsed.data.session, selectedChoice, generated.turn, generated.mode);
```

替换为：

```ts
    const streamed = await streamNarrativeTurn(parsed.data.session, selectedChoice, async (delta) => {
      writeSse(response, "narrative_delta", { delta });
    });

    const generated = await generateAiTurnFromNarrative(
      parsed.data.session,
      selectedChoice,
      streamed.narrative,
    );

    const result = applyTurn(parsed.data.session, selectedChoice, generated.turn);
```

**6e. 错误处理 HTTP 状态码调整**

找到 `/api/game/advance` 末尾的 catch 块：

```ts
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "剧情推进失败。");
  }
```

替换为：

```ts
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : "剧情推进失败。");
  }
```

（AI 调用失败属于服务端/上游问题，用 500 更合适。流式端点的 SSE error 事件已经够用，不改。）

- [ ] **Step 7: 验证服务端编译**

Run: `cd "D:/DBC Projects/novel-game/server" && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 8: 验证客户端编译（会有 App.tsx 的 mode 相关错误）**

Run: `cd "D:/DBC Projects/novel-game/client" && npx tsc --noEmit 2>&1 | head -20`

Expected: 报 `App.tsx` 中 `mode` / `setMode` / `result.mode` 相关的错误。这是预期的，由 Task 6 修复。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove fallback mode and mode field entirely"
```

---

## Task 6: 前端 —— 移除模式标签、新增"重试本回合"

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: 完整替换 App.tsx**

打开 `client/src/App.tsx`，把整个文件替换为：

```tsx
import { useState } from "react";
import { advanceGameStream, startGame } from "./api";
import type { ChapterTransitionData, Choice, GameResponse, GameSession, Metrics } from "./types";

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-cedar/10 bg-white/70 px-4 py-3 shadow-sm backdrop-blur">
      <div className="text-xs uppercase tracking-[0.2em] text-cedar/60">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function ChoiceButton({
  choice,
  disabled,
  onClick,
}: {
  choice: Choice;
  disabled: boolean;
  onClick: (choiceId: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(choice.id)}
      className="w-full rounded-2xl border border-ember/20 bg-ember/5 px-5 py-4 text-left text-base text-ink transition hover:border-ember/40 hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {choice.label}
    </button>
  );
}

function NarrativeSkeleton() {
  return (
    <div className="mt-8 space-y-5 animate-pulse">
      <div className="h-5 rounded bg-cedar/10 w-full" />
      <div className="h-5 rounded bg-cedar/10 w-11/12" />
      <div className="h-5 rounded bg-cedar/10 w-full" />
      <div className="h-5 rounded bg-cedar/10 w-9/12" />
      <div className="h-5 rounded bg-cedar/10 w-full" />
      <div className="h-5 rounded bg-cedar/10 w-10/12" />
    </div>
  );
}

const METRIC_LABELS: Record<keyof Metrics, string> = {
  reputation: "名声",
  imperialFavor: "帝心",
  peopleSupport: "民心",
  intrigue: "权谋",
  military: "兵势",
  wealth: "财富",
};

function ChapterTransitionPanel({
  data,
  onContinue,
}: {
  data: ChapterTransitionData;
  onContinue: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-ember/20 bg-parchment/95 p-6 shadow-card backdrop-blur md:p-8">
      <div className="text-sm uppercase tracking-[0.3em] text-ember/70">章节完成</div>
      <h2 className="mt-3 font-display text-3xl font-bold text-ink">
        {data.completedChapter.name}
      </h2>
      <p className="mt-4 text-base leading-8 text-cedar/85">{data.completedChapter.summary}</p>

      {data.completedChapter.keyEvents.length > 0 && (
        <div className="mt-6">
          <div className="text-sm uppercase tracking-[0.2em] text-cedar/55">关键事件</div>
          <ul className="mt-2 space-y-1 text-sm text-cedar/80">
            {data.completedChapter.keyEvents.map((event, i) => (
              <li key={i}>· {event}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <div className="text-sm uppercase tracking-[0.2em] text-cedar/55">属性变化</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(METRIC_LABELS) as Array<keyof Metrics>).map((key) => {
            const before = data.metricsComparison.before[key];
            const after = data.metricsComparison.after[key];
            const diff = after - before;
            return (
              <div key={key} className="rounded-xl border border-cedar/10 bg-white/60 px-3 py-2">
                <div className="text-xs text-cedar/55">{METRIC_LABELS[key]}</div>
                <div className="mt-1 text-lg font-semibold text-ink">
                  {after}
                  {diff !== 0 && (
                    <span className={`ml-1 text-sm ${diff > 0 ? "text-moss" : "text-ember"}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.npcChanges.length > 0 && (
        <div className="mt-6">
          <div className="text-sm uppercase tracking-[0.2em] text-cedar/55">人物关系变化</div>
          <div className="mt-2 space-y-2">
            {data.npcChanges.map((npc, i) => (
              <div key={i} className="rounded-xl border border-cedar/10 bg-white/60 px-3 py-2 text-sm text-cedar/80">
                <span className="font-semibold text-ink">{npc.name}</span>
                ：{npc.oldAttitude} → {npc.newAttitude}
                <span className="ml-2 text-cedar/60">（{npc.relationship}）</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 w-full rounded-2xl bg-ink px-5 py-3 text-white transition hover:bg-cedar"
      >
        进入{data.nextChapter.name}
      </button>
    </div>
  );
}

export default function App() {
  const [heroName, setHeroName] = useState("林墨");
  const [session, setSession] = useState<GameSession | null>(null);
  const [scene, setScene] = useState<GameResponse["scene"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamedNarrative, setStreamedNarrative] = useState("");
  const [chapterTransition, setChapterTransition] = useState<ChapterTransitionData | null>(null);
  const [lastChoiceId, setLastChoiceId] = useState<string | null>(null);

  const metrics = session?.state.metrics ?? {
    reputation: 0,
    imperialFavor: 0,
    peopleSupport: 0,
    intrigue: 0,
    military: 0,
    wealth: 0,
  };

  async function handleStart() {
    setLoading(true);
    setError(null);
    setStreamedNarrative("");

    try {
      const result = await startGame(heroName.trim() || "林墨");
      setSession(result.session);
      setScene(result.scene);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "启动失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvance(choiceId: string) {
    if (!session) {
      return;
    }

    setLoading(true);
    setError(null);
    setStreamedNarrative("");
    setChapterTransition(null);
    setLastChoiceId(choiceId);

    try {
      const result = await advanceGameStream(session, choiceId, {
        onNarrativeDelta: (delta) => {
          setStreamedNarrative((current) => current + delta);
        },
        onChapterTransition: (data) => {
          setChapterTransition(data);
        },
        onComplete: (payload) => {
          setSession(payload.session);
          setScene(payload.scene);
        },
      });

      setSession(result.session);
      setScene(result.scene);
      if (result.chapterTransition) {
        setChapterTransition(result.chapterTransition);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "推进失败");
    } finally {
      setStreamedNarrative("");
      setLoading(false);
    }
  }

  function handleChapterContinue() {
    setChapterTransition(null);
  }

  function handleRetry() {
    if (lastChoiceId) {
      handleAdvance(lastChoiceId);
    }
  }

  const hasStreamedText = loading && streamedNarrative.trim();
  const displayedNarrative = hasStreamedText
    ? streamedNarrative
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : scene?.narrative ?? [];

  return (
    <main className="min-h-screen px-4 py-8 text-ink md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[32px] border border-cedar/10 bg-parchment/85 shadow-card backdrop-blur">
          <div className="bg-[linear-gradient(135deg,rgba(138,59,18,0.12),transparent_55%)] px-6 py-8 md:px-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.3em] text-ember/70">MVP / 强主线 / 权谋线</div>
                <h1 className="mt-3 font-display text-4xl font-bold text-ink md:text-5xl">大雍逆袭录</h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-cedar/80 md:text-base">
                  现代社畜魂穿乱世流民，以诗词、谋略与民心为阶，步步走向朝堂中枢。这一版聚焦文字剧情与按钮选项推进。
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-cedar/10 bg-white/70 p-5 shadow-card backdrop-blur">
            <div className="text-sm uppercase tracking-[0.3em] text-cedar/60">角色面板</div>
            <div className="mt-4 rounded-3xl bg-parchment px-5 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-cedar/55">主角</div>
              <div className="mt-2 text-3xl font-semibold">{session?.protagonistName ?? heroName}</div>
              <div className="mt-3 text-sm text-cedar/75">
                固定男主，当前路线为专注权谋。关键状态由后端引擎裁定，模型仅提供建议。
              </div>
            </div>

            {!session ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <div className="mb-2 text-sm text-cedar/75">主角姓名</div>
                  <input
                    value={heroName}
                    onChange={(event) => setHeroName(event.target.value)}
                    className="w-full rounded-2xl border border-cedar/15 bg-white px-4 py-3 outline-none transition focus:border-ember/40"
                    placeholder="林墨"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={loading}
                  className="w-full rounded-2xl bg-ink px-5 py-3 text-white transition hover:bg-cedar disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "正在生成开场..." : "开始游戏"}
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                <MetricCard label="名声" value={metrics.reputation} />
                <MetricCard label="帝心" value={metrics.imperialFavor} />
                <MetricCard label="民心" value={metrics.peopleSupport} />
                <MetricCard label="权谋" value={metrics.intrigue} />
                <MetricCard label="兵势" value={metrics.military} />
                <MetricCard label="财富" value={metrics.wealth} />
              </div>
            )}

            {session ? (
              <div className="mt-5 rounded-3xl border border-cedar/10 bg-parchment/80 px-5 py-4 text-sm text-cedar/80">
                <div>回合：第 {session.state.world.turn} 回</div>
                <div className="mt-2">阶段：{session.state.world.phase}</div>
                <div className="mt-2">章节：{session.state.world.chapter}</div>
                <div className="mt-2">皇权稳固：{session.state.world.imperialAuthority}</div>
                <div className="mt-2">统一进度：{session.state.world.factionProgress}</div>
              </div>
            ) : null}
          </aside>

          <section className="rounded-[28px] border border-cedar/10 bg-white/75 p-6 shadow-card backdrop-blur md:p-8">
            {chapterTransition ? (
              <ChapterTransitionPanel data={chapterTransition} onContinue={handleChapterContinue} />
            ) : scene ? (
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-ember/65">{scene.chapter}</div>
                <h2 className="mt-2 font-display text-4xl font-bold">{scene.title}</h2>
                <div className="mt-3 text-sm text-cedar/70">{scene.location}</div>

                {loading && (
                  <div className="mt-4 inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs tracking-[0.2em] text-ember/70">
                    剧情推演中
                  </div>
                )}

                {loading && !hasStreamedText ? (
                  <NarrativeSkeleton />
                ) : (
                  <div className="mt-8 space-y-5 text-lg leading-9 text-ink/95">
                    {displayedNarrative.map((paragraph, index) => (
                      <p key={`${scene.title}-${index}`}>{paragraph}</p>
                    ))}
                  </div>
                )}

                <div className="mt-10">
                  <div className="mb-4 text-sm uppercase tracking-[0.25em] text-cedar/55">你的行动</div>
                  {loading ? (
                    <div className="rounded-2xl border border-dashed border-cedar/15 bg-parchment/40 px-5 py-6 text-center text-sm text-cedar/50">
                      命运的齿轮开始转动...
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {scene.choices.map((choice) => (
                        <ChoiceButton
                          key={choice.id}
                          choice={choice}
                          disabled={loading}
                          onClick={handleAdvance}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-dashed border-cedar/20 bg-parchment/50 px-6 text-center">
                <div className="max-w-xl">
                  <div className="text-sm uppercase tracking-[0.3em] text-cedar/55">序章待启</div>
                  <h2 className="mt-4 font-display text-4xl font-semibold">从流民开始</h2>
                  <p className="mt-4 text-base leading-8 text-cedar/80">
                    这一版不做自由输入，只保留剧情文本与按钮分支。点击左侧开始后，系统会初始化开场场景，并把后续每一步状态交给引擎管理。
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700">
            <div>{error}</div>
            {lastChoiceId && session ? (
              <button
                type="button"
                onClick={handleRetry}
                disabled={loading}
                className="mt-3 rounded-2xl border border-red-300 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                重试本回合
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
```

主要改动说明：
- 去掉 `mode` state、去掉 header 中的"引擎模式"标签
- 新增 `lastChoiceId` state，在 `handleAdvance` 开始时记录
- 新增 `handleRetry` 函数
- 错误提示面板里新增"重试本回合"按钮（仅当有 `lastChoiceId` 且 session 存在时显示）
- 移除了 `handleStart` / `handleAdvance` 中的 `setMode` 调用（mode 不再存在）

- [ ] **Step 2: 验证客户端编译**

Run: `cd "D:/DBC Projects/novel-game/client" && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 3: 验证完整构建**

Run: `cd "D:/DBC Projects/novel-game" && npm run build 2>&1 | tail -15`

Expected: 服务端 + 客户端构建均成功。

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: remove mode UI, add retry button after request failures"
```

---

## Task 7: 端到端验证

- [ ] **Step 1: 启动开发服务器**

Run: `cd "D:/DBC Projects/novel-game" && timeout 15 npm run dev 2>&1 | tail -30 || true`

Expected: 看到服务端监听 3001、Vite 监听 5173 的日志输出（timeout 15 秒后会终止进程，属于预期行为）。若有启动错误则需要回头排查。

- [ ] **Step 2: 浏览器手动验证（由用户测试）**

让用户在本地执行 `npm run dev`，打开 `http://localhost:5173` 进行以下验证：

1. 开始游戏，确认开场正常
2. 连续推进 2-3 回合，观察选项是否比之前多样化（不再全是 power/people/caution 三元模板）
3. 故意断开服务器后端，点击选项看是否出现"重试本回合"按钮；重启后端，点击重试是否能正常推进
4. 若触发章节转换，确认阶段总结面板正常
5. 确认界面上不再出现"引擎模式：OpenAI 在线生成"的标签

本步骤不需要自动化，由用户观察报告。
