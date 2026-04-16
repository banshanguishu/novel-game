# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

大雍逆袭录 —— AI 驱动的互动小说 MVP。现代人穿越到虚构古代王朝，通过选择攀登权力阶梯。纯网页端、按钮驱动（无自由输入），当前仅支持权谋线。

## 常用命令

```bash
# 安装依赖（npm workspaces）
npm install

# 开发模式 —— 同时启动 Vite 前端（端口 5173）和 Express 后端（端口 3001）
npm run dev

# 生产构建
npm run build

# 生产运行 —— 后端托管 client/dist 静态文件，访问 localhost:3001
npm start

# 仅类型检查（不输出构建产物）
npx tsc -b --workspace client
npx tsc -p tsconfig.json --workspace server
```

尚未配置测试框架。

## 架构

**npm workspaces 单仓库：** `client/` 和 `server/` 为独立包，共享 `tsconfig.base.json`（ES2022、严格模式）。

### 前端 (`client/`)
React 18 + TypeScript + Tailwind CSS + Vite 单页应用。核心 UI 在 `App.tsx` —— 左侧边栏（角色面板、6 项属性、世界状态）+ 主面板（叙事文本 + 选项按钮）。通过 `api.ts` 与后端通信（fetch 获取 JSON，SSE 处理流式响应）。前端类型定义在 `client/src/types.ts`。

### 后端 (`server/`)
Express + TypeScript。入口：`server/src/index.ts`。三个 API 路由：
- `POST /api/game/start` —— 创建初始会话和开场场景
- `POST /api/game/advance` —— JSON 格式的回合推进
- `POST /api/game/advance/stream` —— SSE 流式回合推进

### 游戏引擎 (`server/src/game/`)
- **engine.ts** —— 确定性状态机。`applyTurn()` 返回 `ApplyTurnResult`（含 `needsChapterTransition` 标记）。属性通过基础效果 + AI 建议增量更新，钳制在 0–100。`applyChapterTransition()` 处理章节切换（NPC 更新、总结存储、历史重置）。
- **chapters.ts** —— 章节配置表（5 章，每章 minTurns/maxTurns + 属性阈值/flag 触发条件）。`shouldTransitionChapter()` 判定是否触发章节转换。
- **npcs.ts** —— 5 个核心 NPC 初始档案（萧清晏、苏晚卿、周虎、李太傅、北平王）。`activateNpcsForChapter()` 按章节激活 NPC。
- **metrics.ts** —— 属性等级描述映射（阈值 → 中文描述），`buildMetricsDescription()` 生成注入 prompt 的属性描述。
- **openai.ts** —— LLM 集成。启动时预加载 `世界设定包.md`（不再读取需求文档）。Prompt 注入属性描述、NPC 档案和记忆上下文。两阶段生成：先流式输出叙事，再提取结构化元数据。新增 `generateChapterSummary()` 用于章节转换时生成总结。
- **fallback.ts** —— 硬编码场景模板，按章节 id 索引。新增 `createFallbackChapterSummary()` 提供回退章节总结。
- **schema.ts** —— Zod 校验 AI 响应结构（`AiTurn` + `ChapterSummaryResponse`）。
- **opening.ts** —— 固定开场场景，初始化 NPC 和记忆系统。

### 数据流
玩家选择 → `findChoice()` 校验 → OpenAI 生成叙事+元数据（或回退） → `applyTurn()` 计算新属性/标记并判定是否需要章节转换 → 若需转换：`generateChapterSummary()` 生成章节总结 → `applyChapterTransition()` 更新 NPC/记忆/清空历史 → 前端展示阶段总结面板 → 进入下一章。所有游戏状态存于 `GameSession`，每回合在客户端与服务端之间传递（无服务端持久化）。

## 核心领域概念

- **ChoiceIntent**：`"power" | "people" | "caution" | "emotion" | "action"` —— 每种意图在 `engine.ts:baseEffects()` 中映射固定属性加成
- **章节系统**：5 章，每章 3-6 回合区间兜底，可通过属性阈值或 flag 提前触发转换（配置在 `chapters.ts`）
- **NPC 档案**：`NpcProfile` 结构存储态度/关系/可见性，章节切换时由 AI 更新，每回合注入 prompt 影响叙事
- **属性**：reputation（声望）、imperialFavor（圣眷）、peopleSupport（民心）、intrigue（权谋）、military（兵权）、wealth（财富）。属性等级有对应描述文案注入 prompt
- **上下文记忆**：`chapterSummaries`（已完成章节的 200-300 字总结）+ `storyMemory`（人物关系/未解悬念），确保 prompt 长度恒定
- **世界状态**：imperialAuthority（皇权稳固度）和 factionProgress（阵营推进度）由属性 + AI 建议推导
- **标记（Flags）**：字符串集合，追踪剧情事件（如 `turn_N_resolved`），也用于章节转换条件

## 环境变量

服务端读取 `server/.env`（参考 `server/.env.example`）：
- `PORT` —— 服务端口（默认 3001）
- `OPENAI_API_KEY` —— 启用 AI 生成；未配置则仅使用回退模式
- `OPENAI_MODEL` —— 模型名称（默认 `gpt-4.1-mini`）
- `OPENAI_BASE_URL` —— 可选的自定义接口地址

## 样式

古风中国美学，通过 `client/tailwind.config.ts` 自定义 Tailwind 色彩：ink (#241910)、parchment (#f6eddc)、ember (#8a3b12)、cedar (#4d3824)、moss (#70815f)。字体：Noto Serif SC + Georgia。

## 语言约定

所有游戏内容、UI 文案、错误提示、设计文档均为中文。代码标识符和注释使用英文。
