import type { RegionalRow } from "../types";
import { minMaxDates } from "../dates";
import { fmtInt, fmtPct } from "../format";
import { safeDiv } from "./util";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 12：地区销售结构（长线运营）
 * 各国家/地区销量占比，定价与本地化决策依据。
 */
const TOP_N = 8;

export function computeRegionalSalesStructure(
  rows: RegionalRow[],
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "regional-sales-structure" as const,
    name: "地区销售结构",
    subtitle: "销量都来自哪些国家/地区",
    group: "liveops" as const,
    caliber: {
      definition: "全期各国家/地区的销量占比。",
      formula: "地区占比 = 该地区 Σ销量 ÷ 全部地区 Σ销量（全期）",
      fields: ["国家/地区", "销量"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "销量都来自哪些国家。",
      why: "按地区聚合销量占比，决定本地化与定价优先级。",
      range: "无固定；主要市场占比高时优先保证其语言与价格带质量（经验值）。",
      next: "问「该不该加XX语本地化」「主要市场对价格敏感吗」。",
    },
    chartData: { kind: "bars" as const, items: [], unit: "pct" as const, horizontal: true },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || rows.length === 0) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: "无固定区间；用于定价与本地化优先级决策。",
      confidenceNote: "缺少地区销售报告（Steamworks → Regional Sales Report 导出）。上传后自动计算。",
    };
  }

  const byCountry = new Map<string, number>();
  for (const r of rows) {
    byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.units);
  }
  const total = [...byCountry.values()].reduce((a, b) => a + b, 0);
  const sorted = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const topPct = safeDiv(top[1], total);

  const head = sorted.slice(0, TOP_N);
  const tail = sorted.slice(TOP_N);
  const tailUnits = tail.reduce((a, [, v]) => a + v, 0);
  const items = head.map(([label, v]) => ({
    label,
    value: (safeDiv(v, total) ?? 0) * 100,
  }));
  if (tail.length > 0) {
    items.push({ label: `其他（${tail.length} 个地区）`, value: (safeDiv(tailUnits, total) ?? 0) * 100 });
  }

  const { min, max } = minMaxDates(rows.map((r) => r.date));

  return {
    ...base,
    status: "info",
    statusLabel: "结构参考",
    display: topPct == null ? "—" : `最大市场 ${top[0]} ${fmtPct(topPct == null ? undefined : topPct * 100)}`,
    secondary: `Σ销量 ${fmtInt(total)} · 覆盖 ${byCountry.size} 个国家/地区`,
    rangeNote: "无固定健康区间；主要市场占比越高，其本地化质量与定价策略的杠杆越大（经验值，非官方标准）。",
    caliber: {
      ...base.caliber,
      rowCount: rows.length,
      dateRange: min && max ? { from: min, to: max } : null,
      windowNote: "全期聚合；显示前 " + TOP_N + " 个市场，其余合并为「其他」。",
      sourceFiles: [source.filename],
    },
    chartData: { kind: "bars", items, unit: "pct", horizontal: true, maxPct: 100 },
    warnings: source.warnings,
  };
}
