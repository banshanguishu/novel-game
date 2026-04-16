# 大雍逆袭录 —— 可玩性与性能优化设计文档

> 日期：2026-04-16
> 实施方案：渐进式重构（在现有架构上逐模块改造）

---

## 一、章节系统重构

### 问题

当前章节/阶段纯靠 `derivePhase(turn)` / `deriveChapter(turn)` 硬编码映射回合数，没有转折事件，没有条件触发，阶段转换缺乏叙事意义。

### 设计

#### 1.1 ChapterConfig 结构

每章定义一个配置对象：

```ts
interface ChapterTransitionCondition {
  type: "metric" | "flag";
  field?: keyof Metrics;       // type === "metric" 时必填
  threshold?: number;          // type === "metric" 时必填
  flag?: string;               // type === "flag" 时必填
}

interface ChapterConfig {
  id: string;                  // 如 "chapter_1"
  name: string;                // 如 "草根求生"
  minTurns: number;            // 本章最少回合数
  maxTurns: number;            // 本章最多回合数（到达后强制转换）
  transitionConditions: ChapterTransitionCondition[];  // 满足任一即可提前触发（前提 >= minTurns）
}
```

#### 1.2 初期章节规划（5 章，每章 3-6 回合）

| 章节 | 名称 | minTurns | maxTurns | 提前触发条件示例 |
|------|------|----------|----------|-----------------|
| chapter_1 | 草根求生 | 3 | 6 | reputation >= 15 或 flag `entered_literati_circle` |
| chapter_2 | 文人扬名 | 3 | 6 | intrigue >= 30 或 flag `noticed_supply_corruption` |
| chapter_3 | 朝堂博弈 | 3 | 6 | imperialFavor >= 25 或 flag `summoned_to_capital` |
| chapter_4 | 平定天下 | 3 | 6 | military >= 40 或 flag `military_command_granted` |
| chapter_5 | 盛世开创 | 3 | 6 | 终章，无提前触发 |

整体游戏约 15-30 回合。

#### 1.3 运作流程

1. `applyTurn` 执行完属性更新后，引擎检查当前章节转换条件
2. 若当前章内回合数 >= `minTurns` 且满足任一 `transitionCondition`，或回合数 >= `maxTurns`，触发章节转换
3. 章节转换时触发上下文压缩流程（见第三部分）
4. 原 `derivePhase` / `deriveChapter` 函数替换为从章节配置读取

#### 1.4 文件变更

- 新建 `server/src/game/chapters.ts`：章节配置表 + 转换判定逻辑
- 修改 `server/src/game/engine.ts`：`applyTurn` 中调用章节转换判定，替换 `derivePhase`/`deriveChapter`
- 修改 `server/src/types.ts`：`GameSession.state.world` 新增 `chapterId`、`chapterTurn`（章内回合计数）

---

## 二、NPC 档案与属性影响系统

### 问题

NPC 没有结构化数据，只存在于 AI 生成文本中。六项属性只做加减法，不影响剧情走向和 NPC 反应。

### 设计

#### 2.1 NPC 数据结构

```ts
interface NpcProfile {
  id: string;                    // 如 "xiao_qingyan"
  name: string;                  // 如 "萧清晏"
  title: string;                 // 如 "公主（未来女帝）"
  attitude: string;              // 对主角态度：冷淡/观察/试探/信任/倚重等
  relationship: string;          // 与主角关系的描述
  firstAppearChapter: string;    // 最早可能出场章节 id
  visible: boolean;              // 是否已进入主角视野
}
```

#### 2.2 初期 NPC 名单

从世界设定包中提取核心人物，初期定义 5-8 个，包括：萧清晏（女帝）、县中幕僚、镇军校尉等。具体名单在实施时从 `世界设定包.md` 提取。

#### 2.3 NPC 状态存储

`GameSession.state` 新增 `npcs: NpcProfile[]` 字段，存储运行时 NPC 状态。NPC 状态在章节切换时由 AI 更新（不是每回合更新）。

#### 2.4 属性影响机制 —— 两层设计

**Prompt 注入层（每回合）：**

构建 prompt 时，把当前属性等级翻译为 AI 可理解的描述：

```
属性描述示例：
- 权谋 35 → "主角已初具权谋嗅觉，低阶官吏会对其有所忌惮"
- 民心 8 → "主角在百姓中毫无根基，无法获得民间支持"
```

同时把已接触 NPC 的档案（名字、态度、关系）注入 prompt，AI 据此调整叙事中 NPC 的表现。

**引擎判定层（特定节点）：**

- **解锁选项**：某些选项需属性达标才出现（如"直接面见县令"需 reputation >= 20）
- **解锁剧情**：章节转换条件包含属性阈值
- **NPC 出场**：`firstAppearChapter` + 属性条件共同决定 NPC 是否进入剧情

#### 2.5 文件变更

- 新建 `server/src/game/npcs.ts`：NPC 初始档案列表
- 新建 `server/src/game/metrics.ts`：属性等级描述映射表（阈值 → 描述文案）
- 修改 `server/src/game/openai.ts`：prompt 构建注入属性描述和 NPC 档案
- 修改 `server/src/types.ts`：`GameSession.state` 新增 `npcs` 字段

---

## 三、上下文压缩与记忆系统

### 问题

`history` 是不断增长的摘要数组（`slice(-12)`），内容过于简略且会膨胀，后期容易导致 AI 幻觉和剧情重复。

### 设计

#### 3.1 GameSession 新增字段

```ts
// state 中新增
chapterSummaries: ChapterSummary[];
storyMemory: StoryMemory;
```

```ts
interface ChapterSummary {
  chapterId: string;
  summary: string;              // 200-300 字叙事总结
  keyEvents: string[];          // 本章关键事件标签
}

interface StoryMemory {
  relationships: Array<{
    npcId: string;
    description: string;        // 当前关系描述
  }>;
  unresolvedHooks: string[];    // 未解悬念列表
}
```

#### 3.2 压缩流程（章节转换时触发）

1. **生成章节总结**：把当前章的逐回合历史 + NPC 状态 + 属性变化发给 AI，要求返回结构化结果：
   - 章节总结文本（200-300 字）
   - 关键事件列表
   - 更新后的人物关系
   - 新的悬念清单
2. **裁剪历史**：总结写入 `chapterSummaries`，更新 `storyMemory`，清空 `history` 中旧章逐回合记录

#### 3.3 Prompt 中的历史组装

改造后每次构建 prompt 时历史部分结构：

```
【已完成章节】
第一章·草根求生：（200-300 字总结）
第二章·文人扬名：（200-300 字总结）

【人物关系】
萧清晏（公主）—— 尚未谋面，仅从传闻中得知
县中幕僚 —— 赏识主角才学，有意引荐

【未解悬念】
- 粮册亏空去向不明
- 北境军报被截一事尚未查清

【本章近期经过】
第7回合：玩家选择「……」；摘要：……
第8回合：玩家选择「……」；摘要：……
```

Prompt 历史长度大致恒定：`章节数 × 300 字 + 关系/悬念约 200 字 + 当前章明细`。

#### 3.4 Zod Schema 扩展

新增章节总结的 AI 响应校验 schema，确保 AI 返回的总结结构符合预期。

#### 3.5 文件变更

- 修改 `server/src/types.ts`：新增 `ChapterSummary`、`StoryMemory` 类型
- 修改 `server/src/game/schema.ts`：新增章节总结响应的 Zod schema
- 修改 `server/src/game/openai.ts`：新增章节总结生成函数 + 改造 prompt 组装逻辑
- 修改 `server/src/game/engine.ts`：章节转换时调用压缩流程

---

## 四、性能优化与前端交互

### 问题

1. 后端每次请求 `readFileSync` 读两个文档
2. `需求文档.md` 不应进入 prompt
3. 前端点击选项后到首 token 到达前完全空白

### 设计

#### 4.1 后端优化

**文档预加载：**

- 服务启动时读取 `世界设定包.md` 一次，缓存到模块级变量
- 删除对 `需求文档.md` 的读取
- `buildCondensedContext` 只返回 `worldSummary`，不再包含 `requirementSummary`

**Prompt 精简：**

- 移除所有 `requirementSummary` 相关代码
- 配合记忆系统，prompt 中的历史部分结构化且长度可控

#### 4.2 前端 loading 优化

**即时 loading 状态（点击选项后立刻生效）：**

- 选项按钮区域替换为 loading 态，展示氛围提示文案（如"命运的齿轮开始转动..."）
- 叙事区域显示骨架屏占位（2-3 行淡色脉冲动画条），风格与古风主题一致
- "剧情推演中"标签在 loading 开始时就显示（不等流式文本到达）

**流式文本到达后：**

- 首个 `narrative_delta` 到达时骨架屏平滑过渡为真实文本
- 不做打字机效果，文本直接追加显示

#### 4.3 章节转换 —— 阶段总结面板

章节切换时前端展示过渡面板：

- 章节标题 + 总结文字
- 六项属性变化对比（本章开始 → 本章结束）
- 新解锁/变化的 NPC 关系
- "进入下一章"按钮，控制节奏

#### 4.4 API 变更

`/api/game/advance/stream` 的 SSE 事件新增：

- `chapter_transition` 事件：章节切换时发送，携带章节总结 + 属性对比 + NPC 变化数据
- 前端收到此事件后展示阶段总结面板

#### 4.5 文件变更

- 修改 `server/src/game/openai.ts`：预加载世界设定包、移除需求文档
- 修改 `server/src/index.ts`：SSE 新增 `chapter_transition` 事件
- 修改 `client/src/App.tsx`：loading 骨架屏 + 阶段总结面板
- 修改 `client/src/api.ts`：处理 `chapter_transition` SSE 事件

---

## 五、Fallback 系统适配

现有 `fallback.ts` 需要适配新的章节和 NPC 系统：

- 按新章节 id 索引 fallback 模板（替代按回合数索引）
- Fallback 场景也需要返回 NPC 状态更新建议
- 章节转换时的 fallback 总结使用硬编码模板

---

## 六、实施顺序

采用渐进式重构，每步可独立测试：

1. **类型与数据层**：扩展 `types.ts`，新建 `chapters.ts`、`npcs.ts`、`metrics.ts`
2. **引擎层**：改造 `engine.ts` 支持新章节系统和 NPC 状态
3. **Prompt 层**：改造 `openai.ts` —— 预加载、移除需求文档、注入属性/NPC/记忆上下文、新增章节总结生成
4. **Schema 层**：扩展 `schema.ts` 支持章节总结响应
5. **Fallback 层**：适配 `fallback.ts`
6. **API 层**：`index.ts` 新增 `chapter_transition` SSE 事件
7. **前端层**：loading 骨架屏 + 阶段总结面板 + 处理新 SSE 事件
