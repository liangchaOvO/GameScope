import type { MetricId } from "../metrics/types";

/**
 * 意图解析 Prompt（<5K tokens 硬约束）。
 * 目录固定 12 条 + schema + 2 个 few-shot，中文为主；估算函数用于运行时守卫。
 */

export const MAX_INPUT_TOKENS = 5000;

/** 12 指标目录（与模板看板同源：id 即 METRIC_REGISTRY 的 key）。 */
export const METRIC_CATALOG: { id: MetricId; name: string; desc: string }[] = [
  { id: "wishlist-accumulation", name: "愿望单积累速率", desc: "周净增与脉冲（新品节/折扣等非自然增长）" },
  { id: "wishlist-deletion-rate", name: "愿望单删单率", desc: "删单占意愿变化的比重" },
  { id: "wishlist-visit-conversion", name: "愿望单/页面访问转化", desc: "访问→加愿望单" },
  { id: "wishlist-launch-conversion", name: "愿望单→首周销量转化", desc: "发售前愿望单变成首周销量的比例" },
  { id: "first-week-share", name: "首周销量占比", desc: "首周占首月销量（长尾型 vs 脉冲型）" },
  { id: "page-conversion", name: "页面转化率", desc: "访问→购买" },
  { id: "refund-rate", name: "退款率", desc: "退款占毛销量" },
  { id: "discount-pulse-coefficient", name: "折扣愿望单脉冲系数", desc: "发售后折扣/活动期愿望单增速倍数" },
  { id: "review-sales-estimate", name: "评论销量估算", desc: "按评论数粗估销量区间（Boxleiter）" },
  { id: "review-score-tier", name: "好评率分档", desc: "Steam 评价档位" },
  { id: "traffic-source-structure", name: "流量来源结构", desc: "访问的来源构成" },
  { id: "regional-sales-structure", name: "地区销售结构", desc: "销量的国家/地区构成" },
];

/** 不在数据范围内的常见请求 → 引导 LLM 输出 unknown（代码层另有守卫）。 */
const OUT_OF_SCOPE = [
  "收入/美元/流水金额/分成/到账（数据只有销量份数，没有金额）",
  "竞品或其他游戏的数据（本工具只分析你自己的单款游戏）",
  "预测未来销量（预测建模不在当前版本）",
  "评论/差评的文本内容分析（只有汇总好评率）",
  "游玩时长、主播归因、导出文件、写文案等非指标查询",
];

export function buildIntentPrompt(question: string, dataWindow: string): string {
  const catalog = METRIC_CATALOG.map((m) => `- ${m.id}：${m.name}（${m.desc}）`).join("\n");
  return [
    "你是 GameScope 的意图解析器。任务：把独立游戏开发者关于自己 Steam 游戏数据的问题，解析为意图 JSON。",
    "只能输出一个 JSON 对象，不要输出任何其他文字，不要输出任何数值计算结果。",
    "",
    "可用指标目录（metricId 必须逐字取自下表）：",
    catalog,
    "",
    `数据时间窗口：${dataWindow}`,
    "",
    "以下请求超出数据范围，必须输出 unknown：",
    ...OUT_OF_SCOPE.map((s) => `- ${s}`),
    "",
    "输出 schema：",
    '{"intent":"metric_query|unknown","metricId":"目录中的 id 或 null","dimension":"weekly|daily|source|country|null","timeRange":{"from":"YYYY-MM-DD 或 null","to":"YYYY-MM-DD 或 null"}}',
    "规则：定位不到指标时 intent=unknown 且 metricId=null；不要编造指标 id；时间只在用户明确说了才填。",
    "",
    '例1 输入「愿望单最近涨得怎么样」输出 {"intent":"metric_query","metricId":"wishlist-accumulation","dimension":"weekly","timeRange":{"from":null,"to":null}}',
    '例2 输入「帮我预测下个月销量」输出 {"intent":"unknown","metricId":null,"dimension":null,"timeRange":{"from":null,"to":null}}',
    "",
    `问题：${question}`,
  ].join("\n");
}

/** Token 估算（中文为主的混合文本，按 ~1.7 字符/token 估）。仅用于预算守卫与展示。 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.7);
}

/** 生成 prompt 后调用：超预算直接抛错（目录固定，实际不会触发）。 */
export function assertWithinBudget(prompt: string): void {
  const est = estimateTokens(prompt);
  if (est > MAX_INPUT_TOKENS) {
    throw new Error(`意图 prompt 超出 ${MAX_INPUT_TOKENS} tokens 预算（估算 ${est}）`);
  }
}
