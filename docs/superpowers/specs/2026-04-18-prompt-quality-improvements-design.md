# 大雍逆袭录 —— Prompt 质量与选项多样性优化设计文档

> 日期：2026-04-18
> 实施方案：Prompt 层改造 + Fallback 移除

---

## 背景

前一轮（2026-04-16）优化后，剧情整体质量提升，但试玩发现三个问题：

1. **世界设定包没有被使用** —— `worldDoc` 在启动时加载了 113 行的 `世界设定包.md` 内容，但 prompt 中实际只注入了 7 行硬编码 `worldSummary`，导致大量世界观细节（人物、势力、阶段脉络、文风要求）AI 看不到
2. **Fallback 兜底反而有害** —— 硬编码的 fallback 场景无法承接 AI 生成的动态剧情，调用失败时用户体验割裂，不如直接报错重试
3. **选项内容雷同** —— 玩家每回合收到的选项常陷入"激进行动 / 温和周旋 / 谨慎观望"的固定三元模板，不同场景下措辞大同小异

---

## 一、世界设定注入

### 问题

当前 `openai.ts` 启动时读取了整份 `世界设定包.md`（保存为 `worldDoc` 变量），但**从未在任何 prompt 中使用**。实际注入 prompt 的是一段只有 7 行的手写 `worldSummary`，丢失了世界观大部分细节。

### 设计

#### 1.1 Prompt 结构

四类 prompt（`buildPrompt`、`buildNarrativePrompt`、`buildPromptFromNarrative`、`buildChapterSummaryPrompt`）的 system 段统一改为：

```
[你是 XX 引擎……]（角色定位固定几行）

【世界设定】
<整份 世界设定包.md 原文>

【主角当前属性】
<动态：属性等级描述>

【已知关键人物】
<动态：可见 NPC 档案>
```

关键原则：**稳定内容放最前面，动态内容放最后**。世界设定包约 5000 token，作为 prefix 稳定存在。

#### 1.2 Prompt Caching 依赖

阿里云 DashScope 对 qwen 系列模型**自动启用 Context Cache**，不需要显式配置。只要请求 prefix 相同，后续请求自动命中缓存，显著降低延迟和费用（缓存部分通常只收 10%-25% 费用）。

由于四类 prompt 都在 system 段顶部放相同的世界设定包，每类 prompt 在多次调用时可以独立命中缓存。

#### 1.3 需要删除的代码

- `openai.ts` 中 7 行硬编码的 `worldSummary` 常量
- 所有 prompt 中引用 `worldSummary` 的地方替换为引用 `worldDoc`

### 文件变更

- 修改 `server/src/game/openai.ts`：替换 `worldSummary` 为 `worldDoc` 的引用

---

## 二、移除 Fallback 兜底

### 问题

Fallback 场景是按章节 id 索引的硬编码模板。当 AI 调用失败时，代码会静默切换到 fallback，但 fallback 生成的内容：
- 无法承接玩家之前与 AI 生成内容产生的剧情脉络
- 角色、地点、情节与玩家此前的体验割裂
- 导致玩家体验突然"跳戏"

比起静默降级，直接报错让玩家重试是更好的体验。

### 设计

#### 2.1 删除的文件

- `server/src/game/fallback.ts` —— 整个文件删除

#### 2.2 `openai.ts` 删除的 fallback 分支

每个公开函数中的 fallback 分支都要删除：

- `streamNarrativeTurn`：
  - 移除未配置 API key 时的 fallback 路径
  - 移除流式失败时的 fallback 路径
  - 移除 `streamTextFallback` 辅助函数（仅用于 fallback 流式模拟）
- `generateAiTurnFromNarrative`：移除无 client 或 `preferredMode === "fallback"` 时的 fallback 路径
- `generateAiTurn`：移除未配置 API key 时和失败时的 fallback 路径
- `generateChapterSummary`：移除未配置 API key 时和失败时的 fallback 路径

失败时统一抛错（让上层 API 路由捕获并返回错误响应）。

#### 2.3 类型变更

- `GameResponse.mode` 字段删除（原值 `"openai" | "fallback"`，去除 fallback 后只剩一种状态，字段无意义）
- 相应的 `createInitialSession` 返回值、API 路由返回值、前端类型都要同步修改

#### 2.4 API 层变更

- `POST /api/game/advance` 和 `/api/game/advance/stream` 在 AI 调用失败时：
  - 非流式：返回 HTTP 500 + 错误信息
  - 流式：通过 SSE `error` 事件发送错误信息（现有机制已支持）

#### 2.5 前端变更

- 删除 "引擎模式：OpenAI 在线生成 / 本地回退剧情" UI 标签
- 错误提示面板新增"重试本回合"按钮：点击后用当前 session 和上次 choiceId 重新发起 `advanceGameStream` 请求
- 重试时当前 session 状态保持不变（失败不推进回合）

### 文件变更

- 删除 `server/src/game/fallback.ts`
- 修改 `server/src/game/openai.ts`：删除所有 fallback 分支和 `streamTextFallback`
- 修改 `server/src/types.ts`：删除 `GameResponse.mode`
- 修改 `client/src/types.ts`：同步类型
- 修改 `server/src/index.ts`：更新错误处理（失败直接返回错误）
- 修改 `client/src/App.tsx`：删除模式标签，新增"重试本回合"按钮
- 修改 `client/src/api.ts`：错误传递（已有 error 事件处理，无需大改）

---

## 三、选项多样性

### 问题

AI 生成的选项常陷入套路化三元模板："激进行动 / 温和周旋 / 谨慎观望"。根本原因是：
1. AI 每次生成选项时看不到自己上一轮生成过什么
2. Prompt 没有明确要求选项在结构上多样化

### 设计

#### 3.1 数据结构扩展

`GameSession.history` 的每项记录增加 `rejectedChoices` 字段：

```ts
history: Array<{
  turn: number;
  playerChoice: string;
  rejectedChoices: string[];   // 新增：当轮未被选中的其他选项 label
  summary: string;
}>;
```

#### 3.2 Engine 改动

`applyTurn` 在构造 history 新项时，从 `session.availableChoices` 过滤出非选中的选项，label 存入 `rejectedChoices`：

```ts
const rejectedChoices = session.availableChoices
  .filter((c) => c.id !== selectedChoice.id)
  .map((c) => c.label);
```

#### 3.3 Prompt 注入"已出现过的选项"

`buildPrompt` 和 `buildNarrativePrompt` 的 user 段新增一段（放在 `memoryContext` 之后、`本回合玩家选择` 之前）：

```
【最近 3 轮出现过的选项（本章内）】
第 7 回合：<label A> / <label B> / <label C>（玩家选择了：<label A>）
第 8 回合：<label D> / <label E> / <label F>（玩家选择了：<label E>）
第 9 回合：<label G> / <label H> / <label I>（玩家选择了：<label G>）

新生成的选项必须在【推进目标】【接触对象】【行动方式】三个维度的至少两个维度上，与上述选项明显不同。不得出现语义重复或仅换词改写的选项。
```

取最近 3 轮（如果本章不足 3 轮就取可得的）。

章节切换时 `history` 清空（已有逻辑），所以这段内容自然不会跨章污染新章选项。

#### 3.4 Prompt 多样性模板

`buildPrompt` 和 `buildNarrativePrompt` 的 system 段"选项设计要求"部分追加：

```
选项多样性要求：
- 三个选项应体现不同的推进方向（例如：接触新对象 / 变换行动方式 / 引入新场景 / 触发新事件）
- 禁止套用"激进行动 + 温和周旋 + 谨慎观望"的固定三元模板
- intent 分布尽量多样：同一回合内避免 3 个选项都落在 power/people/caution 这个常见组合上
```

### 文件变更

- 修改 `server/src/types.ts`：history 项新增 `rejectedChoices` 字段
- 修改 `client/src/types.ts`：同步类型
- 修改 `server/src/game/engine.ts`：`applyTurn` 中构造 `rejectedChoices`
- 修改 `server/src/game/opening.ts`：初始 history 结构不变（空数组即可）
- 修改 `server/src/game/openai.ts`：新增选项历史上下文构建函数 + 在 prompt 中注入

---

## 四、实施顺序

1. **类型扩展**：`types.ts`（双端）新增 `rejectedChoices` 字段、删除 `GameResponse.mode`
2. **Engine 改造**：`engine.ts` 在 `applyTurn` 中构造 `rejectedChoices`
3. **Prompt 层改造**：`openai.ts` 替换 `worldSummary` 为 `worldDoc`、注入选项历史、加多样性模板
4. **移除 Fallback**：删除 `fallback.ts` 文件，`openai.ts` 清理所有 fallback 分支
5. **API 层**：`index.ts` 更新错误处理路径
6. **前端**：删除模式标签，加"重试本回合"按钮

---

## 五、非目标（本次不做）

- 扩写 `世界设定包.md` 的内容 —— 现有 113 行内容已经足够详细，问题不在内容不足，在没被使用
- 世界设定分阶段切片注入 —— 当前直接注入全文 + 依赖 prompt cache，成本可控
- Prompt cache 的显式开关配置 —— DashScope 自动启用，无需代码侧控制
