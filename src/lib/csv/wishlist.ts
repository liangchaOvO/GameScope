import type { ParsedTable } from "./parse";
import { cellAt, resolveHeaders, type HeaderMap } from "./schema";
import { tryNumber } from "./values";
import { normalizeDate } from "../dates";
import type { WishDayRow } from "../types";
import type { SkippedRow } from "../api-types";
import { WISHLIST_SPECS } from "./specs";

export interface MapWishlistResult {
  rows: WishDayRow[];
  skipped: SkippedRow[];
  duplicateDates: string[];
}

function numCell(
  row: { cells: string[] },
  map: HeaderMap,
  field: string,
  label: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  const idx = map[field];
  if (idx == null || idx < 0) return { ok: true, value: null };
  const raw = (row.cells[idx] ?? "").trim();
  const res = tryNumber(raw);
  if (!res.ok) {
    return { ok: false, message: `「${label}」列的值「${raw}」不是合法数字` };
  }
  return { ok: true, value: res.value };
}

export function resolveWishlistHeaders(headers: string[]): HeaderMap {
  return resolveHeaders(headers, WISHLIST_SPECS).map;
}

export function mapWishlist(table: ParsedTable, map: HeaderMap): MapWishlistResult {
  const rows: WishDayRow[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();

  for (const row of table.rows) {
    const dateRaw = cellAt(row, map, "date");
    const date = normalizeDate(dateRaw);
    if (!date) {
      skipped.push({
        rowNo: row.rowNo,
        message: `「日期」列的值「${dateRaw}」无法识别（支持 YYYY-MM-DD、YYYY/M/D、M/D/YYYY）`,
      });
      continue;
    }

    const evaluated = [
      numCell(row, map, "adds", "新增愿望单"),
      numCell(row, map, "deletes", "删除愿望单"),
      numCell(row, map, "purchases", "购买移除"),
      numCell(row, map, "gifts", "礼物移除"),
      numCell(row, map, "net", "净变化"),
      numCell(row, map, "total", "愿望单总量"),
    ];
    // 一行内所有坏列一次报全，避免用户反复上传才能发现
    const failures = evaluated.filter((r) => !r.ok) as { ok: false; message: string }[];
    if (failures.length > 0) {
      skipped.push({
        rowNo: row.rowNo,
        message: failures.map((f) => f.message).join("；"),
      });
      continue;
    }
    const [adds, deletes, purchases, gifts, net, total] = evaluated as {
      ok: true;
      value: number | null;
    }[];

    seen.set(date, (seen.get(date) ?? 0) + 1);
    rows.push({
      date,
      adds: adds.value,
      deletes: deletes.value,
      purchases: purchases.value,
      gifts: gifts.value,
      net: net.value,
      total: total.value,
    });
  }

  // later rows win on duplicate dates (INSERT OR REPLACE semantics)
  const dedup = new Map<string, WishDayRow>();
  for (const r of rows) dedup.set(r.date, r);
  const unique = [...dedup.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const duplicateDates = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([d]) => d);

  return { rows: unique, skipped, duplicateDates };
}
