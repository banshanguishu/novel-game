import type { Metrics } from "../types.js";

interface MetricTier {
  threshold: number;
  description: string;
}

const METRIC_TIERS: Record<keyof Metrics, MetricTier[]> = {
  reputation: [
    { threshold: 0, description: "无人知晓的流民" },
    { threshold: 10, description: "在市井小有名气" },
    { threshold: 25, description: "地方上颇具声望" },
    { threshold: 50, description: "朝堂内外广为传颂" },
    { threshold: 75, description: "天下皆知的名臣" },
  ],
  imperialFavor: [
    { threshold: 0, description: "未入圣听" },
    { threshold: 10, description: "略有耳闻" },
    { threshold: 25, description: "获得女帝留意" },
    { threshold: 50, description: "深得女帝信赖" },
    { threshold: 75, description: "女帝倚为心腹" },
  ],
  peopleSupport: [
    { threshold: 0, description: "在百姓中毫无根基" },
    { threshold: 10, description: "身边有少许追随者" },
    { threshold: 25, description: "在民间积累了一定声望" },
    { threshold: 50, description: "百姓视其为可依靠之人" },
    { threshold: 75, description: "民心所向，振臂一呼应者云集" },
  ],
  intrigue: [
    { threshold: 0, description: "对权谋一无所知" },
    { threshold: 10, description: "初窥门道，开始懂得察言观色" },
    { threshold: 25, description: "已初具权谋嗅觉，低阶官吏有所忌惮" },
    { threshold: 50, description: "权谋老道，能在朝堂博弈中周旋" },
    { threshold: 75, description: "运筹帷幄，各方势力不敢小觑" },
  ],
  military: [
    { threshold: 0, description: "手无缚鸡之力" },
    { threshold: 10, description: "略知兵事" },
    { threshold: 25, description: "有带兵经验，能统领小队" },
    { threshold: 50, description: "可独当一面的将领之才" },
    { threshold: 75, description: "兵权在握，能号令三军" },
  ],
  wealth: [
    { threshold: 0, description: "身无分文" },
    { threshold: 10, description: "能维持温饱" },
    { threshold: 25, description: "有一定积蓄和产业" },
    { threshold: 50, description: "家资殷实，可调动不少资源" },
    { threshold: 75, description: "坐拥丰厚产业，财力雄厚" },
  ],
};

function getMetricDescription(field: keyof Metrics, value: number): string {
  const tiers = METRIC_TIERS[field];
  let matched = tiers[0];
  for (const tier of tiers) {
    if (value >= tier.threshold) {
      matched = tier;
    }
  }
  return matched.description;
}

const METRIC_LABELS: Record<keyof Metrics, string> = {
  reputation: "名声",
  imperialFavor: "圣眷",
  peopleSupport: "民心",
  intrigue: "权谋",
  military: "兵权",
  wealth: "财富",
};

export function buildMetricsDescription(metrics: Metrics): string {
  return (Object.keys(METRIC_LABELS) as Array<keyof Metrics>)
    .map((field) => `${METRIC_LABELS[field]}（${metrics[field]}）：${getMetricDescription(field, metrics[field])}`)
    .join("\n");
}
