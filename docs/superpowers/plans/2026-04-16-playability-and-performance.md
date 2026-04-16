# 大雍逆袭录 可玩性与性能优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过章节系统、NPC 档案、属性影响、上下文压缩和前端交互优化，全面提升游戏可玩性与性能体验。

**Architecture:** 渐进式重构。先扩展类型与数据层（types, chapters, npcs, metrics），再改造引擎层（engine），然后改造 prompt 与 schema 层（openai, schema），接着适配 fallback，最后做 API 层和前端层。每步可独立编译和测试。

**Tech Stack:** TypeScript, React 18, Express, Zod, OpenAI SDK, Tailwind CSS, SSE

---

## 文件结构总览

### 新建文件

| 文件 | 职责 |
|------|------|
| `server/src/game/chapters.ts` | 章节配置表 + 转换判定逻辑 |
| `server/src/game/npcs.ts` | NPC 初始档案列表 |
| `server/src/game/metrics.ts` | 属性等级描述映射（阈值 → prompt 文案） |

### 修改文件

| 文件 | 改动范围 |
|------|---------|
| `server/src/types.ts` | 新增 NpcProfile, ChapterSummary, StoryMemory 类型；扩展 GameSession.state |
| `client/src/types.ts` | 与 server types 保持同步 |
| `server/src/game/engine.ts` | 替换 derivePhase/deriveChapter，新增章节转换判定 |
| `server/src/game/schema.ts` | 新增章节总结 Zod schema |
| `server/src/game/openai.ts` | 预加载世界设定、移除需求文档、注入属性/NPC/记忆上下文、新增章节总结生成 |
| `server/src/game/opening.ts` | 初始 session 适配新字段 |
| `server/src/game/fallback.ts` | 按章节 id 索引模板，适配新 AiTurn 结构 |
| `server/src/index.ts` | SSE 新增 chapter_transition 事件，章节转换异步流程 |
| `client/src/api.ts` | 处理 chapter_transition SSE 事件 |
| `client/src/App.tsx` | loading 骨架屏 + 阶段总结面板 |

---

## Task 1: 扩展服务端类型定义

**Files:**
- Modify: `server/src/types.ts`

- [ ] **Step 1: 新增 NpcProfile、ChapterSummary、StoryMemory 类型，扩展 GameSession**

将 `server/src/types.ts` 的完整内容替换为：

```ts
export type ChoiceIntent = "power" | "people" | "caution" | "emotion" | "action";

export interface Choice {
  id: string;
  label: string;
  intent: ChoiceIntent;
}

export interface StoryScene {
  chapter: string;
  title: string;
  location: string;
  narrative: string[];
  choices: Choice[];
}

export interface Metrics {
  reputation: number;
  imperialFavor: number;
  peopleSupport: number;
  intrigue: number;
  military: number;
  wealth: number;
}

export interface NpcProfile {
  id: string;
  name: string;
  title: string;
  attitude: string;
  relationship: string;
  firstAppearChapter: string;
  visible: boolean;
}

export interface ChapterSummary {
  chapterId: string;
  summary: string;
  keyEvents: string[];
}

export interface StoryMemory {
  relationships: Array<{
    npcId: string;
    description: string;
  }>;
  unresolvedHooks: string[];
}

export interface WorldState {
  turn: number;
  phase: string;
  chapter: string;
  chapterId: string;
  chapterTurn: number;
  routeFocus: string;
  imperialAuthority: number;
  factionProgress: number;
}

export interface GameSession {
  protagonistName: string;
  route: "权谋";
  state: {
    metrics: Metrics;
    world: WorldState;
    flags: string[];
    npcs: NpcProfile[];
    chapterSummaries: ChapterSummary[];
    storyMemory: StoryMemory;
  };
  history: Array<{
    turn: number;
    playerChoice: string;
    summary: string;
  }>;
  availableChoices: Choice[];
}

export interface ChapterTransitionData {
  completedChapter: {
    id: string;
    name: string;
    summary: string;
    keyEvents: string[];
  };
  metricsComparison: {
    before: Metrics;
    after: Metrics;
  };
  npcChanges: Array<{
    name: string;
    oldAttitude: string;
    newAttitude: string;
    relationship: string;
  }>;
  nextChapter: {
    id: string;
    name: string;
  };
}

export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  mode: "openai" | "fallback";
  chapterTransition?: ChapterTransitionData;
}
```

- [ ] **Step 2: 验证类型编译通过**

Run: `cd server && npx tsc --noEmit 2>&1 | head -20`

Expected: 会有编译错误（其他文件尚未适配新类型），但 `types.ts` 本身无语法错误。后续 Task 逐步修复。

- [ ] **Step 3: Commit**

```bash
git add server/src/types.ts
git commit -m "feat: extend server types with NPC, chapter summary, story memory, and chapter transition"
```

---

## Task 2: 同步客户端类型定义

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: 将客户端 types.ts 与服务端保持一致**

将 `client/src/types.ts` 的完整内容替换为：

```ts
export type ChoiceIntent =
  | "power"
  | "people"
  | "caution"
  | "emotion"
  | "action";

export interface Choice {
  id: string;
  label: string;
  intent: ChoiceIntent;
}

export interface StoryScene {
  chapter: string;
  title: string;
  location: string;
  narrative: string[];
  choices: Choice[];
}

export interface Metrics {
  reputation: number;
  imperialFavor: number;
  peopleSupport: number;
  intrigue: number;
  military: number;
  wealth: number;
}

export interface NpcProfile {
  id: string;
  name: string;
  title: string;
  attitude: string;
  relationship: string;
  firstAppearChapter: string;
  visible: boolean;
}

export interface ChapterSummary {
  chapterId: string;
  summary: string;
  keyEvents: string[];
}

export interface StoryMemory {
  relationships: Array<{
    npcId: string;
    description: string;
  }>;
  unresolvedHooks: string[];
}

export interface WorldState {
  turn: number;
  phase: string;
  chapter: string;
  chapterId: string;
  chapterTurn: number;
  routeFocus: string;
  imperialAuthority: number;
  factionProgress: number;
}

export interface GameSession {
  protagonistName: string;
  route: "权谋";
  state: {
    metrics: Metrics;
    world: WorldState;
    flags: string[];
    npcs: NpcProfile[];
    chapterSummaries: ChapterSummary[];
    storyMemory: StoryMemory;
  };
  history: Array<{
    turn: number;
    playerChoice: string;
    summary: string;
  }>;
  availableChoices: Choice[];
}

export interface ChapterTransitionData {
  completedChapter: {
    id: string;
    name: string;
    summary: string;
    keyEvents: string[];
  };
  metricsComparison: {
    before: Metrics;
    after: Metrics;
  };
  npcChanges: Array<{
    name: string;
    oldAttitude: string;
    newAttitude: string;
    relationship: string;
  }>;
  nextChapter: {
    id: string;
    name: string;
  };
}

export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  mode: "openai" | "fallback";
  chapterTransition?: ChapterTransitionData;
}
```

- [ ] **Step 2: 验证客户端类型编译**

Run: `cd client && npx tsc --noEmit 2>&1 | head -20`

Expected: 可能有引用新字段的错误，后续 Task 修复。

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat: sync client types with server — NPC, chapter summary, story memory"
```

---

## Task 3: 创建章节配置模块

**Files:**
- Create: `server/src/game/chapters.ts`

- [ ] **Step 1: 创建章节配置表和转换判定函数**

创建 `server/src/game/chapters.ts`：

```ts
import type { Metrics } from "../types.js";

export interface ChapterTransitionCondition {
  type: "metric" | "flag";
  field?: keyof Metrics;
  threshold?: number;
  flag?: string;
}

export interface ChapterConfig {
  id: string;
  name: string;
  minTurns: number;
  maxTurns: number;
  transitionConditions: ChapterTransitionCondition[];
}

export const CHAPTERS: ChapterConfig[] = [
  {
    id: "chapter_1",
    name: "草根求生",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "reputation", threshold: 15 },
      { type: "flag", flag: "entered_literati_circle" },
    ],
  },
  {
    id: "chapter_2",
    name: "文人扬名",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "intrigue", threshold: 30 },
      { type: "flag", flag: "noticed_supply_corruption" },
    ],
  },
  {
    id: "chapter_3",
    name: "朝堂博弈",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "imperialFavor", threshold: 25 },
      { type: "flag", flag: "summoned_to_capital" },
    ],
  },
  {
    id: "chapter_4",
    name: "平定天下",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "military", threshold: 40 },
      { type: "flag", flag: "military_command_granted" },
    ],
  },
  {
    id: "chapter_5",
    name: "盛世开创",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [],
  },
];

export function getChapterConfig(chapterId: string): ChapterConfig {
  const config = CHAPTERS.find((c) => c.id === chapterId);
  if (!config) {
    throw new Error(`未知章节: ${chapterId}`);
  }
  return config;
}

export function getNextChapterId(currentChapterId: string): string | null {
  const index = CHAPTERS.findIndex((c) => c.id === currentChapterId);
  if (index < 0 || index >= CHAPTERS.length - 1) {
    return null;
  }
  return CHAPTERS[index + 1].id;
}

export function shouldTransitionChapter(
  chapterId: string,
  chapterTurn: number,
  metrics: Metrics,
  flags: string[],
): boolean {
  const config = getChapterConfig(chapterId);
  const nextId = getNextChapterId(chapterId);

  if (!nextId) {
    return false;
  }

  if (chapterTurn >= config.maxTurns) {
    return true;
  }

  if (chapterTurn < config.minTurns) {
    return false;
  }

  return config.transitionConditions.some((condition) => {
    if (condition.type === "metric" && condition.field && condition.threshold !== undefined) {
      return metrics[condition.field] >= condition.threshold;
    }
    if (condition.type === "flag" && condition.flag) {
      return flags.includes(condition.flag);
    }
    return false;
  });
}
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/chapters.ts 2>&1`

Expected: 无错误（该文件仅依赖 `types.ts` 中的 `Metrics` 类型）。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/chapters.ts
git commit -m "feat: add chapter config with min/max turns and transition conditions"
```

---

## Task 4: 创建 NPC 档案模块

**Files:**
- Create: `server/src/game/npcs.ts`

- [ ] **Step 1: 创建 NPC 初始档案列表**

从 `世界设定包.md` 提取核心人物，创建 `server/src/game/npcs.ts`：

```ts
import type { NpcProfile } from "../types.js";

export const INITIAL_NPCS: NpcProfile[] = [
  {
    id: "xiao_qingyan",
    name: "萧清晏",
    title: "大雍女帝",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_3",
    visible: false,
  },
  {
    id: "su_wanqing",
    name: "苏晚卿",
    title: "民间才女",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_1",
    visible: false,
  },
  {
    id: "zhou_hu",
    name: "周虎",
    title: "底层军卒",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_1",
    visible: false,
  },
  {
    id: "li_taifu",
    name: "李太傅",
    title: "忠心皇室的老臣",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_2",
    visible: false,
  },
  {
    id: "beipingwang",
    name: "北平王",
    title: "北方藩镇之主",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_3",
    visible: false,
  },
];

export function createInitialNpcs(): NpcProfile[] {
  return INITIAL_NPCS.map((npc) => ({ ...npc }));
}

export function getVisibleNpcs(npcs: NpcProfile[]): NpcProfile[] {
  return npcs.filter((npc) => npc.visible);
}

export function activateNpcsForChapter(npcs: NpcProfile[], chapterId: string): NpcProfile[] {
  return npcs.map((npc) => {
    if (!npc.visible && npc.firstAppearChapter === chapterId) {
      return { ...npc, visible: true };
    }
    return npc;
  });
}
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/npcs.ts 2>&1`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/npcs.ts
git commit -m "feat: add NPC initial profiles — 5 core characters from world setting"
```

---

## Task 5: 创建属性等级描述模块

**Files:**
- Create: `server/src/game/metrics.ts`

- [ ] **Step 1: 创建属性阈值到描述的映射表**

创建 `server/src/game/metrics.ts`：

```ts
import type { Metrics } from "../types.js";

interface MetricTier {
  threshold: number;
  description: string;
}

const METRIC_TIERS: Record<keyof Metrics, MetricTier[]> = {
  reputation: [
    { threshold: 0, description: "无人知晓的流民" },
    { threshold: 10, description: "在市井小有名气" },
    { threshold: 25, description: "地方上颇具声望" },
    { threshold: 50, description: "朝堂内外广为传颂" },
    { threshold: 75, description: "天下皆知的名臣" },
  ],
  imperialFavor: [
    { threshold: 0, description: "未入圣听" },
    { threshold: 10, description: "略有耳闻" },
    { threshold: 25, description: "获得女帝留意" },
    { threshold: 50, description: "深得女帝信赖" },
    { threshold: 75, description: "女帝倚为心腹" },
  ],
  peopleSupport: [
    { threshold: 0, description: "在百姓中毫无根基" },
    { threshold: 10, description: "身边有少许追随者" },
    { threshold: 25, description: "在民间积累了一定声望" },
    { threshold: 50, description: "百姓视其为可依靠之人" },
    { threshold: 75, description: "民心所向，振臂一呼应者云集" },
  ],
  intrigue: [
    { threshold: 0, description: "对权谋一无所知" },
    { threshold: 10, description: "初窥门道，开始懂得察言观色" },
    { threshold: 25, description: "已初具权谋嗅觉，低阶官吏有所忌惮" },
    { threshold: 50, description: "权谋老道，能在朝堂博弈中周旋" },
    { threshold: 75, description: "运筹帷幄，各方势力不敢小觑" },
  ],
  military: [
    { threshold: 0, description: "手无缚鸡之力" },
    { threshold: 10, description: "略知兵事" },
    { threshold: 25, description: "有带兵经验，能统领小队" },
    { threshold: 50, description: "可独当一面的将领之才" },
    { threshold: 75, description: "兵权在握，能号令三军" },
  ],
  wealth: [
    { threshold: 0, description: "身无分文" },
    { threshold: 10, description: "能维持温饱" },
    { threshold: 25, description: "有一定积蓄和产业" },
    { threshold: 50, description: "家资殷实，可调动不少资源" },
    { threshold: 75, description: "坐拥丰厚产业，财力雄厚" },
  ],
};

function getMetricDescription(field: keyof Metrics, value: number): string {
  const tiers = METRIC_TIERS[field];
  let matched = tiers[0];
  for (const tier of tiers) {
    if (value >= tier.threshold) {
      matched = tier;
    }
  }
  return matched.description;
}

const METRIC_LABELS: Record<keyof Metrics, string> = {
  reputation: "名声",
  imperialFavor: "圣眷",
  peopleSupport: "民心",
  intrigue: "权谋",
  military: "兵权",
  wealth: "财富",
};

export function buildMetricsDescription(metrics: Metrics): string {
  return (Object.keys(METRIC_LABELS) as Array<keyof Metrics>)
    .map((field) => `${METRIC_LABELS[field]}（${metrics[field]}）：${getMetricDescription(field, metrics[field])}`)
    .join("\n");
}
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/metrics.ts 2>&1`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/metrics.ts
git commit -m "feat: add metric tier descriptions for prompt injection"
```

---

## Task 6: 扩展 Zod Schema

**Files:**
- Modify: `server/src/game/schema.ts`

- [ ] **Step 1: 新增章节总结的 AI 响应 schema**

将 `server/src/game/schema.ts` 的完整内容替换为：

```ts
import { z } from "zod";

export const aiTurnSchema = z.object({
  title: z.string().min(2).max(30),
  location: z.string().min(2).max(40),
  chapterLabel: z.string().min(2).max(20),
  narrative: z.array(z.string().min(10).max(220)).min(2).max(4),
  summary: z.string().min(10).max(160),
  suggestedState: z
    .object({
      reputationDelta: z.number().int().min(-3).max(4),
      imperialFavorDelta: z.number().int().min(-2).max(3),
      peopleSupportDelta: z.number().int().min(-2).max(3),
      intrigueDelta: z.number().int().min(-2).max(4),
      militaryDelta: z.number().int().min(-2).max(3),
      wealthDelta: z.number().int().min(-2).max(3),
      imperialAuthorityDelta: z.number().int().min(0).max(3),
      factionProgressDelta: z.number().int().min(0).max(5),
      flagsToAdd: z.array(z.string().min(2).max(40)).max(4),
    })
    .strict(),
  choices: z
    .array(
      z.object({
        label: z.string().min(6).max(40),
        intent: z.enum(["power", "people", "caution", "emotion", "action"]),
      }).strict(),
    )
    .min(2)
    .max(4),
}).strict();

export type AiTurn = z.infer<typeof aiTurnSchema>;

export const chapterSummaryResponseSchema = z.object({
  summary: z.string().min(50).max(500),
  keyEvents: z.array(z.string().min(2).max(40)).min(1).max(6),
  npcUpdates: z.array(
    z.object({
      npcId: z.string().min(1),
      attitude: z.string().min(1).max(20),
      relationship: z.string().min(2).max(60),
      visible: z.boolean(),
    }),
  ).max(8),
  unresolvedHooks: z.array(z.string().min(4).max(80)).max(6),
}).strict();

export type ChapterSummaryResponse = z.infer<typeof chapterSummaryResponseSchema>;
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/schema.ts 2>&1`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/schema.ts
git commit -m "feat: add Zod schema for chapter summary AI response"
```

---

## Task 7: 改造游戏引擎

**Files:**
- Modify: `server/src/game/engine.ts`

- [ ] **Step 1: 重写 engine.ts 支持章节系统和 NPC 状态**

将 `server/src/game/engine.ts` 的完整内容替换为：

```ts
import type { AiTurn } from "./schema.js";
import type { Choice, ChoiceIntent, GameResponse, GameSession, Metrics, StoryScene } from "../types.js";
import { getChapterConfig, getNextChapterId, shouldTransitionChapter } from "./chapters.js";
import { activateNpcsForChapter } from "./npcs.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function baseEffects(intent: ChoiceIntent) {
  switch (intent) {
    case "power":
      return { reputation: 1, intrigue: 2, peopleSupport: 0, wealth: 0, military: 0, imperialFavor: 0 };
    case "people":
      return { reputation: 1, intrigue: 0, peopleSupport: 2, wealth: 1, military: 0, imperialFavor: 0 };
    case "action":
      return { reputation: 1, intrigue: 0, peopleSupport: 0, wealth: 0, military: 2, imperialFavor: 0 };
    case "emotion":
      return { reputation: 0, intrigue: 1, peopleSupport: 1, wealth: 0, military: 0, imperialFavor: 1 };
    case "caution":
    default:
      return { reputation: 0, intrigue: 1, peopleSupport: 0, wealth: 0, military: 0, imperialFavor: 0 };
  }
}

function assignChoiceIds(turn: number, choices: AiTurn["choices"]): Choice[] {
  return choices.map((choice, index) => ({
    id: `turn-${turn}-choice-${index + 1}`,
    label: choice.label,
    intent: choice.intent,
  }));
}

export function findChoice(session: GameSession, choiceId: string): Choice {
  const choice = session.availableChoices.find((item) => item.id === choiceId);
  if (!choice) {
    throw new Error("无效选项，当前回合状态已失效。");
  }
  return choice;
}

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
  const metricsBeforeTurn = { ...session.state.metrics };
  const nextTurn = session.state.world.turn + 1;
  const nextChapterTurn = session.state.world.chapterTurn + 1;
  const currentChapterId = session.state.world.chapterId;
  const currentConfig = getChapterConfig(currentChapterId);

  const base = baseEffects(selectedChoice.intent);
  const metrics = session.state.metrics;
  const suggestion = aiTurn.suggestedState;

  const nextMetrics: Metrics = {
    reputation: clamp(metrics.reputation + base.reputation + (suggestion.reputationDelta ?? 0), 0, 100),
    imperialFavor: clamp(metrics.imperialFavor + base.imperialFavor + (suggestion.imperialFavorDelta ?? 0), 0, 100),
    peopleSupport: clamp(metrics.peopleSupport + base.peopleSupport + (suggestion.peopleSupportDelta ?? 0), 0, 100),
    intrigue: clamp(metrics.intrigue + base.intrigue + (suggestion.intrigueDelta ?? 0), 0, 100),
    military: clamp(metrics.military + base.military + (suggestion.militaryDelta ?? 0), 0, 100),
    wealth: clamp(metrics.wealth + base.wealth + (suggestion.wealthDelta ?? 0), 0, 100),
  };

  const flagSet = new Set(session.state.flags);
  for (const flag of suggestion.flagsToAdd ?? []) {
    flagSet.add(flag);
  }
  flagSet.add(`turn_${nextTurn}_resolved`);
  const nextFlags = [...flagSet];

  const needsChapterTransition = shouldTransitionChapter(
    currentChapterId,
    nextChapterTurn,
    nextMetrics,
    nextFlags,
  );

  const nextChoices = assignChoiceIds(nextTurn, aiTurn.choices);

  const nextSession: GameSession = {
    protagonistName: session.protagonistName,
    route: session.route,
    state: {
      metrics: nextMetrics,
      world: {
        turn: nextTurn,
        phase: currentConfig.name,
        chapter: currentConfig.name,
        chapterId: currentChapterId,
        chapterTurn: nextChapterTurn,
        routeFocus: "专注权谋",
        imperialAuthority: clamp(
          session.state.world.imperialAuthority + (suggestion.imperialAuthorityDelta ?? 0) + Math.floor(nextMetrics.intrigue / 20),
          0,
          100,
        ),
        factionProgress: clamp(
          session.state.world.factionProgress + (suggestion.factionProgressDelta ?? 0) + Math.floor(nextMetrics.military / 25),
          0,
          100,
        ),
      },
      flags: nextFlags,
      npcs: session.state.npcs,
      chapterSummaries: session.state.chapterSummaries,
      storyMemory: session.state.storyMemory,
    },
    history: [
      ...session.history,
      {
        turn: session.state.world.turn,
        playerChoice: selectedChoice.label,
        summary: aiTurn.summary,
      },
    ].slice(-12),
    availableChoices: nextChoices,
  };

  const scene: StoryScene = {
    chapter: aiTurn.chapterLabel || currentConfig.name,
    title: aiTurn.title,
    location: aiTurn.location,
    narrative: aiTurn.narrative,
    choices: nextChoices,
  };

  return {
    response: { scene, session: nextSession, mode },
    needsChapterTransition,
    metricsBeforeTurn,
  };
}

export function applyChapterTransition(
  session: GameSession,
  summaryText: string,
  keyEvents: string[],
  npcUpdates: Array<{ npcId: string; attitude: string; relationship: string; visible: boolean }>,
  unresolvedHooks: string[],
): GameSession {
  const currentChapterId = session.state.world.chapterId;
  const currentConfig = getChapterConfig(currentChapterId);
  const nextChapterId = getNextChapterId(currentChapterId);

  if (!nextChapterId) {
    return session;
  }

  const nextConfig = getChapterConfig(nextChapterId);

  const newSummary = {
    chapterId: currentChapterId,
    summary: summaryText,
    keyEvents,
  };

  let updatedNpcs = session.state.npcs.map((npc) => {
    const update = npcUpdates.find((u) => u.npcId === npc.id);
    if (update) {
      return { ...npc, attitude: update.attitude, relationship: update.relationship, visible: update.visible };
    }
    return npc;
  });

  updatedNpcs = activateNpcsForChapter(updatedNpcs, nextChapterId);

  return {
    ...session,
    state: {
      ...session.state,
      world: {
        ...session.state.world,
        chapterId: nextChapterId,
        chapterTurn: 0,
        phase: nextConfig.name,
        chapter: nextConfig.name,
      },
      npcs: updatedNpcs,
      chapterSummaries: [...session.state.chapterSummaries, newSummary],
      storyMemory: {
        relationships: updatedNpcs
          .filter((npc) => npc.visible)
          .map((npc) => ({ npcId: npc.id, description: `${npc.name}（${npc.title}）—— ${npc.relationship}` })),
        unresolvedHooks,
      },
    },
    history: [],
  };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/engine.ts 2>&1`

Expected: 无错误（依赖的 chapters.ts 和 npcs.ts 已创建）。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/engine.ts
git commit -m "feat: rewrite engine with chapter transition logic and NPC state management"
```

---

## Task 8: 改造 opening.ts 适配新 session 结构

**Files:**
- Modify: `server/src/game/opening.ts`

- [ ] **Step 1: 更新 createInitialSession 使用新字段**

将 `server/src/game/opening.ts` 的完整内容替换为：

```ts
import type { Choice, GameSession, StoryScene } from "../types.js";
import { createInitialNpcs, activateNpcsForChapter } from "./npcs.js";

const openingChoices: Choice[] = [
  {
    id: "opening-soup",
    label: "先去义粥棚附近找搬运活计，保住今天的口粮。",
    intent: "people",
  },
  {
    id: "opening-soldier",
    label: "替破庙外受伤军卒止血，试着换一份情报与活路。",
    intent: "action",
  },
  {
    id: "opening-poem",
    label: "带着记忆中的诗句去城门文棚碰碰运气，赌一线出头机会。",
    intent: "power",
  },
];

export function createInitialSession(protagonistName: string): GameSession {
  const npcs = activateNpcsForChapter(createInitialNpcs(), "chapter_1");

  return {
    protagonistName,
    route: "权谋",
    state: {
      metrics: {
        reputation: 3,
        imperialFavor: 0,
        peopleSupport: 4,
        intrigue: 6,
        military: 1,
        wealth: 1,
      },
      world: {
        turn: 1,
        phase: "草根求生",
        chapter: "草根求生",
        chapterId: "chapter_1",
        chapterTurn: 0,
        routeFocus: "专注权谋",
        imperialAuthority: 8,
        factionProgress: 0,
      },
      flags: ["opening_started", "male_protagonist", "power_route_locked"],
      npcs,
      chapterSummaries: [],
      storyMemory: {
        relationships: [],
        unresolvedHooks: [],
      },
    },
    history: [],
    availableChoices: openingChoices,
  };
}

export function createOpeningScene(session: GameSession): StoryScene {
  return {
    chapter: "草根求生",
    title: "破庙夜雨",
    location: "大雍北境·青石渡外",
    narrative: [
      `冷雨顺着残破的瓦缝滴下来，打在你的眉骨上。你睁开眼时，脑中仍残留着前世办公室的白炽灯和键盘声，可眼前只剩一座漏风的破庙、一身单薄麻衣，以及饿得发抖的身子。你如今名叫${session.protagonistName}，是大雍北境一名连户籍都没有的流民。`,
      "庙外官道泥泞，远处隐约传来军靴踏水与差役喝斥的声音。今夜若再找不到口粮与容身之处，你大概率会和庙角那具无人收殓的尸首一样，在明日天亮前无声无息地烂在乱世里。",
      "可你也很清楚，自己手里不是全然没有筹码。你记得诗词，懂一点止血净水的法子，也懂世道越乱，越要先找准能让自己活下去、再往上爬的第一道台阶。雨势渐大，你必须立刻做决定。",
    ],
    choices: session.availableChoices,
  };
}
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/opening.ts 2>&1`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/opening.ts
git commit -m "feat: adapt opening to new session structure with NPCs and chapter fields"
```

---

## Task 9: 改造 openai.ts — 预加载、Prompt 重构、章节总结生成

**Files:**
- Modify: `server/src/game/openai.ts`

- [ ] **Step 1: 重写 openai.ts**

这是最大的改动文件。将 `server/src/game/openai.ts` 的完整内容替换为：

```ts
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
```

- [ ] **Step 2: 验证编译**

Run: `cd server && npx tsc --noEmit src/game/openai.ts 2>&1`

Expected: 会报 `createFallbackChapterSummary` 不存在于 fallback.ts 中的错误，这在 Task 10 修复。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/openai.ts
git commit -m "feat: rewrite openai module — preload world doc, inject metrics/NPC/memory context, add chapter summary generation"
```

---

## Task 10: 适配 fallback.ts

**Files:**
- Modify: `server/src/game/fallback.ts`

- [ ] **Step 1: 重写 fallback.ts 按章节 id 索引，新增 fallback 章节总结**

将 `server/src/game/fallback.ts` 的完整内容替换为：

```ts
import type { AiTurn } from "./schema.js";
import type { ChapterSummaryResponse } from "./schema.js";
import type { ChoiceIntent, GameSession } from "../types.js";

interface FallbackChoiceTemplate {
  label: string;
  intent: ChoiceIntent;
}

interface FallbackSceneTemplate {
  title: string;
  location: string;
  lines: string[];
  summary: string;
  suggestedState: AiTurn["suggestedState"];
  choices: FallbackChoiceTemplate[];
}

function chapter1Scene(intent: ChoiceIntent): FallbackSceneTemplate {
  if (intent === "people") {
    return {
      title: "粥棚前的眼线",
      location: "青石渡义粥棚",
      lines: [
        "你在义粥棚前替人搬运柴草，勉强混到一碗热粥。混乱的人群里，你注意到几名差役并不急着驱赶流民，而是在暗中记名盘查，显然是在替上头挑人做苦役。",
        "你顺手帮一个被挤倒的老妇人捡回粮袋，也因此从她口中得知，县衙这两日正在秘密招募识字之人誊抄军需簿册。对流民来说，那或许是离官府最近、也最危险的一条路。",
        "你意识到，单靠讨活难有出头日，若想往上走，必须尽快让自己从乌泱泱的人群里被看见。",
      ],
      summary: "你借义粥棚的人情与传闻，摸到了一条接近县衙的门路。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 2, intrigueDelta: 1,
        militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 0, factionProgressDelta: 1,
        flagsToAdd: ["heard_county_recruitment"],
      },
      choices: [
        { label: "借识字的机会接近县衙书吏，摸清谁在幕后调人。", intent: "power" },
        { label: "继续在流民中施恩，先攒一批愿意跟你走的人手。", intent: "people" },
        { label: "不急着现身，先盯住那几名差役的行踪与口风。", intent: "caution" },
      ],
    };
  }

  if (intent === "action") {
    return {
      title: "血迹里的军报",
      location: "青石渡破庙外",
      lines: [
        "你替那名受伤军卒止住了血，又用破布和草灰勉强包扎好伤口。他原本戒备极重，见你手法利落，这才咬牙透露自己是押运军报的小卒，途中遭了流匪伏击。",
        "在他含糊断续的话里，你听见了一个极敏感的消息：北境镇军近来调动频繁，似乎有人在试探朝廷底线。若这消息为真，边地很快就要再乱一轮。",
        "军卒临昏迷前将一枚刻着营号的木牌塞进你手里。那不值几个钱，却可能是你接近军伍与官府的第一块敲门砖。",
      ],
      summary: "你救下伤卒，拿到一条涉军线索和一枚可用来试探军伍关系的木牌。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 0, intrigueDelta: 1,
        militaryDelta: 2, wealthDelta: 0, imperialAuthorityDelta: 0, factionProgressDelta: 1,
        flagsToAdd: ["obtained_military_token"],
      },
      choices: [
        { label: "循着木牌去寻那支镇军的营地，试探军中缺口。", intent: "action" },
        { label: "把军情藏在心里，先查是谁敢在北境截军报。", intent: "power" },
        { label: "暂不露声色，先找个可靠落脚处把命保稳。", intent: "caution" },
      ],
    };
  }

  return {
    title: "文棚初试锋芒",
    location: "青石渡北门文棚",
    lines: [
      "你冒雨赶到城门文棚时，几名穷酸书生正围着炭盆争论诗句。你借着替人润笔写信的机会，提笔写下改写过的七言短诗，寥寥几句便压住了满棚喧哗。",
      "文棚掌事原本只把你当乞食流民，待看见那笔字与句中气象，神色立刻变了。他没敢当众夸你，却悄悄留下话，说县中一位幕僚近来正在寻有文墨底子的寒士。",
      "你清楚，这不是平步青云，而是一张极窄的门缝。只要伸手伸得稳，你就能从这道缝里挤进真正决定命运的地方。",
    ],
    summary: "你在文棚露了一手，成功引起了县中幕僚的注意。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 0, peopleSupportDelta: 0, intrigueDelta: 2,
      militaryDelta: 0, wealthDelta: 0, imperialAuthorityDelta: 0, factionProgressDelta: 1,
      flagsToAdd: ["entered_literati_circle"],
    },
    choices: [
      { label: "顺着这位幕僚的门路递诗卷，争取面见县中主事。", intent: "power" },
      { label: "借文棚名声结交落魄书生，先织一张消息网。", intent: "people" },
      { label: "不急着投门，先打听这位幕僚属于哪一派的人。", intent: "caution" },
    ],
  };
}

function chapter2Scene(session: GameSession, intent: ChoiceIntent): FallbackSceneTemplate {
  if (intent === "people") {
    return {
      title: "流民册上的名字",
      location: "青石渡县衙外巷",
      lines: [
        "靠着几日积下的人情，你在流民里找到了几个愿替你传话跑腿的人。众人本只求一口安稳饭食，可在你的安排下，这些散乱的耳目竟慢慢连成了一张粗糙却管用的消息网。",
        "你很快得知，县衙近来正为安置流民与征发徭役焦头烂额。谁能提出既不触怒上头、又能稳住民情的办法，谁就有可能从贱籍泥沼里抬起头来。",
        "你忽然明白，底层不是负担，而是这乱世里最容易被上位者忽视、也最值得下注的筹码。",
      ],
      summary: "你开始在流民中积蓄人脉，也看到了用民心撬动仕途的可能。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 3, intrigueDelta: 1,
        militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 1, factionProgressDelta: 1,
        flagsToAdd: ["built_commoner_network"],
      },
      choices: [
        { label: "整理流民诉求，借机向县衙献上一套安置之策。", intent: "power" },
        { label: "扩张消息网，把市井、驿站与粮行都串联起来。", intent: "people" },
        { label: "暂时收缩人手，先查清县衙里谁最忌惮流民抱团。", intent: "caution" },
      ],
    };
  }

  if (intent === "action") {
    return {
      title: "营门外的试探",
      location: "北境镇军营外",
      lines: [
        "你拿着那枚营号木牌，赶到镇军营外。哨兵最初将你视作可疑流民，可在你报出伤卒留下的营号与伏击方位后，对方脸色立刻沉了下去。",
        "营中一名低阶校尉接见了你。他没有给你好脸色，却一口一句逼问你如何得知此事。你从他的反应里看出，军报被截并非孤例，营中上下显然有人刻意压着不报。",
        "这是一条险路。走得好，你能借军中裂缝攀上第一层阶；走不好，尸体明日就会浮在护城河里。",
      ],
      summary: "你正式触碰到镇军内部的隐秘裂缝，军中关系开始向你打开一线。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 0, intrigueDelta: 2,
        militaryDelta: 2, wealthDelta: 0, imperialAuthorityDelta: 0, factionProgressDelta: 2,
        flagsToAdd: ["touched_military_rift"],
      },
      choices: [
        { label: "顺势依附那名校尉，换取一个能出入营门的身份。", intent: "action" },
        { label: "把军中异样记在心里，转而向县衙换取更大的筹码。", intent: "power" },
        { label: "不再深入，先确认这名校尉到底是敌是友。", intent: "caution" },
      ],
    };
  }

  return {
    title: "县署前的试卷",
    location: "青石渡县署",
    lines: [
      "你依着文棚那条线，终于见到了县中幕僚。对方没有急着收你入门，只把一卷堆满错讹的粮册推到案前，冷眼看你是否真有本事，而不只是会写几句漂亮诗文。",
      "你一边校勘账目，一边从数字里看出了更深的东西：今年县中粮耗异常，既不像天灾，也不像寻常官吏贪墨，更像是有人借流民与军需做账，悄悄养肥别处势力。",
      "幕僚看你的眼神第一次有了变化。他没有夸赞，只轻轻说了一句，你若敢继续查下去，日后见到的便不只是县令。",
    ],
    summary: "你凭账册显出真本事，并嗅到了一条通往更高层权力的线索。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 1, peopleSupportDelta: 0, intrigueDelta: 3,
      militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 1, factionProgressDelta: 1,
      flagsToAdd: ["noticed_supply_corruption"],
    },
    choices: [
      { label: "继续追查粮册去向，揪出县中真正做账的人。", intent: "power" },
      { label: "先借幕僚赏识站稳脚跟，再慢慢经营士林名声。", intent: "people" },
      { label: "把证据先藏住，观察县令与幕僚谁更值得下注。", intent: "caution" },
    ],
  };
}

function chapter3Scene(session: GameSession): FallbackSceneTemplate {
  const hasCorruptionClue = session.state.flags.includes("noticed_supply_corruption");

  if (hasCorruptionClue) {
    return {
      title: "入京的密札",
      location: "王畿驿道",
      lines: [
        "粮册案越查越深，已经不是一县一地的亏空，而是牵连北境军需与世家买办的暗线。幕僚不敢再压，索性将你整出的证据誊成密札，借驿站快马递往王畿。",
        "数日后，来自京中的回信到了。回信极短，只让送札之人即刻入京陈情。你看着那方暗红印记，知道真正的棋局终于从县署小案，推到了朝堂边缘。",
        "可你也明白，京城不是青石渡。那里每一句话都能换来前程，也能换来断头。",
      ],
      summary: "你的查案结果惊动了京中势力，主线正式转向朝堂。",
      suggestedState: {
        reputationDelta: 2, imperialFavorDelta: 2, peopleSupportDelta: 1, intrigueDelta: 3,
        militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 2, factionProgressDelta: 2,
        flagsToAdd: ["summoned_to_capital"],
      },
      choices: [
        { label: "带着证据入京，直接赌一把朝堂里的识人之明。", intent: "power" },
        { label: "先补齐沿途人脉和护身筹码，再动身入京。", intent: "people" },
        { label: "暗中留一份副本，防着有人半路灭口夺证。", intent: "caution" },
      ],
    };
  }

  return {
    title: "县治初成",
    location: "青石渡县衙",
    lines: [
      "你提出的安置与分流之策开始见效，原本乱作一团的流民营地终于有了秩序。县令对你仍有戒心，但已不得不承认，你比衙中那群只会催税的旧吏更懂得如何稳住局势。",
      "县里名声渐起后，越来越多人开始主动来见你。有人求活路，有人献消息，也有人想借你的名头攀附更高门路。你第一次切身体会到，真正的权谋不是大声压人，而是让别人心甘情愿地来求你。",
      "这份势头若继续累积，你就不再只是一个暂时得用的寒门小吏，而会成为某些人必须提前拉拢或提前除掉的人。",
    ],
    summary: "你在县治中站稳位置，开始具备真正意义上的政治筹码。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 1, peopleSupportDelta: 2, intrigueDelta: 2,
      militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 1, factionProgressDelta: 1,
      flagsToAdd: ["county_reputation_established"],
    },
    choices: [
      { label: "借政绩上书，主动争取更高层官员的注意。", intent: "power" },
      { label: "把县中人手编织成稳固班底，为后路先蓄势。", intent: "people" },
      { label: "先收敛锋芒，看看哪一方会最先对你动手。", intent: "caution" },
    ],
  };
}

function genericLateScene(): FallbackSceneTemplate {
  return {
    title: "朝局风声",
    location: "王畿近郊",
    lines: [
      "一路北上，你见到的不是太平王都，而是被重税、军备与流言层层压着的王畿。外有藩镇窥伺，内有世家掣肘，朝廷看似仍握天下名义，实则每一步都走得艰难。",
      "你带来的线索与前期积累的人脉，终于让几位旧臣开始认真看待你。可他们看中的不仅是你的才干，更是你能否成为那把对付藩镇与世家的新刀。",
      "这是机会，也是试炼。你若能接住，便是踏入朝堂；接不住，便只是又一个被权力磨碎的寒门过客。",
    ],
    summary: "你已经站到朝局边缘，下一步会真正进入与藩镇、世家、皇权的正面博弈。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 2, peopleSupportDelta: 1, intrigueDelta: 3,
      militaryDelta: 1, wealthDelta: 1, imperialAuthorityDelta: 2, factionProgressDelta: 2,
      flagsToAdd: ["entered_central_stage"],
    },
    choices: [
      { label: "主动靠近忠于皇室的旧臣，先把自己放进帝党视野。", intent: "power" },
      { label: "从市井与驿站下手，先补齐王畿内外的情报网。", intent: "people" },
      { label: "先不急着表态，摸清三方势力的真实底牌再动。", intent: "caution" },
    ],
  };
}

function buildScene(session: GameSession, intent: ChoiceIntent): FallbackSceneTemplate {
  const chapterId = session.state.world.chapterId;

  switch (chapterId) {
    case "chapter_1":
      return chapter1Scene(intent);
    case "chapter_2":
      return chapter2Scene(session, intent);
    case "chapter_3":
      return chapter3Scene(session);
    default:
      return genericLateScene();
  }
}

export function createFallbackTurn(session: GameSession, _choiceLabel: string, intent: ChoiceIntent): AiTurn {
  const scene = buildScene(session, intent);

  return {
    title: scene.title,
    location: scene.location,
    chapterLabel: session.state.world.chapter,
    narrative: scene.lines,
    summary: scene.summary,
    suggestedState: scene.suggestedState,
    choices: scene.choices,
  };
}

export function createFallbackChapterSummary(session: GameSession): ChapterSummaryResponse {
  const chapterId = session.state.world.chapterId;
  const historyEvents = session.history.map((h) => h.summary).slice(0, 4);

  const summaries: Record<string, string> = {
    chapter_1: `${session.protagonistName}以流民之身在青石渡艰难求生，凭借现代知识与诗词才华初步站稳脚跟，引起了地方势力的注意，为后续进入仕途打下了基础。`,
    chapter_2: `${session.protagonistName}在县中崭露头角，通过文才与谋略赢得幕僚赏识，开始触及地方权力核心，逐渐从一介寒士蜕变为有分量的棋子。`,
    chapter_3: `${session.protagonistName}的名声与能力终于传至朝堂，获得入京机会，正式踏入与藩镇、世家、皇权的三方博弈之中。`,
    chapter_4: `${session.protagonistName}在朝堂中站稳脚跟，凭借军事才能和政治手腕，开始统领兵马平定各方割据势力。`,
  };

  return {
    summary: summaries[chapterId] ?? `${session.protagonistName}在本章中继续推进权谋主线，势力与影响力稳步扩大。`,
    keyEvents: historyEvents.length > 0 ? historyEvents : ["完成本章主要剧情推进"],
    npcUpdates: [],
    unresolvedHooks: session.state.storyMemory.unresolvedHooks,
  };
}
```

- [ ] **Step 2: 验证整个 server 编译**

Run: `cd server && npx tsc --noEmit 2>&1`

Expected: 无错误（所有服务端文件此时应能编译通过）。

- [ ] **Step 3: Commit**

```bash
git add server/src/game/fallback.ts
git commit -m "feat: adapt fallback to chapter-based indexing, add fallback chapter summary"
```

---

## Task 11: 改造 API 层 — 支持章节转换的 SSE 事件

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: 重写 index.ts 支持章节转换流程**

将 `server/src/index.ts` 的完整内容替换为：

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { applyTurn, applyChapterTransition, findChoice } from "./game/engine.js";
import { createOpeningScene, createInitialSession } from "./game/opening.js";
import { generateAiTurn, generateAiTurnFromNarrative, generateChapterSummary, streamNarrativeTurn } from "./game/openai.js";
import type { ChapterTransitionData, GameResponse, GameSession, Metrics } from "./types.js";
import { getChapterConfig, getNextChapterId } from "./game/chapters.js";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../.env"),
  override: true,
});

const app = express();
const port = Number(process.env.PORT || 3001);
const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const clientDistPath = path.join(workspaceRoot, "client", "dist");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    mode: process.env.OPENAI_API_KEY ? "openai-configured" : "fallback-only",
  });
});

const startSchema = z.object({
  protagonistName: z.string().trim().min(1).max(20).optional(),
});

app.post("/api/game/start", (request, response) => {
  const parsed = startSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).send("启动参数无效。");
    return;
  }

  const session = createInitialSession(parsed.data.protagonistName || "林墨");
  const payload: GameResponse = {
    scene: createOpeningScene(session),
    session,
    mode: process.env.OPENAI_API_KEY ? "openai" : "fallback",
  };

  response.json(payload);
});

const advanceSchema = z.object({
  choiceId: z.string().min(1),
  session: z.custom<GameSession>(),
});

function writeSse(response: express.Response, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleChapterTransition(
  session: GameSession,
  metricsBefore: Metrics,
): Promise<{ updatedSession: GameSession; transitionData: ChapterTransitionData }> {
  const currentConfig = getChapterConfig(session.state.world.chapterId);
  const nextChapterId = getNextChapterId(session.state.world.chapterId);
  const nextConfig = nextChapterId ? getChapterConfig(nextChapterId) : null;

  const { summary } = await generateChapterSummary(session);

  const npcChanges = summary.npcUpdates.map((update) => {
    const existingNpc = session.state.npcs.find((n) => n.id === update.npcId);
    return {
      name: existingNpc?.name ?? update.npcId,
      oldAttitude: existingNpc?.attitude ?? "未知",
      newAttitude: update.attitude,
      relationship: update.relationship,
    };
  });

  const updatedSession = applyChapterTransition(
    session,
    summary.summary,
    summary.keyEvents,
    summary.npcUpdates,
    summary.unresolvedHooks,
  );

  const transitionData: ChapterTransitionData = {
    completedChapter: {
      id: currentConfig.id,
      name: currentConfig.name,
      summary: summary.summary,
      keyEvents: summary.keyEvents,
    },
    metricsComparison: {
      before: metricsBefore,
      after: session.state.metrics,
    },
    npcChanges,
    nextChapter: {
      id: nextConfig?.id ?? currentConfig.id,
      name: nextConfig?.name ?? currentConfig.name,
    },
  };

  return { updatedSession, transitionData };
}

app.post("/api/game/advance", async (request, response) => {
  const parsed = advanceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).send("推进参数无效。");
    return;
  }

  try {
    const selectedChoice = findChoice(parsed.data.session, parsed.data.choiceId);
    const generated = await generateAiTurn(parsed.data.session, selectedChoice);
    const result = applyTurn(parsed.data.session, selectedChoice, generated.turn, generated.mode);

    if (result.needsChapterTransition) {
      const { updatedSession, transitionData } = await handleChapterTransition(
        result.response.session,
        result.metricsBeforeTurn,
      );
      result.response.session = updatedSession;
      result.response.chapterTransition = transitionData;
    }

    response.json(result.response);
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : "剧情推进失败。");
  }
});

app.post("/api/game/advance/stream", async (request, response) => {
  const parsed = advanceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).send("推进参数无效。");
    return;
  }

  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();

  try {
    const selectedChoice = findChoice(parsed.data.session, parsed.data.choiceId);
    writeSse(response, "start", { ok: true });

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

    if (result.needsChapterTransition) {
      const { updatedSession, transitionData } = await handleChapterTransition(
        result.response.session,
        result.metricsBeforeTurn,
      );
      result.response.session = updatedSession;
      result.response.chapterTransition = transitionData;
      writeSse(response, "chapter_transition", transitionData);
    }

    writeSse(response, "complete", result.response);
  } catch (error) {
    writeSse(response, "error", {
      message: error instanceof Error ? error.message : "剧情推进失败。",
    });
  } finally {
    response.end();
  }
});

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }
    response.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`novel-game server listening on http://localhost:${port}`);
});
```

- [ ] **Step 2: 验证完整服务端编译**

Run: `cd server && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add chapter transition flow to API with SSE chapter_transition event"
```

---

## Task 12: 改造客户端 api.ts — 处理 chapter_transition 事件

**Files:**
- Modify: `client/src/api.ts`

- [ ] **Step 1: 更新 api.ts 处理新 SSE 事件**

将 `client/src/api.ts` 的完整内容替换为：

```ts
import type { ChapterTransitionData, GameResponse, GameSession } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "请求失败");
  }

  return (await response.json()) as T;
}

export function startGame(protagonistName: string): Promise<GameResponse> {
  return request<GameResponse>("/api/game/start", {
    method: "POST",
    body: JSON.stringify({ protagonistName }),
  });
}

export function advanceGame(session: GameSession, choiceId: string): Promise<GameResponse> {
  return request<GameResponse>("/api/game/advance", {
    method: "POST",
    body: JSON.stringify({ session, choiceId }),
  });
}

interface StreamHandlers {
  onStart?: () => void;
  onNarrativeDelta?: (delta: string) => void;
  onChapterTransition?: (data: ChapterTransitionData) => void;
  onComplete?: (result: GameResponse) => void;
}

export async function advanceGameStream(
  session: GameSession,
  choiceId: string,
  handlers: StreamHandlers,
): Promise<GameResponse> {
  const response = await fetch(`${API_BASE}/api/game/advance/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session, choiceId }),
  });

  if (!response.ok || !response.body) {
    const error = await response.text();
    throw new Error(error || "流式请求失败");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: GameResponse | null = null;

  function processEventBlock(block: string) {
    const lines = block.split("\n").filter(Boolean);
    const eventLine = lines.find((line) => line.startsWith("event: "));
    const dataLine = lines.find((line) => line.startsWith("data: "));

    if (!eventLine || !dataLine) {
      return;
    }

    const event = eventLine.slice("event: ".length);
    const data = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;

    if (event === "start") {
      handlers.onStart?.();
      return;
    }

    if (event === "narrative_delta") {
      handlers.onNarrativeDelta?.(String(data.delta ?? ""));
      return;
    }

    if (event === "chapter_transition") {
      handlers.onChapterTransition?.(data as unknown as ChapterTransitionData);
      return;
    }

    if (event === "complete") {
      finalResult = data as unknown as GameResponse;
      handlers.onComplete?.(finalResult);
      return;
    }

    if (event === "error") {
      throw new Error(String(data.message ?? "流式推进失败"));
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      processEventBlock(block);
    }

    if (done) {
      break;
    }
  }

  if (!finalResult) {
    throw new Error("流式响应未返回完整结果");
  }

  return finalResult;
}
```

- [ ] **Step 2: 验证客户端编译**

Run: `cd client && npx tsc --noEmit 2>&1`

Expected: 可能因 App.tsx 尚未适配而报错，下一 Task 修复。

- [ ] **Step 3: Commit**

```bash
git add client/src/api.ts
git commit -m "feat: handle chapter_transition SSE event in client api"
```

---

## Task 13: 改造前端 — Loading 骨架屏 + 阶段总结面板

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: 重写 App.tsx 添加 loading 骨架屏和章节总结面板**

将 `client/src/App.tsx` 的完整内容替换为：

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
  const [mode, setMode] = useState<GameResponse["mode"]>("fallback");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamedNarrative, setStreamedNarrative] = useState("");
  const [chapterTransition, setChapterTransition] = useState<ChapterTransitionData | null>(null);

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
      setMode(result.mode);
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
          setMode(payload.mode);
        },
      });

      setSession(result.session);
      setScene(result.scene);
      setMode(result.mode);
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
              <div className="rounded-full border border-ember/15 bg-white/70 px-4 py-2 text-sm text-cedar">
                引擎模式：{mode === "openai" ? "OpenAI 在线生成" : "本地回退剧情"}
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
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 验证完整客户端编译**

Run: `cd client && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: add loading skeleton, chapter transition panel, and immediate loading feedback"
```

---

## Task 14: 全量编译验证与开发服务器测试

- [ ] **Step 1: 验证服务端编译**

Run: `cd server && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 2: 验证客户端编译**

Run: `cd client && npx tsc --noEmit 2>&1`

Expected: 无错误。

- [ ] **Step 3: 构建生产版本**

Run: `cd "D:/DBC Projects/novel-game" && npm run build 2>&1`

Expected: 编译和构建成功。

- [ ] **Step 4: 启动开发服务器并测试**

Run: `npm run dev`

在浏览器中测试以下流程：

1. 打开 `http://localhost:5173`，确认初始界面正常
2. 输入主角名，点击"开始游戏"，确认开场场景加载
3. 点击选项，观察：
   - 是否立刻出现"剧情推演中"标签
   - 是否显示骨架屏占位
   - 流式文本是否正常替换骨架屏
   - 选项区域是否显示"命运的齿轮开始转动..."
4. 连续推进多个回合，观察属性变化
5. 推进足够回合触发章节转换，观察：
   - 是否出现章节总结面板
   - 属性对比是否正确
   - "进入下一章"按钮是否正常工作

- [ ] **Step 5: 若有编译错误或运行时问题，逐一修复后 commit**

```bash
git add -A
git commit -m "fix: resolve any remaining compilation or runtime issues"
```

---

## Task 15: 最终 commit 和清理

- [ ] **Step 1: 确认所有改动已提交**

Run: `git status`

Expected: 工作区干净。

- [ ] **Step 2: 更新 CLAUDE.md**

在 `CLAUDE.md` 中更新架构描述，反映新增的章节系统、NPC 档案、属性描述、上下文压缩等模块。需要更新的部分：

- 游戏引擎部分新增 `chapters.ts`、`npcs.ts`、`metrics.ts` 的说明
- 核心领域概念新增章节转换条件、NPC 档案、记忆系统的说明
- 数据流部分新增章节转换流程

- [ ] **Step 3: Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect new chapter, NPC, and memory systems"
```
