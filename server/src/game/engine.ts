import type { AiTurn } from "./schema.js";
import type { Choice, ChoiceIntent, GameResponse, GameSession, StoryScene } from "../types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function derivePhase(turn: number): string {
  if (turn <= 3) {
    return "草根求生";
  }

  if (turn <= 6) {
    return "文人扬名";
  }

  if (turn <= 10) {
    return "朝堂博弈";
  }

  if (turn <= 14) {
    return "平定天下";
  }

  return "盛世开创";
}

function deriveChapter(turn: number): string {
  if (turn <= 3) {
    return "第一章";
  }

  if (turn <= 6) {
    return "第二章";
  }

  if (turn <= 10) {
    return "第三章";
  }

  if (turn <= 14) {
    return "第四章";
  }

  return "第五章";
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

export function applyTurn(session: GameSession, selectedChoice: Choice, aiTurn: AiTurn, mode: GameResponse["mode"]): GameResponse {
  const nextTurn = session.state.world.turn + 1;
  const nextPhase = derivePhase(nextTurn);
  const nextChapter = deriveChapter(nextTurn);

  const base = baseEffects(selectedChoice.intent);
  const metrics = session.state.metrics;
  const suggestion = aiTurn.suggestedState;

  const nextMetrics = {
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

  const nextChoices = assignChoiceIds(nextTurn, aiTurn.choices);

  const nextSession: GameSession = {
    protagonistName: session.protagonistName,
    route: session.route,
    state: {
      metrics: nextMetrics,
      world: {
        turn: nextTurn,
        phase: nextPhase,
        chapter: nextChapter,
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
      flags: [...flagSet],
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
    chapter: aiTurn.chapterLabel || nextChapter,
    title: aiTurn.title,
    location: aiTurn.location,
    narrative: aiTurn.narrative,
    choices: nextChoices,
  };

  return {
    scene,
    session: nextSession,
    mode,
  };
}
