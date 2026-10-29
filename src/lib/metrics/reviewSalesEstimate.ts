import type { StoredSnapshots } from "../db/store";
import { fmtInt } from "../format";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 9：评论销量估算（长线运营 · Boxleiter 数）
 * 销量 ≈ 评论数 × 25–70。区间跨度大，必须展示为区间并注明是粗估（社区经验值，非官方标准）。
 */
export function computeReviewSalesEstimate(
  snapshots: StoredSnapshots,
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "review-sales-estimate" as const,
    name: "评论销量估算（Boxleiter）",
    subtitle: "按评论数粗估总销量区间",
    group: "liveops" as const,
    caliber: {
      definition: "用 Steam 评论数按 Boxleiter 经验倍数粗估总销量。",
      formula: "估算销量 ≈ 评论数 × 25 ~ 评论数 × 70（区间展示）",
      fields: ["评论总数（Steam 评价快照）"],
      rowCount: 1,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "不暴露真实销量时，用评论数反推大概卖了多少。",
      why: "留下评论的玩家占比长期稳定（约 1/25–1/70），倍数区间即误差带。",
      range: "无固定；跨度大（25–70 倍），只做量级参考（经验值，非官方标准）。",
      next: "问「按我的定价估算流水多少」「折扣后评论增速有没有变」。",
    },
    chartData: {
      kind: "bars" as const,
      items: [],
      unit: "int" as const,
    },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || snapshots.reviews == null) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: "粗估：评论数 × 25–70（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote: "还没有 Steam 评价快照：在页面顶部输入 App ID 拉取公开评论后自动计算。",
    };
  }

  const n = snapshots.reviews.totalReviews;
  const min = n * 25;
  const max = n * 70;

  return {
    ...base,
    status: "info",
    statusLabel: "粗估",
    display: `${fmtInt(min)} – ${fmtInt(max)}`,
    secondary: `评论数 ${fmtInt(n)}（快照 ${snapshots.fetchedAt?.slice(0, 10) ?? "—"}）`,
    rangeNote:
      "粗估：Boxleiter 数为社区经验倍数（×25–×70），跨度大，实际可能超出区间，仅做量级参考（非官方标准）。",
    caliber: {
      ...base.caliber,
      dateRange: null,
      windowNote: `基于 ${snapshots.fetchedAt?.slice(0, 10) ?? "—"} 的评价快照（累计值，非本期）。`,
      sourceFiles: [source.filename],
    },
    chartData: {
      kind: "bars",
      items: [
        { label: "下界 ×25", value: min, color: "#94a3b8" },
        { label: "上界 ×70", value: max, color: "#6366f1" },
      ],
      unit: "int",
      horizontal: true,
    },
    warnings: source.warnings,
  };
}
