import type { ColumnSpec } from "./schema";
import { resolveHeaders } from "./schema";
import type { DatasetKind } from "../types";

/**
 * Steamworks CSV column specs (aliases per canonical field).
 *
 * NOTE(M0): aliases are best-effort from public community documentation of
 * Steamworks exports; see docs/steamworks-csv-formats.md for sources and
 * verification status. The alias system is designed so real-world header
 * variants can be added without touching mapper logic.
 */

export const WISHLIST_SPECS: ColumnSpec[] = [
  { field: "date", aliases: ["Date", "DateLocal", "日期"], required: true, type: "date", label: "日期" },
  { field: "adds", aliases: ["Wishlist Adds", "Adds", "New Wishlists", "Wishlist Additions", "新增"], required: true, type: "number", label: "新增愿望单" },
  { field: "deletes", aliases: ["Wishlist Deletes", "Deletes", "Wishlist Deletions", "删单"], required: true, type: "number", label: "删除愿望单" },
  { field: "purchases", aliases: ["Wishlist Purchases", "Purchases", "购买移除"], required: false, type: "number", label: "购买移除" },
  { field: "gifts", aliases: ["Wishlist Gifts", "Gifts", "礼物移除"], required: false, type: "number", label: "礼物移除" },
  { field: "net", aliases: ["Wishlist Net", "Net", "净增"], required: false, type: "number", label: "净变化" },
  { field: "total", aliases: ["Total Wishlist", "Total Wishlists", "Total", "愿望单总量"], required: false, type: "number", label: "愿望单总量" },
];

export const TRAFFIC_SPECS: ColumnSpec[] = [
  { field: "date", aliases: ["Date", "日期"], required: true, type: "date", label: "日期" },
  { field: "source", aliases: ["Traffic Source", "Source", "Referrer", "来源"], required: false, type: "string", label: "流量来源" },
  { field: "visits", aliases: ["Visits", "Page Visits", "Store Visits", "访问", "访问量"], required: true, type: "number", label: "访问" },
  { field: "units", aliases: ["Units", "Units Sold", "Purchases", "购买", "销量"], required: true, type: "number", label: "购买" },
  { field: "impressions", aliases: ["Impressions", "曝光"], required: false, type: "number", label: "曝光" },
];

export const SALES_SPECS: ColumnSpec[] = [
  { field: "date", aliases: ["Date", "日期"], required: true, type: "date", label: "日期" },
  { field: "units", aliases: ["Units", "Units Sold", "Gross Units", "销量", "毛销量"], required: true, type: "number", label: "销量" },
  { field: "refunds", aliases: ["Refunds", "Refund Units", "Units Refunded", "退款"], required: false, type: "number", label: "退款" },
  { field: "type", aliases: ["Transaction Type", "Type", "交易类型"], required: false, type: "string", label: "交易类型" },
];

export const KIND_SPECS: Record<DatasetKind, ColumnSpec[]> = {
  wishlist: WISHLIST_SPECS,
  traffic: TRAFFIC_SPECS,
  sales: SALES_SPECS,
};

/**
 * Detect which Steamworks export a header row belongs to.
 * A kind matches when ALL its required columns are present.
 */
export function detectCsvKind(headers: string[]): DatasetKind | null {
  const candidates: DatasetKind[] = [];
  if (matches(WISHLIST_SPECS, headers)) candidates.push("wishlist");
  if (matches(TRAFFIC_SPECS, headers)) candidates.push("traffic");
  if (matches(SALES_SPECS, headers)) candidates.push("sales");
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // wishlist wins on its distinctive columns, traffic over sales on visits
    if (candidates.includes("wishlist")) return "wishlist";
    if (candidates.includes("traffic")) return "traffic";
    return "sales";
  }
  return null;
}

/**
 * Closest kind for error messages: the kind with the most required-column
 * matches, plus the labels of its missing required columns. Returns null
 * when no required column of any kind matched.
 */
export function bestCandidateKind(
  headers: string[]
): { kind: DatasetKind; missing: string[] } | null {
  const entries = (
    [
      ["wishlist", WISHLIST_SPECS],
      ["traffic", TRAFFIC_SPECS],
      ["sales", SALES_SPECS],
    ] as [DatasetKind, ColumnSpec[]][]
  ).map(([kind, specs]) => ({ kind, missing: resolveHeaders(headers, specs).missing }));
  entries.sort((a, b) => a.missing.length - b.missing.length);
  const best = entries[0];
  const total = KIND_SPECS[best.kind].filter((s) => s.required).length;
  if (total - best.missing.length <= 0) return null;
  return best;
}

function matches(specs: ColumnSpec[], headers: string[]): boolean {
  const normalized = new Set(
    headers.map((h) => h.toLowerCase().replace(/\s+/g, " "))
  );
  return specs
    .filter((s) => s.required)
    .every((s) =>
      s.aliases.some((a) => normalized.has(a.toLowerCase().replace(/\s+/g, " ")))
    );
}
