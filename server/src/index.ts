import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { applyTurn, findChoice } from "./game/engine.js";
import { createOpeningScene, createInitialSession } from "./game/opening.js";
import { generateAiTurn, generateAiTurnFromNarrative, streamNarrativeTurn } from "./game/openai.js";
import type { GameResponse, GameSession } from "./types.js";

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

app.post("/api/game/advance", async (request, response) => {
  const parsed = advanceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).send("推进参数无效。");
    return;
  }

  try {
    const selectedChoice = findChoice(parsed.data.session, parsed.data.choiceId);
    const generated = await generateAiTurn(parsed.data.session, selectedChoice);
    const payload = applyTurn(parsed.data.session, selectedChoice, generated.turn, generated.mode);
    response.json(payload);
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

    const payload = applyTurn(parsed.data.session, selectedChoice, generated.turn, generated.mode);
    writeSse(response, "complete", payload);
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
