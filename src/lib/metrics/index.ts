import type {
  DatasetMeta,
  RegionalRow,
  SalesDayRow,
  TrafficSourceRow,
  WishDayRow,
} from "../types";
import type { StoredSnapshots } from "../db/store";
import { computeWishlistAccumulation } from "./wishlistAccumulation";
import { computeWishlistDeletionRate } from "./wishlistDeletionRate";
import { computeWishlistVisitConversion } from "./wishlistVisitConversion";
import { computeWishlistLaunchConversion } from "./wishlistLaunchConversion";
import { computeFirstWeekShare } from "./firstWeekShare";
import { computePageConversion } from "./pageConversion";
import { computeRefundRate } from "./refundRate";
import { computeDiscountPulseCoefficient } from "./discountPulseCoefficient";
import { computeReviewSalesEstimate } from "./reviewSalesEstimate";
import { computeReviewScoreTier } from "./reviewScoreTier";
import { computeTrafficSourceStructure } from "./trafficSourceStructure";
import { computeRegionalSalesStructure } from "./regionalSalesStructure";
import type { MetricResult } from "./types";
import { aggregateTrafficDaily } from "./aggregate";

export interface MetricInputs {
  wishlist: { rows: WishDayRow[]; meta: DatasetMeta } | null;
  traffic: { rows: TrafficSourceRow[]; meta: DatasetMeta } | null;
  sales: { rows: SalesDayRow[]; meta: DatasetMeta } | null;
  regional: { rows: RegionalRow[]; meta: DatasetMeta } | null;
  snapshots: StoredSnapshots | null;
}

function src(meta: DatasetMeta | undefined) {
  if (!meta) return null;
  return { filename: meta.filename, warnings: meta.warnings };
}

/** Compute all 12 registered metric templates from stored project data. */
export function computeAllMetrics(inputs: MetricInputs): MetricResult[] {
  const trafficDaily = inputs.traffic ? aggregateTrafficDaily(inputs.traffic.rows) : [];
  const wishSrc = src(inputs.wishlist?.meta);
  const trafficSrc = src(inputs.traffic?.meta);
  const salesSrc = src(inputs.sales?.meta);
  const regionalSrc = src(inputs.regional?.meta);
  const snapshots = inputs.snapshots ?? { reviews: null, price: null, fetchedAt: null };
  const snapshotSrc = { filename: "Steam 评价/价格快照", warnings: [] };

  return [
    // 发售前 · 愿望单健康
    computeWishlistAccumulation(inputs.wishlist?.rows ?? [], wishSrc),
    computeWishlistDeletionRate(inputs.wishlist?.rows ?? [], wishSrc),
    computeWishlistVisitConversion(
      inputs.wishlist?.rows ?? [],
      trafficDaily,
      wishSrc,
      trafficSrc
    ),
    // 发售期 · 首周表现
    computeWishlistLaunchConversion(
      inputs.wishlist?.rows ?? [],
      inputs.sales?.rows ?? [],
      wishSrc,
      salesSrc
    ),
    computeFirstWeekShare(inputs.sales?.rows ?? [], salesSrc),
    computePageConversion(trafficDaily, trafficSrc),
    computeRefundRate(inputs.sales?.rows ?? [], salesSrc),
    // 长线运营
    computeDiscountPulseCoefficient(
      inputs.wishlist?.rows ?? [],
      inputs.sales?.rows ?? [],
      wishSrc,
      salesSrc
    ),
    computeReviewSalesEstimate(snapshots, snapshotSrc),
    computeReviewScoreTier(snapshots, snapshotSrc),
    computeTrafficSourceStructure(inputs.traffic?.rows ?? [], trafficSrc),
    computeRegionalSalesStructure(inputs.regional?.rows ?? [], regionalSrc),
  ];
}
