import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { advanceGameStream, startGame } from "./api";
function MetricCard({ label, value }) {
    return (_jsxs("div", { className: "rounded-2xl border border-cedar/10 bg-white/70 px-4 py-3 shadow-sm backdrop-blur", children: [_jsx("div", { className: "text-xs uppercase tracking-[0.2em] text-cedar/60", children: label }), _jsx("div", { className: "mt-2 text-2xl font-semibold text-ink", children: value })] }));
}
function ChoiceButton({ choice, disabled, onClick, }) {
    return (_jsx("button", { type: "button", disabled: disabled, onClick: () => onClick(choice.id), className: "w-full rounded-2xl border border-ember/20 bg-ember/5 px-5 py-4 text-left text-base text-ink transition hover:border-ember/40 hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-60", children: choice.label }));
}
export default function App() {
    const [heroName, setHeroName] = useState("林墨");
    const [session, setSession] = useState(null);
    const [scene, setScene] = useState(null);
    const [mode, setMode] = useState("fallback");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [streamedNarrative, setStreamedNarrative] = useState("");
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
        }
        catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "启动失败");
        }
        finally {
            setLoading(false);
        }
    }
    async function handleAdvance(choiceId) {
        if (!session) {
            return;
        }
        setLoading(true);
        setError(null);
        setStreamedNarrative("");
        try {
            const result = await advanceGameStream(session, choiceId, {
                onNarrativeDelta: (delta) => {
                    setStreamedNarrative((current) => current + delta);
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
        }
        catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "推进失败");
        }
        finally {
            setStreamedNarrative("");
            setLoading(false);
        }
    }
    const displayedNarrative = loading && streamedNarrative.trim()
        ? streamedNarrative
            .split(/\n\s*\n/)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
        : scene?.narrative ?? [];
    return (_jsx("main", { className: "min-h-screen px-4 py-8 text-ink md:px-8", children: _jsxs("div", { className: "mx-auto flex max-w-7xl flex-col gap-6", children: [_jsx("header", { className: "overflow-hidden rounded-[32px] border border-cedar/10 bg-parchment/85 shadow-card backdrop-blur", children: _jsx("div", { className: "bg-[linear-gradient(135deg,rgba(138,59,18,0.12),transparent_55%)] px-6 py-8 md:px-10", children: _jsxs("div", { className: "flex flex-col gap-4 md:flex-row md:items-end md:justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm uppercase tracking-[0.3em] text-ember/70", children: "MVP / \u5F3A\u4E3B\u7EBF / \u6743\u8C0B\u7EBF" }), _jsx("h1", { className: "mt-3 font-display text-4xl font-bold text-ink md:text-5xl", children: "\u5927\u96CD\u9006\u88AD\u5F55" }), _jsx("p", { className: "mt-3 max-w-3xl text-sm leading-7 text-cedar/80 md:text-base", children: "\u73B0\u4EE3\u793E\u755C\u9B42\u7A7F\u4E71\u4E16\u6D41\u6C11\uFF0C\u4EE5\u8BD7\u8BCD\u3001\u8C0B\u7565\u4E0E\u6C11\u5FC3\u4E3A\u9636\uFF0C\u6B65\u6B65\u8D70\u5411\u671D\u5802\u4E2D\u67A2\u3002\u8FD9\u4E00\u7248\u805A\u7126\u6587\u5B57\u5267\u60C5\u4E0E\u6309\u94AE\u9009\u9879\u63A8\u8FDB\u3002" })] }), _jsxs("div", { className: "rounded-full border border-ember/15 bg-white/70 px-4 py-2 text-sm text-cedar", children: ["\u5F15\u64CE\u6A21\u5F0F\uFF1A", mode === "openai" ? "OpenAI 在线生成" : "本地回退剧情"] })] }) }) }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]", children: [_jsxs("aside", { className: "rounded-[28px] border border-cedar/10 bg-white/70 p-5 shadow-card backdrop-blur", children: [_jsx("div", { className: "text-sm uppercase tracking-[0.3em] text-cedar/60", children: "\u89D2\u8272\u9762\u677F" }), _jsxs("div", { className: "mt-4 rounded-3xl bg-parchment px-5 py-4", children: [_jsx("div", { className: "text-xs uppercase tracking-[0.2em] text-cedar/55", children: "\u4E3B\u89D2" }), _jsx("div", { className: "mt-2 text-3xl font-semibold", children: session?.protagonistName ?? heroName }), _jsx("div", { className: "mt-3 text-sm text-cedar/75", children: "\u56FA\u5B9A\u7537\u4E3B\uFF0C\u5F53\u524D\u8DEF\u7EBF\u4E3A\u4E13\u6CE8\u6743\u8C0B\u3002\u5173\u952E\u72B6\u6001\u7531\u540E\u7AEF\u5F15\u64CE\u88C1\u5B9A\uFF0C\u6A21\u578B\u4EC5\u63D0\u4F9B\u5EFA\u8BAE\u3002" })] }), !session ? (_jsxs("div", { className: "mt-5 space-y-4", children: [_jsxs("label", { className: "block", children: [_jsx("div", { className: "mb-2 text-sm text-cedar/75", children: "\u4E3B\u89D2\u59D3\u540D" }), _jsx("input", { value: heroName, onChange: (event) => setHeroName(event.target.value), className: "w-full rounded-2xl border border-cedar/15 bg-white px-4 py-3 outline-none transition focus:border-ember/40", placeholder: "\u6797\u58A8" })] }), _jsx("button", { type: "button", onClick: handleStart, disabled: loading, className: "w-full rounded-2xl bg-ink px-5 py-3 text-white transition hover:bg-cedar disabled:cursor-not-allowed disabled:opacity-60", children: loading ? "正在生成开场..." : "开始游戏" })] })) : (_jsxs("div", { className: "mt-5 grid gap-3", children: [_jsx(MetricCard, { label: "\u540D\u58F0", value: metrics.reputation }), _jsx(MetricCard, { label: "\u5E1D\u5FC3", value: metrics.imperialFavor }), _jsx(MetricCard, { label: "\u6C11\u5FC3", value: metrics.peopleSupport }), _jsx(MetricCard, { label: "\u6743\u8C0B", value: metrics.intrigue }), _jsx(MetricCard, { label: "\u5175\u52BF", value: metrics.military }), _jsx(MetricCard, { label: "\u8D22\u5BCC", value: metrics.wealth })] })), session ? (_jsxs("div", { className: "mt-5 rounded-3xl border border-cedar/10 bg-parchment/80 px-5 py-4 text-sm text-cedar/80", children: [_jsxs("div", { children: ["\u56DE\u5408\uFF1A\u7B2C ", session.state.world.turn, " \u56DE"] }), _jsxs("div", { className: "mt-2", children: ["\u9636\u6BB5\uFF1A", session.state.world.phase] }), _jsxs("div", { className: "mt-2", children: ["\u7AE0\u8282\uFF1A", session.state.world.chapter] }), _jsxs("div", { className: "mt-2", children: ["\u7687\u6743\u7A33\u56FA\uFF1A", session.state.world.imperialAuthority] }), _jsxs("div", { className: "mt-2", children: ["\u7EDF\u4E00\u8FDB\u5EA6\uFF1A", session.state.world.factionProgress] })] })) : null] }), _jsx("section", { className: "rounded-[28px] border border-cedar/10 bg-white/75 p-6 shadow-card backdrop-blur md:p-8", children: scene ? (_jsxs("div", { children: [_jsx("div", { className: "text-sm uppercase tracking-[0.25em] text-ember/65", children: scene.chapter }), _jsx("h2", { className: "mt-2 font-display text-4xl font-bold", children: scene.title }), _jsx("div", { className: "mt-3 text-sm text-cedar/70", children: scene.location }), loading && streamedNarrative ? (_jsx("div", { className: "mt-4 inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs tracking-[0.2em] text-ember/70", children: "\u5267\u60C5\u63A8\u6F14\u4E2D" })) : null, _jsx("div", { className: "mt-8 space-y-5 text-lg leading-9 text-ink/95", children: displayedNarrative.map((paragraph, index) => (_jsx("p", { children: paragraph }, `${scene.title}-${index}`))) }), _jsxs("div", { className: "mt-10", children: [_jsx("div", { className: "mb-4 text-sm uppercase tracking-[0.25em] text-cedar/55", children: "\u4F60\u7684\u884C\u52A8" }), _jsx("div", { className: "grid gap-3", children: scene.choices.map((choice) => (_jsx(ChoiceButton, { choice: choice, disabled: loading, onClick: handleAdvance }, choice.id))) })] })] })) : (_jsx("div", { className: "flex min-h-[520px] items-center justify-center rounded-[28px] border border-dashed border-cedar/20 bg-parchment/50 px-6 text-center", children: _jsxs("div", { className: "max-w-xl", children: [_jsx("div", { className: "text-sm uppercase tracking-[0.3em] text-cedar/55", children: "\u5E8F\u7AE0\u5F85\u542F" }), _jsx("h2", { className: "mt-4 font-display text-4xl font-semibold", children: "\u4ECE\u6D41\u6C11\u5F00\u59CB" }), _jsx("p", { className: "mt-4 text-base leading-8 text-cedar/80", children: "\u8FD9\u4E00\u7248\u4E0D\u505A\u81EA\u7531\u8F93\u5165\uFF0C\u53EA\u4FDD\u7559\u5267\u60C5\u6587\u672C\u4E0E\u6309\u94AE\u5206\u652F\u3002\u70B9\u51FB\u5DE6\u4FA7\u5F00\u59CB\u540E\uFF0C\u7CFB\u7EDF\u4F1A\u521D\u59CB\u5316\u5F00\u573A\u573A\u666F\uFF0C\u5E76\u628A\u540E\u7EED\u6BCF\u4E00\u6B65\u72B6\u6001\u4EA4\u7ED9\u5F15\u64CE\u7BA1\u7406\u3002" })] }) })) })] }), error ? (_jsx("div", { className: "rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-700", children: error })) : null] }) }));
}
