import type { WishDayRow } from "../types";
import { isoWeekStart, minMaxDates, weekLabel } from "../dates";
import { fmtInt, fmtSignedInt } from "../format";
import { mean, safeDiv, sum } from "./util";
import { detectPulseDays } from "./pulse";
import type { MetricResult, MetricSource, WeekBar } from "./types";

/**
 * 模板 1：愿望单积累速率（发售前 · 愿望单健康）
 * 周净增 + 自然增长/活动脉冲拆分。脉冲日判定见共享模块 pulse.ts（经验规则）。
 */

function dailyNet(r: WishDayRow): number {
  return (
    r.net ??
    (r.adds ?? 0) - (r.deletes ?? 0) - (r.purchases ?? 0) - (r.gifts ?? 0)
  );
}

export function computeWishlistAccumulation(
  rows: WishDayRow[],
  source: MetricSource | null
): MetricResult {
  const unavailable: MetricResult = {
    id: "wishlist-accumulation",
    name: "愿望单积累速率",
    subtitle: "周净增 · 区分自然增长与活动脉冲",
    group: "prelaunch",
    status: "unavailable",
    statusLabel: "缺少数据",
    display: "—",
    rangeNote:
      "该指标无统一健康区间（随游戏阶段差异大）；经验上发售前周净增持续为正、稳步抬升更健康（经验值，非官方标准）。",
    caliber: {
      definition: "每周愿望单净增量及其构成（自然增长 vs 活动脉冲）。",
      formula:
        "周净增 = Σ(新增 − 删单 − 购买移除 − 礼物移除)；脉冲日：当日新增 ≥ max(3 × 前28天非脉冲日新增中位数, 中位数+20)",
      fields: ["新增", "删单", "购买移除", "礼物移除", "总量"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [],
    },
    teaching: {
      what: "每周愿望单净增多少，涨势是否健康。",
      why: "净增=新增−删单−购买/礼物移除，只看新增会高估。",
      range: "无固定标准；发售前持续为正、稳步抬升较健康（经验值，非官方标准）。",
      next: "问「脉冲周贡献了多少」「删单率是否超 8%」。",
    },
    chartData: { kind: "weekly-net", weeks: [] },
    warnings: [],
  };

  if (!source || rows.length === 0) return unavailable;

  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const pulses = detectPulseDays(sorted);

  // weekly buckets (ISO weeks, Monday start)
  const weekMap = new Map<string, WeekBar>();
  const weekOrder: string[] = [];
  sorted.forEach((r, i) => {
    const wk = isoWeekStart(r.date);
    let bar = weekMap.get(wk);
    if (!bar) {
      bar = { label: weekLabel(wk), net: 0, pulse: false, pulseAdds: 0, totalEnd: null };
      weekMap.set(wk, bar);
      weekOrder.push(wk);
    }
    bar.net += dailyNet(r);
    if (pulses[i]) {
      bar.pulse = true;
      bar.pulseAdds += r.adds ?? 0;
    }
    bar.totalEnd = r.total ?? bar.totalEnd;
  });
  const weeks = weekOrder.map((wk) => weekMap.get(wk)!);

  const { min, max } = minMaxDates(sorted.map((r) => r.date));
  const totalAdds = sum(sorted.map((r) => r.adds ?? 0));
  const pulseAdds = sum(sorted.filter((_, i) => pulses[i]).map((r) => r.adds ?? 0));
  const pulseShare = safeDiv(pulseAdds, totalAdds);

  const lastWeeks = weeks.slice(-4);
  const recentAvg = mean(lastWeeks.map((w) => w.net));
  const overallAvg = mean(weeks.map((w) => w.net));
  const lastTotal = sorted[sorted.length - 1].total;

  const insufficient = sorted.length < 7;

  return {
    id: "wishlist-accumulation",
    name: "愿望单积累速率",
    subtitle: "周净增 · 区分自然增长与活动脉冲",
    group: "prelaunch",
    status: insufficient ? "insufficient" : "info",
    statusLabel: insufficient ? "样本不足" : "参考（无固定区间）",
    display: recentAvg == null ? "—" : `${fmtSignedInt(recentAvg)} / 周`,
    secondary: [
      `全期周均净增 ${fmtSignedInt(overallAvg)}`,
      lastTotal != null ? `当前愿望单总量 ${fmtInt(lastTotal)}` : null,
      pulseShare != null
        ? `脉冲日贡献了 ${(pulseShare * 100).toFixed(0)}% 的新增`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    rangeNote:
      "该指标无统一健康区间（随游戏阶段差异大）；经验上发售前周净增持续为正、稳步抬升更健康（经验值，非官方标准）。",
    confidenceNote:
      sorted.length < 28
        ? `数据仅覆盖 ${sorted.length} 天（不足 4 周），周净增波动大，仅供参考。`
        : undefined,
    caliber: {
      definition: "每周愿望单净增量及其构成（自然增长 vs 活动脉冲）。",
      formula:
        "周净增 = Σ(新增 − 删单 − 购买移除 − 礼物移除)；脉冲日：当日新增 ≥ max(3 × 前28天非脉冲日新增中位数, 中位数+20)",
      fields: ["新增", "删单", "购买移除", "礼物移除", "总量"],
      rowCount: sorted.length,
      dateRange: min && max ? { from: min, to: max } : null,
      windowNote: `按 ISO 周聚合（周一为一周之始）；主数值为最近 ${lastWeeks.length} 周的周均净增。`,
      sourceFiles: [source.filename],
    },
    teaching: {
      what: "每周愿望单净增多少，涨势是否健康。",
      why: "净增=新增−删单−购买/礼物移除，只看新增会高估。",
      range: "无固定标准；发售前持续为正、稳步抬升较健康（经验值，非官方标准）。",
      next: "问「脉冲周贡献了多少」「删单率是否超 8%」。",
    },
    chartData: { kind: "weekly-net", weeks },
    warnings: source.warnings,
  };
}
