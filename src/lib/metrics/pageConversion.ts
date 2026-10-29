import type { TrafficDayRow } from "../types";
import { minMaxDates } from "../dates";
import { fmtInt } from "../format";
import { safeDiv, sum } from "./util";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 6：页面转化率（发售期 · 首周表现）
 * 访问 → 购买。经验区间 5–12%（独立游戏发行社区经验值，非官方标准）。
 *
 * 口径：转化率 = 购买开放期内 Σ购买数 ÷ Σ商店页访问数。
 * 发售前无销量，转化率不适用——统计窗口从首个购买日开始。
 */

const HEALTHY_MIN = 5;
const HEALTHY_MAX = 12;

export function computePageConversion(
  rows: TrafficDayRow[],
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "page-conversion" as const,
    name: "页面转化率",
    subtitle: "商店页访问 → 购买",
    group: "launch" as const,
    caliber: {
      definition: "访问商店页的用户中产生购买的比例。",
      formula: "转化率 = Σ购买数 ÷ Σ商店页访问数（购买开放期内按日汇总）",
      fields: ["访问", "购买"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "看到商店页的人里，多少人下单。",
      why: "购买÷访问，与 Steam 后台同口径，按日加总再算。",
      range: "5–12%（经验值，非官方标准）；低于 5% 多为流量不精准或页面弱。",
      next: "问「流量来源结构」「哪个来源转化最高」。",
    },
    chartData: { kind: "conversion" as const, points: [] },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || rows.length === 0) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: `健康区间 ${HEALTHY_MIN}–${HEALTHY_MAX}%（独立游戏发行社区经验值，非官方标准）。`,
    };
  }

  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const { min, max } = minMaxDates(sorted.map((r) => r.date));

  const firstPurchaseIdx = sorted.findIndex((r) => r.units > 0);
  if (firstPurchaseIdx === -1) {
    return {
      ...base,
      status: "insufficient",
      statusLabel: "暂无购买数据",
      display: "—",
      rangeNote: `健康区间 ${HEALTHY_MIN}–${HEALTHY_MAX}%（独立游戏发行社区经验值，非官方标准）。`,
      confidenceNote:
        "统计范围内没有购买记录（游戏可能尚未发售）。发售前请关注愿望单相关指标（愿望单转化模板将在 M1 提供）。",
      caliber: {
        ...base.caliber,
        rowCount: sorted.length,
        dateRange: min && max ? { from: min, to: max } : null,
        sourceFiles: [source.filename],
      },
    };
  }

  const window = sorted.slice(firstPurchaseIdx);
  const visits = sum(window.map((r) => r.visits));
  const units = sum(window.map((r) => r.units));
  const conv = safeDiv(units, visits);
  const convPct = conv == null ? null : conv * 100;

  const wMin = window[0].date;
  const wMax = window[window.length - 1].date;

  let status: MetricResult["status"] = "info";
  let statusLabel = "—";
  if (convPct == null) {
    status = "insufficient";
    statusLabel = "无法计算";
  } else if (convPct >= HEALTHY_MAX) {
    status = "excellent";
    statusLabel = "优秀";
  } else if (convPct >= HEALTHY_MIN) {
    status = "good";
    statusLabel = "达标";
  } else {
    status = "alert";
    statusLabel = "偏低";
  }

  return {
    id: "page-conversion",
    name: "页面转化率",
    subtitle: "商店页访问 → 购买",
    group: "launch",
    status,
    statusLabel,
    display: convPct == null ? "—" : `${convPct.toFixed(1)}%`,
    secondary: `购买开放期 ${window.length} 天 · Σ购买 ${fmtInt(units)} / Σ访问 ${fmtInt(visits)}`,
    rangeNote: `健康区间 ${HEALTHY_MIN}–${HEALTHY_MAX}%（独立游戏发行社区经验值，非官方标准）；<${HEALTHY_MIN}% 常见于流量不精准或页面素材说服力不足。`,
    confidenceNote:
      window.length < 14
        ? `购买开放期仅 ${window.length} 天，样本较少，仅供参考。`
        : undefined,
    caliber: {
      definition: "访问商店页的用户中产生购买的比例。",
      formula: "转化率 = Σ购买数 ÷ Σ商店页访问数（购买开放期内按日汇总）",
      fields: ["访问", "购买"],
      rowCount: window.length,
      dateRange: { from: wMin, to: wMax },
      windowNote: `购买开放期：自首个购买日 ${wMin} 起（此前无销量，转化率不适用）。`,
      sourceFiles: [source.filename],
    },
    teaching: base.teaching,
    chartData: {
      kind: "conversion",
      points: window.map((r) => ({
        date: r.date,
        pct: r.visits > 0 ? (r.units / r.visits) * 100 : null,
      })),
    },
    warnings: source.warnings,
  };
}
