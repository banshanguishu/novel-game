import type { GameResponse, GameSession } from "./types";

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
