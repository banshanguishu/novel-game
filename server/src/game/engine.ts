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
