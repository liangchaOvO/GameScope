import type { WishDayRow } from "../types";
import { isoWeekStart, minMaxDates, weekLabel } from "../dates";
import { fmtPct } from "../format";
import { safeDiv, sum } from "./util";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 2：愿望单删单率（发售前 · 愿望单健康）
 * 删单 ÷ (删单 + 新增)。经验预警线 >8% 需关注（独立游戏发行社区经验值，非官方标准）。
 */

const ALERT_LINE = 8;

export function computeWishlistDeletionRate(
  rows: WishDayRow[],
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "wishlist-deletion-rate" as const,
    name: "愿望单删单率",
    subtitle: "删单占意愿变化的比重",
    group: "prelaunch" as const,
    caliber: {
      definition: "愿望单里「删掉的人」占意愿变化（删单+新增）的比重。",
      formula: "删单率 = Σ删单 ÷ (Σ删单 + Σ新增)",
      fields: ["删单", "新增"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "对游戏感兴趣后反悔离开的人占多少。",
      why: "删单÷(删单+新增)，分母是所有意愿变化，比只看删单绝对数可比。",
      range: ">8% 需关注（经验值，非官方标准）。",
      next: "问「删单集中在哪天」「商店页哪次改动后升高」。",
    },
    chartData: {
      kind: "line-pct" as const,
      points: [],
      lines: [{ y: 8, color: "#dc2626", label: "8% 预警线" }],
    },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || rows.length === 0) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: `≤${ALERT_LINE}% 健康；>${ALERT_LINE}% 需关注（独立游戏发行社区经验值，非官方标准）。`,
    };
  }

  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const adds = sum(sorted.map((r) => r.adds ?? 0));
  const deletes = sum(sorted.map((r) => r.deletes ?? 0));
  const rate = safeDiv(deletes, adds + deletes);
  const ratePct = rate == null ? null : rate * 100;

  // weekly series
  const weekMap = new Map<string, { adds: number; deletes: number }>();
  const order: string[] = [];
  for (const r of sorted) {
    const wk = isoWeekStart(r.date);
    let w = weekMap.get(wk);
    if (!w) {
      w = { adds: 0, deletes: 0 };
      weekMap.set(wk, w);
      order.push(wk);
    }
    w.adds += r.adds ?? 0;
    w.deletes += r.deletes ?? 0;
  }
  const points = order.map((wk) => {
    const w = weekMap.get(wk)!;
    const pct = safeDiv(w.deletes, w.adds + w.deletes);
    return { label: weekLabel(wk), pct: pct == null ? null : pct * 100 };
  });

  const { min, max } = minMaxDates(sorted.map((r) => r.date));

  return {
    ...base,
    status: ratePct == null ? "insufficient" : ratePct > ALERT_LINE ? "alert" : "good",
    statusLabel: ratePct == null ? "无法计算" : ratePct > ALERT_LINE ? "需关注" : "健康",
    display: fmtPct(ratePct),
    secondary: `Σ删单 ${Math.round(deletes).toLocaleString("en-US")} / (Σ删单 + Σ新增 ${Math.round(adds + deletes).toLocaleString("en-US")})`,
    rangeNote: `≤${ALERT_LINE}% 健康；>${ALERT_LINE}% 需关注，常与商店页改动、负面事件或类型错配相关（独立游戏发行社区经验值，非官方标准）。`,
    caliber: {
      ...base.caliber,
      rowCount: sorted.length,
      dateRange: min && max ? { from: min, to: max } : null,
      windowNote: "全期求和；周线按 ISO 周聚合。",
      sourceFiles: [source.filename],
    },
    chartData: {
      kind: "line-pct",
      points,
      lines: [{ y: 8, color: "#dc2626", label: "8% 预警线" }],
    },
    warnings: source.warnings,
  };
}
