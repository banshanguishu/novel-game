# 大雍逆袭录 MVP

当前版本为强主线、固定男主、专注权谋线的网页互动小说 MVP。

## 技术栈

- 前端：React + TypeScript + Tailwind CSS + Vite
- 后端：Node.js + TypeScript + Express
- 模型接入：OpenAI SDK

## 当前能力

- 开场场景固定
- 使用按钮选项推进剧情
- 关键状态由后端引擎裁定
- 模型只负责生成剧情文本、下一组选项、建议状态变化
- 未配置或调用失败时自动回退到本地剧情生成

## 目录

- `client`：前端
- `server`：后端
- `需求文档.md`：产品需求
- `世界设定包.md`：世界观与剧情约束

## 环境变量

参考 [server/.env.example](/D:/DBC%20Projects/novel-game/server/.env.example)：

```env
PORT=3001
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=
```

## 启动

开发模式：

```bash
npm install
npm run dev
```

生产模式：

```bash
npm run build
npm start
```

生产模式下，后端会直接托管 `client/dist`，浏览器访问 `http://localhost:3001` 即可。
