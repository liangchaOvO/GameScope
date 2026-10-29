import type { SalesDayRow } from "../types";
import { fmtInt } from "../format";
import { safeDiv } from "./util";
import { dayAfter, findFirstSaleDate, sumGrossInRange } from "./windows";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 5：首周销量占比（发售期 · 首周表现）
 * 首周（发售起 7 天）销量 ÷ 首月（发售起 30 天）销量。
 * 用于判断长尾型 vs 脉冲型；无固定健康区间。
 */
export function computeFirstWeekShare(
  salesRows: SalesDayRow[],
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "first-week-share" as const,
    name: "首周销量占比",
    subtitle: "首周占首月销量，判断长尾型 vs 脉冲型",
    group: "launch" as const,
    caliber: {
      definition: "发售首周销量占首月（发售起 30 天）销量的比重。",
      formula: "首周占比 = 首周销量（发售起 7 天） ÷ 首月销量（发售起 30 天）",
      fields: ["销量"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "首月销量里首周吃掉了多少。",
      why: "首周÷前 30 天，判断这游戏是脉冲爆发还是长线销售。",
      range: "无固定；>60% 偏脉冲型，<40% 偏长尾型（经验值，非官方标准）。",
      next: "问「第二个月还能卖多少」「什么时候打折承接长尾」。",
    },
    chartData: { kind: "bars" as const, items: [], unit: "int" as const },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || salesRows.length === 0) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: "无固定区间；>60% 偏脉冲型，<40% 偏长尾型（经验值，非官方标准）。",
    };
  }

  const launch = findFirstSaleDate(salesRows);
  if (!launch) {
    return {
      ...base,
      status: "insufficient",
      statusLabel: "暂无销售数据",
      display: "—",
      rangeNote: "无固定区间；>60% 偏脉冲型，<40% 偏长尾型（经验值，非官方标准）。",
      confidenceNote: "统计范围内没有购买记录（游戏可能尚未发售）。",
    };
  }

  const monthEnd = dayAfter(launch, 29);
  const lastDataDate = salesRows[salesRows.length - 1].date;
  const effectiveMonthEnd = lastDataDate < monthEnd ? lastDataDate : monthEnd;
  const firstWeekSales = sumGrossInRange(salesRows, launch, dayAfter(launch, 6));
  const firstMonthSales = sumGrossInRange(salesRows, launch, effectiveMonthEnd);
  const share = safeDiv(firstWeekSales, firstMonthSales);
  const sharePct = share == null ? null : share * 100;

  // 4 个周桶
  const weekBuckets: { label: string; value: number }[] = [];
  for (let w = 0; w < 4; w++) {
    const from = dayAfter(launch, w * 7);
    const to = dayAfter(launch, w * 7 + 6);
    if (from > effectiveMonthEnd) break;
    const v = sumGrossInRange(salesRows, from, to > effectiveMonthEnd ? effectiveMonthEnd : to);
    weekBuckets.push({
      label: w === 0 ? "首周" : `第 ${w + 1} 周`,
      value: v,
    });
  }

  const monthDays = Math.round(
    (new Date(`${effectiveMonthEnd}T00:00:00Z`).getTime() -
      new Date(`${launch}T00:00:00Z`).getTime()) /
      86400000
  ) + 1;

  return {
    ...base,
    status: sharePct == null ? "insufficient" : "info",
    statusLabel: sharePct == null ? "无法计算" : "参考（无固定区间）",
    display: sharePct == null ? "—" : `${sharePct.toFixed(1)}%`,
    secondary: `首周 ${fmtInt(firstWeekSales)} / 首月（${monthDays} 天）${fmtInt(firstMonthSales)}`,
    rangeNote: "无固定健康区间；经验上 >60% 偏脉冲型（长尾弱），<40% 偏长尾型（经验值，非官方标准）。",
    confidenceNote:
      monthDays < 30
        ? `发售起数据仅覆盖 ${monthDays} 天（不足 30 天），首月口径不完整，仅供参考。`
        : undefined,
    caliber: {
      ...base.caliber,
      rowCount: monthDays,
      dateRange: { from: launch, to: effectiveMonthEnd },
      windowNote:
        monthDays < 30
          ? `首月窗口不足 30 天（现有数据至 ${effectiveMonthEnd}），以现有窗口计。`
          : `首月 = ${launch} ~ ${monthEnd}（30 天）。`,
      sourceFiles: [source.filename],
    },
    chartData: { kind: "bars", items: weekBuckets, unit: "int" },
    warnings: source.warnings,
  };
}
