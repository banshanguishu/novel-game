import { useState } from "react";
import { advanceGameStream, startGame } from "./api";
import type { Choice, GameResponse, GameSession } from "./types";

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

export default function App() {
  const [heroName, setHeroName] = useState("林墨");
  const [session, setSession] = useState<GameSession | null>(null);
  const [scene, setScene] = useState<GameResponse["scene"] | null>(null);
  const [mode, setMode] = useState<GameResponse["mode"]>("fallback");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "推进失败");
    } finally {
      setStreamedNarrative("");
      setLoading(false);
    }
  }

  const displayedNarrative =
    loading && streamedNarrative.trim()
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
            {scene ? (
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-ember/65">{scene.chapter}</div>
                <h2 className="mt-2 font-display text-4xl font-bold">{scene.title}</h2>
                <div className="mt-3 text-sm text-cedar/70">{scene.location}</div>
                {loading && streamedNarrative ? (
                  <div className="mt-4 inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs tracking-[0.2em] text-ember/70">
                    剧情推演中
                  </div>
                ) : null}
                <div className="mt-8 space-y-5 text-lg leading-9 text-ink/95">
                  {displayedNarrative.map((paragraph, index) => (
                    <p key={`${scene.title}-${index}`}>{paragraph}</p>
                  ))}
                </div>

                <div className="mt-10">
                  <div className="mb-4 text-sm uppercase tracking-[0.25em] text-cedar/55">你的行动</div>
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
