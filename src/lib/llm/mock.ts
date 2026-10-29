import type { LlmProvider } from "./provider";

/**
 * MockProvider —— 仅用于单元回归与离线演示（id=mock）。
 * 确定性关键词规则，不是 LLM：它证明的是「管道 + 校验 + 守卫」的接线正确性，
 * 不代表 LLM 的语义理解质量；正式评测用 scripts/ask-eval.mjs 走真实 Provider。
 */
export class MockProvider implements LlmProvider {
  readonly id = "mock";

  // 关键词 → 指标（按匹配优先级排列：占比/首月 先于 首周，避免「首周销量占首月」误路由）
  private readonly rules: { keywords: string[]; metricId: string }[] = [
    { keywords: ["删单", "删掉", "删除愿望", "删了"], metricId: "wishlist-deletion-rate" },
    { keywords: ["加愿望单", "加了愿望", "愿望单转化率", "加购"], metricId: "wishlist-visit-conversion" },
    { keywords: ["占比", "首月", "长尾", "脉冲型"], metricId: "first-week-share" },
    { keywords: ["首周", "发售"], metricId: "wishlist-launch-conversion" },
    { keywords: ["页面转化", "转化率"], metricId: "page-conversion" },
    { keywords: ["退款"], metricId: "refund-rate" },
    { keywords: ["折扣", "打折", "促销"], metricId: "discount-pulse-coefficient" },
    { keywords: ["评论", "估算销量"], metricId: "review-sales-estimate" },
    { keywords: ["好评", "档位", "评价"], metricId: "review-score-tier" },
    { keywords: ["流量", "来源"], metricId: "traffic-source-structure" },
    { keywords: ["国家", "地区"], metricId: "regional-sales-structure" },
    { keywords: ["愿望单"], metricId: "wishlist-accumulation" },
  ];

  // 陷阱信号：命中即 unknown（管道将降级，绝不产出数值）
  private readonly trapKeywords = [
    "博德之门", "竞品", "别的游戏", "其他游戏", "美元", "赚", "流水", "分成", "到账",
    "预测", "下个月能卖", "主播", "带火", "小时", "导出", "excel", "写一段", "公告",
    "差评", "抱怨",
  ];

  async interpretIntent(question: string): Promise<unknown> {
    const q = question.toLowerCase();
    if (this.trapKeywords.some((k) => q.includes(k))) {
      return { intent: "unknown", metricId: null, dimension: null, timeRange: { from: null, to: null } };
    }
    for (const rule of this.rules) {
      if (rule.keywords.some((k) => q.toLowerCase().includes(k))) {
        return {
          intent: "metric_query",
          metricId: rule.metricId,
          dimension: null,
          timeRange: this.parseTimeRange(question),
        };
      }
    }
    return { intent: "unknown", metricId: null, dimension: null, timeRange: { from: null, to: null } };
  }

  private parseTimeRange(question: string): { from: string | null; to: string | null } {
    // 演示数据窗口止于 2026-10-25；「最近 N 天」以该日期为锚（确定性，供回归断言）
    const anchor = "2026-10-25";
    const m30 = /最近\s*30\s*天|近一个月/.exec(question);
    const m7 = /最近\s*7\s*天|最近一周|这一周/.exec(question);
    if (m7) return { from: "2026-10-19", to: anchor };
    if (m30) return { from: "2026-09-26", to: anchor };
    return { from: null, to: null };
  }
}
