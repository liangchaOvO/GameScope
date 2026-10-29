import type { TrafficDayRow, WishDayRow } from "../types";
import { isoWeekStart, minMaxDates, weekLabel } from "../dates";
import { fmtPct } from "../format";
import { safeDiv, sum } from "./util";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 3：愿望单/页面访问转化（发售前 · 愿望单健康）
 * 加购意愿：Σ新增愿望单 ÷ Σ商店页访问。经验区间 3–10%（社区经验值，非官方标准）。
 * 需要两个数据源：愿望单报告 + 流量与转化报告。
 */

const HEALTHY_MIN = 3;
const HEALTHY_MAX = 10;

export function computeWishlistVisitConversion(
  wishRows: WishDayRow[],
  trafficRows: TrafficDayRow[],
  wishSource: MetricSource | null,
  trafficSource: MetricSource | null
): MetricResult {
  const base = {
    id: "wishlist-visit-conversion" as const,
    name: "愿望单/页面访问转化",
    subtitle: "访问 → 加愿望单（加购意愿）",
    group: "prelaunch" as const,
    caliber: {
      definition: "访问商店页的用户中把游戏加入愿望单的比例（加购意愿）。",
      formula: "加购转化 = Σ新增愿望单 ÷ Σ商店页访问数（两数据源共同覆盖期）",
      fields: ["新增愿望单", "访问"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "看到页面的人里多少人愿意追踪游戏。",
      why: "新增愿望单÷访问，衡量页面说服力（而非购买力）。",
      range: "3–10%（经验值，非官方标准）。",
      next: "问「哪个来源加购率最高」「首屏素材是否拖了后腿」。",
    },
    chartData: {
      kind: "line-pct" as const,
      points: [],
      band: [HEALTHY_MIN, HEALTHY_MAX] as [number, number],
    },
    warnings: [] as MetricSource["warnings"],
  };

  if (!wishSource || !trafficSource || wishRows.length === 0 || trafficRows.length === 0) {
    const missing = [
      !wishSource || wishRows.length === 0 ? "愿望单报告" : null,
      !trafficSource || trafficRows.length === 0 ? "流量与转化报告" : null,
    ].filter(Boolean) as string[];
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: `健康区间 ${HEALTHY_MIN}–${HEALTHY_MAX}%（独立游戏发行社区经验值，非官方标准）。`,
      confidenceNote: `还差：${missing.join("、")}。上传后自动计算。`,
    };
  }

  // 共同覆盖期（两个数据源都有数据的日期）；新增按「天」计，不随流量行数重复计数
  const wishByDate = new Map(wishRows.map((r) => [r.date, r]));
  const commonRows = trafficRows.filter((r) => wishByDate.has(r.date));
  const commonDates = [...new Set(commonRows.map((r) => r.date))];
  const visits = sum(commonRows.map((r) => r.visits));
  const adds = sum(commonDates.map((d) => wishByDate.get(d)?.adds ?? 0));
  const rate = safeDiv(adds, visits);
  const ratePct = rate == null ? null : rate * 100;

  // weekly series on common dates
  const wishWeekly = new Map<string, number>();
  const trafficWeekly = new Map<string, number>();
  for (const d of commonDates) {
    const wk = isoWeekStart(d);
    wishWeekly.set(wk, (wishWeekly.get(wk) ?? 0) + (wishByDate.get(d)?.adds ?? 0));
  }
  for (const r of commonRows) {
    const wk = isoWeekStart(r.date);
    trafficWeekly.set(wk, (trafficWeekly.get(wk) ?? 0) + r.visits);
  }
  const weeks = [...new Set([...wishWeekly.keys(), ...trafficWeekly.keys()])].sort();
  const points = weeks.map((wk) => {
    const pct = safeDiv(wishWeekly.get(wk) ?? 0, trafficWeekly.get(wk) ?? 0);
    return { label: weekLabel(wk), pct: pct == null ? null : pct * 100 };
  });

  const { min, max } = minMaxDates(commonDates);

  let status: MetricResult["status"] = "info";
  let statusLabel = "—";
  if (ratePct == null) {
    status = "insufficient";
    statusLabel = "无法计算";
  } else if (ratePct >= HEALTHY_MAX) {
    status = "excellent";
    statusLabel = "优秀";
  } else if (ratePct >= HEALTHY_MIN) {
    status = "good";
    statusLabel = "达标";
  } else {
    status = "alert";
    statusLabel = "偏低";
  }

  return {
    ...base,
    status,
    statusLabel,
    display: fmtPct(ratePct),
    secondary: `Σ新增愿望单 ${Math.round(adds).toLocaleString("en-US")} / Σ访问 ${Math.round(visits).toLocaleString("en-US")}（共同覆盖期 ${commonDates.length} 天）`,
    rangeNote: `健康区间 ${HEALTHY_MIN}–${HEALTHY_MAX}%（独立游戏发行社区经验值，非官方标准）；<${HEALTHY_MIN}% 多为流量不精准或首屏素材弱。`,
    caliber: {
      ...base.caliber,
      rowCount: commonDates.length,
      dateRange: min && max ? { from: min, to: max } : null,
      windowNote: "取愿望单与流量两份报告共同覆盖的日期，按日汇总后相除。",
      sourceFiles: [wishSource.filename, trafficSource.filename],
    },
    chartData: { kind: "line-pct", points, band: [HEALTHY_MIN, HEALTHY_MAX] },
    warnings: [...wishSource.warnings, ...trafficSource.warnings],
  };
}
