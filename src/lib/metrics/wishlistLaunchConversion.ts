import type { SalesDayRow, WishDayRow } from "../types";
import { dateDiffDays } from "../dates";
import { fmtInt, fmtPct } from "../format";
import { safeDiv } from "./util";
import { dayAfter, findFirstSaleDate, sumGrossInRange } from "./windows";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 4：愿望单→首周销量转化（发售期 · 首周表现）
 * 首周销量 ÷ 发售前夜愿望单总量。经验区间 10–20%；<5% 常见于愿望单灌水或发售准备不足。
 */

export function computeWishlistLaunchConversion(
  wishRows: WishDayRow[],
  salesRows: SalesDayRow[],
  wishSource: MetricSource | null,
  salesSource: MetricSource | null
): MetricResult {
  const base = {
    id: "wishlist-launch-conversion" as const,
    name: "愿望单→首周销量转化",
    subtitle: "发售前愿望单有多少变成首周销量",
    group: "launch" as const,
    caliber: {
      definition: "首周销量占发售前愿望单存量的比例（愿望单质量的核心检验）。",
      formula: "转化 = 首周销量（首个购买日起 7 天） ÷ 发售前夜愿望单总量",
      fields: ["销量", "愿望单总量"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "攒的愿望单里，多少人第一周就买了。",
      why: "首周销量÷发售前夜总量，检验愿望单质量与发售准备。",
      range: "10–20%（经验值）；<5% 常见于灌水或准备不足（非官方标准）。",
      next: "问「愿望单删单率多少」「发售日曝光与通知是否到位」。",
    },
    chartData: {
      kind: "bars" as const,
      items: [],
      unit: "int" as const,
    },
    warnings: [] as MetricSource["warnings"],
  };

  if (!wishSource || !salesSource || wishRows.length === 0 || salesRows.length === 0) {
    const missing = [
      !wishSource || wishRows.length === 0 ? "愿望单报告" : null,
      !salesSource || salesRows.length === 0 ? "销售报告" : null,
    ].filter(Boolean) as string[];
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: "健康区间 10–20%（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote: `还差：${missing.join("、")}。`,
    };
  }

  const launch = findFirstSaleDate(salesRows);
  if (!launch) {
    return {
      ...base,
      status: "insufficient",
      statusLabel: "暂无销售数据",
      display: "—",
      rangeNote: "健康区间 10–20%（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote: "统计范围内没有购买记录（游戏可能尚未发售），发售首周结束后自动可算。",
    };
  }

  // 发售前夜愿望单总量：优先发售日前一天，否则发售日前最近一天
  const sortedWish = [...wishRows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const preLaunchRows = sortedWish.filter((r) => dateDiffDays(r.date, launch) >= 1 && r.total != null);
  const wishAtLaunch = preLaunchRows.length > 0 ? preLaunchRows[preLaunchRows.length - 1] : null;
  if (!wishAtLaunch || wishAtLaunch.total == null || wishAtLaunch.total <= 0) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少总量列",
      display: "—",
      rangeNote: "健康区间 10–20%（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote:
        "愿望单报告缺少「愿望单总量」列（或发售前无数据），无法计算该模板；其余模板不受影响。",
    };
  }

  const weekEnd = dayAfter(launch, 6);
  const firstWeekSales = sumGrossInRange(salesRows, launch, weekEnd);
  const wishTotal = wishAtLaunch.total;
  const rate = safeDiv(firstWeekSales, wishTotal);
  const ratePct = rate == null ? null : rate * 100;

  const weekDays: { label: string; value: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = dayAfter(launch, i);
    const row = salesRows.find((r) => r.date === d);
    weekDays.push({ label: d.slice(5).replace("-", "/"), value: row?.grossUnits ?? 0 });
  }

  let status: MetricResult["status"] = "info";
  let statusLabel = "—";
  if (ratePct == null) {
    status = "insufficient";
    statusLabel = "无法计算";
  } else if (ratePct >= 20) {
    status = "excellent";
    statusLabel = "优秀";
  } else if (ratePct >= 10) {
    status = "good";
    statusLabel = "达标";
  } else if (ratePct >= 5) {
    status = "warn";
    statusLabel = "低于经验带";
  } else {
    status = "alert";
    statusLabel = "偏低";
  }

  return {
    ...base,
    status,
    statusLabel,
    display: fmtPct(ratePct),
    secondary: `首周销量 ${fmtInt(firstWeekSales)} ÷ 发售前夜（${wishAtLaunch.date}）愿望单 ${fmtInt(wishTotal)}`,
    rangeNote:
      "健康区间 10–20%（独立游戏发行社区经验值，非官方标准）；<5% 常见于愿望单灌水或发售准备不足；>20% 属强转化（常见于小基数高质量愿望单）。",
    caliber: {
      ...base.caliber,
      rowCount: 7 + 1,
      dateRange: { from: launch, to: weekEnd },
      windowNote: `首周 = ${launch} ~ ${weekEnd}；愿望单取发售前最近一天（${wishAtLaunch.date}）的总量列。`,
      sourceFiles: [wishSource.filename, salesSource.filename],
    },
    chartData: {
      kind: "bars",
      items: weekDays,
      unit: "int",
    },
    warnings: [...wishSource.warnings, ...salesSource.warnings],
  };
}
