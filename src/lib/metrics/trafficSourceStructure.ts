import type { TrafficSourceRow } from "../types";
import { minMaxDates } from "../dates";
import { fmtPct } from "../format";
import { safeDiv } from "./util";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 11：流量来源结构（长线运营）
 * 各来源访问占比，诊断曝光瓶颈。经验提示：外部流量占比 <10% 时曝光易受 Steam 算法波动影响。
 */
export function computeTrafficSourceStructure(
  rows: TrafficSourceRow[],
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "traffic-source-structure" as const,
    name: "流量来源结构",
    subtitle: "访问从哪里来，诊断曝光瓶颈",
    group: "liveops" as const,
    caliber: {
      definition: "全期各流量来源的访问占比。",
      formula: "来源占比 = 该来源 Σ访问 ÷ 全部来源 Σ访问（全期）",
      fields: ["流量来源", "访问"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "商店页的访问都从哪来。",
      why: "按来源聚合访问占比，看出曝光依赖哪些渠道。",
      range: "无固定；外部占比 <10% 时曝光易受算法波动（经验值，非官方标准）。",
      next: "问「外部流量能不能放大」「哪个来源的转化率最高」。",
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
      rangeNote: "无固定区间；用于诊断曝光瓶颈（外部占比 <10% 为经验提示）。",
      confidenceNote: "缺少流量与转化报告（需含「流量来源」维度）。上传后自动计算。",
    };
  }

  const bySource = new Map<string, number>();
  for (const r of rows) {
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.visits);
  }
  const total = [...bySource.values()].reduce((a, b) => a + b, 0);
  const sorted = [...bySource.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const topPct = safeDiv(top[1], total);
  const externalShare = bySource.get("External") ?? 0;

  const { min, max } = minMaxDates(rows.map((r) => r.date));

  const items = sorted.map(([label, v]) => {
    const pct = safeDiv(v, total);
    return {
      label,
      value: pct == null ? 0 : pct * 100,
    };
  });

  return {
    ...base,
    status: "info",
    statusLabel: "结构参考",
    display: topPct == null ? "—" : `最大来源 ${top[0]} ${fmtPct(topPct == null ? undefined : topPct * 100)}`,
    secondary: sorted
      .slice(0, 3)
      .map(([s, v]) => `${s} ${fmtPct(safeDiv(v, total) == null ? undefined : (safeDiv(v, total) as number) * 100)}`)
      .join(" · "),
    rangeNote:
      "无固定健康区间；经验提示：外部来源占比 <10% 时曝光高度依赖 Steam 内部推荐，易受算法波动影响（经验值，非官方标准）。",
    confidenceNote:
      total > 0 && externalShare / total < 0.1
        ? "外部流量占比低于 10%：曝光瓶颈在 Steam 站内，考虑预告片投放/创作者 Key/社区活动。"
        : undefined,
    caliber: {
      ...base.caliber,
      rowCount: rows.length,
      dateRange: min && max ? { from: min, to: max } : null,
      windowNote: "全期聚合；来源取值以 Steamworks 报告为准。",
      sourceFiles: [source.filename],
    },
    chartData: { kind: "bars", items, unit: "pct", horizontal: true, maxPct: 100 },
    warnings: source.warnings,
  };
}
