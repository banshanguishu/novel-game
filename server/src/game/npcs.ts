import type { NpcProfile } from "../types.js";

export const INITIAL_NPCS: NpcProfile[] = [
  {
    id: "xiao_qingyan",
    name: "萧清晏",
    title: "大雍女帝",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_3",
    visible: false,
  },
  {
    id: "su_wanqing",
    name: "苏晚卿",
    title: "民间才女",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_1",
    visible: false,
  },
  {
    id: "zhou_hu",
    name: "周虎",
    title: "底层军卒",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_1",
    visible: false,
  },
  {
    id: "li_taifu",
    name: "李太傅",
    title: "忠心皇室的老臣",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_2",
    visible: false,
  },
  {
    id: "beipingwang",
    name: "北平王",
    title: "北方藩镇之主",
    attitude: "未知",
    relationship: "未接触",
    firstAppearChapter: "chapter_3",
    visible: false,
  },
];

export function createInitialNpcs(): NpcProfile[] {
  return INITIAL_NPCS.map((npc) => ({ ...npc }));
}

export function getVisibleNpcs(npcs: NpcProfile[]): NpcProfile[] {
  return npcs.filter((npc) => npc.visible);
}

export function activateNpcsForChapter(npcs: NpcProfile[], chapterId: string): NpcProfile[] {
  return npcs.map((npc) => {
    if (!npc.visible && npc.firstAppearChapter === chapterId) {
      return { ...npc, visible: true };
    }
    return npc;
  });
}
