const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";
async function request(path, init) {
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
    return (await response.json());
}
export function startGame(protagonistName) {
    return request("/api/game/start", {
        method: "POST",
        body: JSON.stringify({ protagonistName }),
    });
}
export function advanceGame(session, choiceId) {
    return request("/api/game/advance", {
        method: "POST",
        body: JSON.stringify({ session, choiceId }),
    });
}
export async function advanceGameStream(session, choiceId, handlers) {
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
    let finalResult = null;
    function processEventBlock(block) {
        const lines = block.split("\n").filter(Boolean);
        const eventLine = lines.find((line) => line.startsWith("event: "));
        const dataLine = lines.find((line) => line.startsWith("data: "));
        if (!eventLine || !dataLine) {
            return;
        }
        const event = eventLine.slice("event: ".length);
        const data = JSON.parse(dataLine.slice("data: ".length));
        if (event === "start") {
            handlers.onStart?.();
            return;
        }
        if (event === "narrative_delta") {
            handlers.onNarrativeDelta?.(String(data.delta ?? ""));
            return;
        }
        if (event === "complete") {
            finalResult = data;
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
