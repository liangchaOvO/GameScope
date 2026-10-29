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
import { aggregateTrafficDaily } from "./aggregate";
import type { MetricId, MetricResult } from "./types";

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

function emptySnapshots(): StoredSnapshots {
  return { reviews: null, price: null, fetchedAt: null };
}

/**
 * 指标注册表：模板看板与 AI 问数共用同一组计算函数（D4 同源同构）。
 * 新增模板 = 在此注册 + lib/metrics 下新增纯函数 + 单测。
 */
export const METRIC_REGISTRY: { id: MetricId; compute: (inputs: MetricInputs) => MetricResult }[] = [
  {
    id: "wishlist-accumulation",
    compute: (i) => computeWishlistAccumulation(i.wishlist?.rows ?? [], src(i.wishlist?.meta)),
  },
  {
    id: "wishlist-deletion-rate",
    compute: (i) => computeWishlistDeletionRate(i.wishlist?.rows ?? [], src(i.wishlist?.meta)),
  },
  {
    id: "wishlist-visit-conversion",
    compute: (i) =>
      computeWishlistVisitConversion(
        i.wishlist?.rows ?? [],
        aggregateTrafficDaily(i.traffic?.rows ?? []),
        src(i.wishlist?.meta),
        src(i.traffic?.meta)
      ),
  },
  {
    id: "wishlist-launch-conversion",
    compute: (i) =>
      computeWishlistLaunchConversion(
        i.wishlist?.rows ?? [],
        i.sales?.rows ?? [],
        src(i.wishlist?.meta),
        src(i.sales?.meta)
      ),
  },
  {
    id: "first-week-share",
    compute: (i) => computeFirstWeekShare(i.sales?.rows ?? [], src(i.sales?.meta)),
  },
  {
    id: "page-conversion",
    compute: (i) => computePageConversion(aggregateTrafficDaily(i.traffic?.rows ?? []), src(i.traffic?.meta)),
  },
  {
    id: "refund-rate",
    compute: (i) => computeRefundRate(i.sales?.rows ?? [], src(i.sales?.meta)),
  },
  {
    id: "discount-pulse-coefficient",
    compute: (i) =>
      computeDiscountPulseCoefficient(
        i.wishlist?.rows ?? [],
        i.sales?.rows ?? [],
        src(i.wishlist?.meta),
        src(i.sales?.meta)
      ),
  },
  {
    id: "review-sales-estimate",
    compute: (i) => computeReviewSalesEstimate(i.snapshots ?? emptySnapshots(), { filename: "Steam 评价/价格快照", warnings: [] }),
  },
  {
    id: "review-score-tier",
    compute: (i) => computeReviewScoreTier(i.snapshots ?? emptySnapshots(), { filename: "Steam 评价/价格快照", warnings: [] }),
  },
  {
    id: "traffic-source-structure",
    compute: (i) => computeTrafficSourceStructure(i.traffic?.rows ?? [], src(i.traffic?.meta)),
  },
  {
    id: "regional-sales-structure",
    compute: (i) => computeRegionalSalesStructure(i.regional?.rows ?? [], src(i.regional?.meta)),
  },
];

/** Compute all 12 registered metric templates from stored project data. */
export function computeAllMetrics(inputs: MetricInputs): MetricResult[] {
  return METRIC_REGISTRY.map((e) => e.compute(inputs));
}

export { aggregateTrafficDaily };
