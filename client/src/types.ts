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

export interface WorldState {
  turn: number;
  phase: string;
  chapter: string;
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
  };
  history: Array<{
    turn: number;
    playerChoice: string;
    summary: string;
  }>;
  availableChoices: Choice[];
}

export interface GameResponse {
  scene: StoryScene;
  session: GameSession;
  mode: "openai" | "fallback";
}

