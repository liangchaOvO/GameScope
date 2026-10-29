import type { TrafficSourceRow } from "../types";

/** 流量「日期×来源」行按日聚合（跨来源求和），供指标计算与入库警告共用。 */
export function aggregateTrafficDaily(rows: TrafficSourceRow[]) {
  const map = new Map<string, { date: string; visits: number; units: number }>();
  for (const r of rows) {
    const cur = map.get(r.date) ?? { date: r.date, visits: 0, units: 0 };
    cur.visits += r.visits;
    cur.units += r.units;
    map.set(r.date, cur);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
