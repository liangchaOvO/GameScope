/** Shared domain types. */

export type DatasetKind = "wishlist" | "traffic" | "sales" | "regional";

export const KIND_LABELS: Record<DatasetKind, string> = {
  wishlist: "愿望单报告",
  traffic: "流量与转化报告",
  sales: "销售报告（含退款）",
  regional: "地区销售报告",
};

/** One row of the Steamworks wishlist report (daily). */
export interface WishDayRow {
  date: string; // YYYY-MM-DD
  adds: number | null;
  deletes: number | null;
  purchases: number | null;
  gifts: number | null;
  /** net change as reported by Steam; derived when absent */
  net: number | null;
  /** cumulative total wishlists as reported; used for consistency check */
  total: number | null;
}

/** Traffic row per (date, source), as stored. */
export interface TrafficSourceRow {
  date: string;
  source: string;
  visits: number;
  units: number;
}

/** Traffic aggregated over all sources per day. */
export interface TrafficDayRow {
  date: string;
  visits: number;
  units: number;
}

/** Sales per day: gross units and refund units. */
export interface SalesDayRow {
  date: string;
  grossUnits: number;
  refundUnits: number;
}

/** Regional sales report row per (date, country). */
export interface RegionalRow {
  date: string;
  country: string;
  units: number;
  refunds: number;
}

export type SanityLevel = "info" | "warn";

export interface SanityWarning {
  level: SanityLevel;
  code: string;
  message: string;
}

export interface DatasetMeta {
  kind: DatasetKind;
  filename: string;
  rowCount: number;
  dateMin: string | null;
  dateMax: string | null;
  uploadedAt: string;
  warnings: SanityWarning[];
}
