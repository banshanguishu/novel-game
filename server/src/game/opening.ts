import type { Choice, GameSession, StoryScene } from "../types.js";

const openingChoices: Choice[] = [
  {
    id: "opening-soup",
    label: "先去义粥棚附近找搬运活计，保住今天的口粮。",
    intent: "people",
  },
  {
    id: "opening-soldier",
    label: "替破庙外受伤军卒止血，试着换一份情报与活路。",
    intent: "action",
  },
  {
    id: "opening-poem",
    label: "带着记忆中的诗句去城门文棚碰碰运气，赌一线出头机会。",
    intent: "power",
  },
];

export function createInitialSession(protagonistName: string): GameSession {
  return {
    protagonistName,
    route: "权谋",
    state: {
      metrics: {
        reputation: 3,
        imperialFavor: 0,
        peopleSupport: 4,
        intrigue: 6,
        military: 1,
        wealth: 1,
      },
      world: {
        turn: 1,
        phase: "草根求生",
        chapter: "第一章",
        routeFocus: "专注权谋",
        imperialAuthority: 8,
        factionProgress: 0,
      },
      flags: ["opening_started", "male_protagonist", "power_route_locked"],
    },
    history: [],
    availableChoices: openingChoices,
  };
}

export function createOpeningScene(session: GameSession): StoryScene {
  return {
    chapter: "第一章",
    title: "破庙夜雨",
    location: "大雍北境·青石渡外",
    narrative: [
      `冷雨顺着残破的瓦缝滴下来，打在你的眉骨上。你睁开眼时，脑中仍残留着前世办公室的白炽灯和键盘声，可眼前只剩一座漏风的破庙、一身单薄麻衣，以及饿得发抖的身子。你如今名叫${session.protagonistName}，是大雍北境一名连户籍都没有的流民。`,
      "庙外官道泥泞，远处隐约传来军靴踏水与差役喝斥的声音。今夜若再找不到口粮与容身之处，你大概率会和庙角那具无人收殓的尸首一样，在明日天亮前无声无息地烂在乱世里。",
      "可你也很清楚，自己手里不是全然没有筹码。你记得诗词，懂一点止血净水的法子，也懂世道越乱，越要先找准能让自己活下去、再往上爬的第一道台阶。雨势渐大，你必须立刻做决定。",
    ],
    choices: session.availableChoices,
  };
}
