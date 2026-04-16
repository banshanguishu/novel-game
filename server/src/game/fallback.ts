import type { AiTurn } from "./schema.js";
import type { ChapterSummaryResponse } from "./schema.js";
import type { ChoiceIntent, GameSession } from "../types.js";

interface FallbackChoiceTemplate {
  label: string;
  intent: ChoiceIntent;
}

interface FallbackSceneTemplate {
  title: string;
  location: string;
  lines: string[];
  summary: string;
  suggestedState: AiTurn["suggestedState"];
  choices: FallbackChoiceTemplate[];
}

function chapter1Scene(intent: ChoiceIntent): FallbackSceneTemplate {
  if (intent === "people") {
    return {
      title: "粥棚前的眼线",
      location: "青石渡义粥棚",
      lines: [
        "你在义粥棚前替人搬运柴草，勉强混到一碗热粥。混乱的人群里，你注意到几名差役并不急着驱赶流民，而是在暗中记名盘查，显然是在替上头挑人做苦役。",
        "你顺手帮一个被挤倒的老妇人捡回粮袋，也因此从她口中得知，县衙这两日正在秘密招募识字之人誊抄军需簿册。对流民来说，那或许是离官府最近、也最危险的一条路。",
        "你意识到，单靠讨活难有出头日，若想往上走，必须尽快让自己从乌泱泱的人群里被看见。",
      ],
      summary: "你借义粥棚的人情与传闻，摸到了一条接近县衙的门路。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 2, intrigueDelta: 1,
        militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 0, factionProgressDelta: 1,
        flagsToAdd: ["heard_county_recruitment"],
      },
      choices: [
        { label: "借识字的机会接近县衙书吏，摸清谁在幕后调人。", intent: "power" },
        { label: "继续在流民中施恩，先攒一批愿意跟你走的人手。", intent: "people" },
        { label: "不急着现身，先盯住那几名差役的行踪与口风。", intent: "caution" },
      ],
    };
  }

  if (intent === "action") {
    return {
      title: "血迹里的军报",
      location: "青石渡破庙外",
      lines: [
        "你替那名受伤军卒止住了血，又用破布和草灰勉强包扎好伤口。他原本戒备极重，见你手法利落，这才咬牙透露自己是押运军报的小卒，途中遭了流匪伏击。",
        "在他含糊断续的话里，你听见了一个极敏感的消息：北境镇军近来调动频繁，似乎有人在试探朝廷底线。若这消息为真，边地很快就要再乱一轮。",
        "军卒临昏迷前将一枚刻着营号的木牌塞进你手里。那不值几个钱，却可能是你接近军伍与官府的第一块敲门砖。",
      ],
      summary: "你救下伤卒，拿到一条涉军线索和一枚可用来试探军伍关系的木牌。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 0, intrigueDelta: 1,
        militaryDelta: 2, wealthDelta: 0, imperialAuthorityDelta: 0, factionProgressDelta: 1,
        flagsToAdd: ["obtained_military_token"],
      },
      choices: [
        { label: "循着木牌去寻那支镇军的营地，试探军中缺口。", intent: "action" },
        { label: "把军情藏在心里，先查是谁敢在北境截军报。", intent: "power" },
        { label: "暂不露声色，先找个可靠落脚处把命保稳。", intent: "caution" },
      ],
    };
  }

  return {
    title: "文棚初试锋芒",
    location: "青石渡北门文棚",
    lines: [
      "你冒雨赶到城门文棚时，几名穷酸书生正围着炭盆争论诗句。你借着替人润笔写信的机会，提笔写下改写过的七言短诗，寥寥几句便压住了满棚喧哗。",
      "文棚掌事原本只把你当乞食流民，待看见那笔字与句中气象，神色立刻变了。他没敢当众夸你，却悄悄留下话，说县中一位幕僚近来正在寻有文墨底子的寒士。",
      "你清楚，这不是平步青云，而是一张极窄的门缝。只要伸手伸得稳，你就能从这道缝里挤进真正决定命运的地方。",
    ],
    summary: "你在文棚露了一手，成功引起了县中幕僚的注意。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 0, peopleSupportDelta: 0, intrigueDelta: 2,
      militaryDelta: 0, wealthDelta: 0, imperialAuthorityDelta: 0, factionProgressDelta: 1,
      flagsToAdd: ["entered_literati_circle"],
    },
    choices: [
      { label: "顺着这位幕僚的门路递诗卷，争取面见县中主事。", intent: "power" },
      { label: "借文棚名声结交落魄书生，先织一张消息网。", intent: "people" },
      { label: "不急着投门，先打听这位幕僚属于哪一派的人。", intent: "caution" },
    ],
  };
}

function chapter2Scene(session: GameSession, intent: ChoiceIntent): FallbackSceneTemplate {
  if (intent === "people") {
    return {
      title: "流民册上的名字",
      location: "青石渡县衙外巷",
      lines: [
        "靠着几日积下的人情，你在流民里找到了几个愿替你传话跑腿的人。众人本只求一口安稳饭食，可在你的安排下，这些散乱的耳目竟慢慢连成了一张粗糙却管用的消息网。",
        "你很快得知，县衙近来正为安置流民与征发徭役焦头烂额。谁能提出既不触怒上头、又能稳住民情的办法，谁就有可能从贱籍泥沼里抬起头来。",
        "你忽然明白，底层不是负担，而是这乱世里最容易被上位者忽视、也最值得下注的筹码。",
      ],
      summary: "你开始在流民中积蓄人脉，也看到了用民心撬动仕途的可能。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 3, intrigueDelta: 1,
        militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 1, factionProgressDelta: 1,
        flagsToAdd: ["built_commoner_network"],
      },
      choices: [
        { label: "整理流民诉求，借机向县衙献上一套安置之策。", intent: "power" },
        { label: "扩张消息网，把市井、驿站与粮行都串联起来。", intent: "people" },
        { label: "暂时收缩人手，先查清县衙里谁最忌惮流民抱团。", intent: "caution" },
      ],
    };
  }

  if (intent === "action") {
    return {
      title: "营门外的试探",
      location: "北境镇军营外",
      lines: [
        "你拿着那枚营号木牌，赶到镇军营外。哨兵最初将你视作可疑流民，可在你报出伤卒留下的营号与伏击方位后，对方脸色立刻沉了下去。",
        "营中一名低阶校尉接见了你。他没有给你好脸色，却一口一句逼问你如何得知此事。你从他的反应里看出，军报被截并非孤例，营中上下显然有人刻意压着不报。",
        "这是一条险路。走得好，你能借军中裂缝攀上第一层阶；走不好，尸体明日就会浮在护城河里。",
      ],
      summary: "你正式触碰到镇军内部的隐秘裂缝，军中关系开始向你打开一线。",
      suggestedState: {
        reputationDelta: 1, imperialFavorDelta: 0, peopleSupportDelta: 0, intrigueDelta: 2,
        militaryDelta: 2, wealthDelta: 0, imperialAuthorityDelta: 0, factionProgressDelta: 2,
        flagsToAdd: ["touched_military_rift"],
      },
      choices: [
        { label: "顺势依附那名校尉，换取一个能出入营门的身份。", intent: "action" },
        { label: "把军中异样记在心里，转而向县衙换取更大的筹码。", intent: "power" },
        { label: "不再深入，先确认这名校尉到底是敌是友。", intent: "caution" },
      ],
    };
  }

  return {
    title: "县署前的试卷",
    location: "青石渡县署",
    lines: [
      "你依着文棚那条线，终于见到了县中幕僚。对方没有急着收你入门，只把一卷堆满错讹的粮册推到案前，冷眼看你是否真有本事，而不只是会写几句漂亮诗文。",
      "你一边校勘账目，一边从数字里看出了更深的东西：今年县中粮耗异常，既不像天灾，也不像寻常官吏贪墨，更像是有人借流民与军需做账，悄悄养肥别处势力。",
      "幕僚看你的眼神第一次有了变化。他没有夸赞，只轻轻说了一句，你若敢继续查下去，日后见到的便不只是县令。",
    ],
    summary: "你凭账册显出真本事，并嗅到了一条通往更高层权力的线索。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 1, peopleSupportDelta: 0, intrigueDelta: 3,
      militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 1, factionProgressDelta: 1,
      flagsToAdd: ["noticed_supply_corruption"],
    },
    choices: [
      { label: "继续追查粮册去向，揪出县中真正做账的人。", intent: "power" },
      { label: "先借幕僚赏识站稳脚跟，再慢慢经营士林名声。", intent: "people" },
      { label: "把证据先藏住，观察县令与幕僚谁更值得下注。", intent: "caution" },
    ],
  };
}

function chapter3Scene(session: GameSession): FallbackSceneTemplate {
  const hasCorruptionClue = session.state.flags.includes("noticed_supply_corruption");

  if (hasCorruptionClue) {
    return {
      title: "入京的密札",
      location: "王畿驿道",
      lines: [
        "粮册案越查越深，已经不是一县一地的亏空，而是牵连北境军需与世家买办的暗线。幕僚不敢再压，索性将你整出的证据誊成密札，借驿站快马递往王畿。",
        "数日后，来自京中的回信到了。回信极短，只让送札之人即刻入京陈情。你看着那方暗红印记，知道真正的棋局终于从县署小案，推到了朝堂边缘。",
        "可你也明白，京城不是青石渡。那里每一句话都能换来前程，也能换来断头。",
      ],
      summary: "你的查案结果惊动了京中势力，主线正式转向朝堂。",
      suggestedState: {
        reputationDelta: 2, imperialFavorDelta: 2, peopleSupportDelta: 1, intrigueDelta: 3,
        militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 2, factionProgressDelta: 2,
        flagsToAdd: ["summoned_to_capital"],
      },
      choices: [
        { label: "带着证据入京，直接赌一把朝堂里的识人之明。", intent: "power" },
        { label: "先补齐沿途人脉和护身筹码，再动身入京。", intent: "people" },
        { label: "暗中留一份副本，防着有人半路灭口夺证。", intent: "caution" },
      ],
    };
  }

  return {
    title: "县治初成",
    location: "青石渡县衙",
    lines: [
      "你提出的安置与分流之策开始见效，原本乱作一团的流民营地终于有了秩序。县令对你仍有戒心，但已不得不承认，你比衙中那群只会催税的旧吏更懂得如何稳住局势。",
      "县里名声渐起后，越来越多人开始主动来见你。有人求活路，有人献消息，也有人想借你的名头攀附更高门路。你第一次切身体会到，真正的权谋不是大声压人，而是让别人心甘情愿地来求你。",
      "这份势头若继续累积，你就不再只是一个暂时得用的寒门小吏，而会成为某些人必须提前拉拢或提前除掉的人。",
    ],
    summary: "你在县治中站稳位置，开始具备真正意义上的政治筹码。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 1, peopleSupportDelta: 2, intrigueDelta: 2,
      militaryDelta: 0, wealthDelta: 1, imperialAuthorityDelta: 1, factionProgressDelta: 1,
      flagsToAdd: ["county_reputation_established"],
    },
    choices: [
      { label: "借政绩上书，主动争取更高层官员的注意。", intent: "power" },
      { label: "把县中人手编织成稳固班底，为后路先蓄势。", intent: "people" },
      { label: "先收敛锋芒，看看哪一方会最先对你动手。", intent: "caution" },
    ],
  };
}

function genericLateScene(): FallbackSceneTemplate {
  return {
    title: "朝局风声",
    location: "王畿近郊",
    lines: [
      "一路北上，你见到的不是太平王都，而是被重税、军备与流言层层压着的王畿。外有藩镇窥伺，内有世家掣肘，朝廷看似仍握天下名义，实则每一步都走得艰难。",
      "你带来的线索与前期积累的人脉，终于让几位旧臣开始认真看待你。可他们看中的不仅是你的才干，更是你能否成为那把对付藩镇与世家的新刀。",
      "这是机会，也是试炼。你若能接住，便是踏入朝堂；接不住，便只是又一个被权力磨碎的寒门过客。",
    ],
    summary: "你已经站到朝局边缘，下一步会真正进入与藩镇、世家、皇权的正面博弈。",
    suggestedState: {
      reputationDelta: 2, imperialFavorDelta: 2, peopleSupportDelta: 1, intrigueDelta: 3,
      militaryDelta: 1, wealthDelta: 1, imperialAuthorityDelta: 2, factionProgressDelta: 2,
      flagsToAdd: ["entered_central_stage"],
    },
    choices: [
      { label: "主动靠近忠于皇室的旧臣，先把自己放进帝党视野。", intent: "power" },
      { label: "从市井与驿站下手，先补齐王畿内外的情报网。", intent: "people" },
      { label: "先不急着表态，摸清三方势力的真实底牌再动。", intent: "caution" },
    ],
  };
}

function buildScene(session: GameSession, intent: ChoiceIntent): FallbackSceneTemplate {
  const chapterId = session.state.world.chapterId;

  switch (chapterId) {
    case "chapter_1":
      return chapter1Scene(intent);
    case "chapter_2":
      return chapter2Scene(session, intent);
    case "chapter_3":
      return chapter3Scene(session);
    default:
      return genericLateScene();
  }
}

export function createFallbackTurn(session: GameSession, _choiceLabel: string, intent: ChoiceIntent): AiTurn {
  const scene = buildScene(session, intent);

  return {
    title: scene.title,
    location: scene.location,
    chapterLabel: session.state.world.chapter,
    narrative: scene.lines,
    summary: scene.summary,
    suggestedState: scene.suggestedState,
    choices: scene.choices,
  };
}

export function createFallbackChapterSummary(session: GameSession): ChapterSummaryResponse {
  const chapterId = session.state.world.chapterId;
  const historyEvents = session.history.map((h) => h.summary).slice(0, 4);

  const summaries: Record<string, string> = {
    chapter_1: `${session.protagonistName}以流民之身在青石渡艰难求生，凭借现代知识与诗词才华初步站稳脚跟，引起了地方势力的注意，为后续进入仕途打下了基础。`,
    chapter_2: `${session.protagonistName}在县中崭露头角，通过文才与谋略赢得幕僚赏识，开始触及地方权力核心，逐渐从一介寒士蜕变为有分量的棋子。`,
    chapter_3: `${session.protagonistName}的名声与能力终于传至朝堂，获得入京机会，正式踏入与藩镇、世家、皇权的三方博弈之中。`,
    chapter_4: `${session.protagonistName}在朝堂中站稳脚跟，凭借军事才能和政治手腕，开始统领兵马平定各方割据势力。`,
  };

  return {
    summary: summaries[chapterId] ?? `${session.protagonistName}在本章中继续推进权谋主线，势力与影响力稳步扩大。`,
    keyEvents: historyEvents.length > 0 ? historyEvents : ["完成本章主要剧情推进"],
    npcUpdates: [],
    unresolvedHooks: session.state.storyMemory.unresolvedHooks,
  };
}
