import type { Metrics } from "../types.js";

export interface ChapterTransitionCondition {
  type: "metric" | "flag";
  field?: keyof Metrics;
  threshold?: number;
  flag?: string;
}

export interface ChapterConfig {
  id: string;
  name: string;
  minTurns: number;
  maxTurns: number;
  transitionConditions: ChapterTransitionCondition[];
}

export const CHAPTERS: ChapterConfig[] = [
  {
    id: "chapter_1",
    name: "草根求生",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "reputation", threshold: 15 },
      { type: "flag", flag: "entered_literati_circle" },
    ],
  },
  {
    id: "chapter_2",
    name: "文人扬名",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "intrigue", threshold: 30 },
      { type: "flag", flag: "noticed_supply_corruption" },
    ],
  },
  {
    id: "chapter_3",
    name: "朝堂博弈",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "imperialFavor", threshold: 25 },
      { type: "flag", flag: "summoned_to_capital" },
    ],
  },
  {
    id: "chapter_4",
    name: "平定天下",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [
      { type: "metric", field: "military", threshold: 40 },
      { type: "flag", flag: "military_command_granted" },
    ],
  },
  {
    id: "chapter_5",
    name: "盛世开创",
    minTurns: 3,
    maxTurns: 6,
    transitionConditions: [],
  },
];

export function getChapterConfig(chapterId: string): ChapterConfig {
  const config = CHAPTERS.find((c) => c.id === chapterId);
  if (!config) {
    throw new Error(`未知章节: ${chapterId}`);
  }
  return config;
}

export function getNextChapterId(currentChapterId: string): string | null {
  const index = CHAPTERS.findIndex((c) => c.id === currentChapterId);
  if (index < 0 || index >= CHAPTERS.length - 1) {
    return null;
  }
  return CHAPTERS[index + 1].id;
}

export function shouldTransitionChapter(
  chapterId: string,
  chapterTurn: number,
  metrics: Metrics,
  flags: string[],
): boolean {
  const config = getChapterConfig(chapterId);
  const nextId = getNextChapterId(chapterId);

  if (!nextId) {
    return false;
  }

  if (chapterTurn >= config.maxTurns) {
    return true;
  }

  if (chapterTurn < config.minTurns) {
    return false;
  }

  return config.transitionConditions.some((condition) => {
    if (condition.type === "metric" && condition.field && condition.threshold !== undefined) {
      return metrics[condition.field] >= condition.threshold;
    }
    if (condition.type === "flag" && condition.flag) {
      return flags.includes(condition.flag);
    }
    return false;
  });
}
