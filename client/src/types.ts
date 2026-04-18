export type ChoiceIntent =
  | "power"
  | "people"
  | "caution"
  | "emotion"
  | "action";

export interface Choice {
  id: string;
  label: string;
  intent: ChoiceIntent;
}

export interface StoryScene {
  chapter: string;
  title: string;
  location: string;
  narrative: string[];
  choices: Choice[];
}

export interface Metrics {
  reputation: number;
  imperialFavor: number;
  peopleSupport: number;
  intrigue: number;
  military: number;
  wealth: number;
}

export interface NpcProfile {
  id: string;
  name: string;
  title: string;
  attitude: string;
  relationship: string;
  firstAppearChapter: string;
  visible: boolean;
}

export interface ChapterSummary {
  chapterId: string;
  summary: string;
  keyEvents: string[];
}

export interface StoryMemory {
  relationships: Array<{
    npcId: string;
    description: string;
  }>;
  unresolvedHooks: string[];
}

export interface WorldState {
  turn: number;
  phase: string;
  chapter: string;
  chapterId: string;
  chapterTurn: number;
  routeFocus: string;
  imperialAuthority: number;
  factionProgress: number;
}

export interface GameSession {
  protagonistName: string;
  route: "权谋";
  state: {
    metrics: Metrics;
    world: WorldState;
    flags: string[];
    npcs: NpcProfile[];
    chapterSummaries: ChapterSummary[];
    storyMemory: StoryMemory;
  };
  history: Array<{
    turn: number;
    playerChoice: string;
    rejectedChoices: string[];
    summary: string;
  }>;
  availableChoices: Choice[];
}

export interface ChapterTransitionData {
  completedChapter: {
    id: string;
    name: string;
    summary: string;
    keyEvents: string[];
  };
  metricsComparison: {
    before: Metrics;
    after: Metrics;
  };
  npcChanges: Array<{
    name: string;
    oldAttitude: string;
    newAttitude: string;
    relationship: string;
  }>;
  nextChapter: {
    id: string;
    name: string;
  };
}

export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  mode: "openai" | "fallback";
  chapterTransition?: ChapterTransitionData;
}
