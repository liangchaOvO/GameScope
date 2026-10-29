import type {
  DatasetMeta,
  SalesDayRow,
  TrafficSourceRow,
  WishDayRow,
} from "../types";
import { computeWishlistAccumulation } from "./wishlistAccumulation";
import { computePageConversion } from "./pageConversion";
import { computeRefundRate } from "./refundRate";
import type { MetricResult } from "./types";

export interface MetricInputs {
  wishlist: { rows: WishDayRow[]; meta: DatasetMeta } | null;
  traffic: { rows: TrafficSourceRow[]; meta: DatasetMeta } | null;
  sales: { rows: SalesDayRow[]; meta: DatasetMeta } | null;
}

function src(meta: DatasetMeta | undefined) {
  if (!meta) return null;
  return { filename: meta.filename, warnings: meta.warnings };
}

/** Compute all registered metric templates from stored data. */
export function computeAllMetrics(inputs: MetricInputs): MetricResult[] {
  // 流量按日聚合（跨流量来源求和）
  const trafficDaily = inputs.traffic
    ? aggregateTrafficDaily(inputs.traffic.rows)
    : [];

  return [
    computeWishlistAccumulation(
      inputs.wishlist?.rows ?? [],
      src(inputs.wishlist?.meta)
    ),
    computePageConversion(trafficDaily, src(inputs.traffic?.meta)),
    computeRefundRate(inputs.sales?.rows ?? [], src(inputs.sales?.meta)),
  ];
}

function aggregateTrafficDaily(rows: TrafficSourceRow[]) {
  const map = new Map<string, { date: string; visits: number; units: number }>();
  for (const r of rows) {
    const cur = map.get(r.date) ?? { date: r.date, visits: 0, units: 0 };
    cur.visits += r.visits;
    cur.units += r.units;
    map.set(r.date, cur);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
