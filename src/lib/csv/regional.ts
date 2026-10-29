import type { ParsedTable } from "./parse";
import { cellAt, resolveHeaders, type HeaderMap } from "./schema";
import { tryNumber } from "./values";
import { normalizeDate } from "../dates";
import type { RegionalRow } from "../types";
import type { SkippedRow } from "../api-types";
import { REGIONAL_SPECS } from "./specs";

export interface MapRegionalResult {
  rows: RegionalRow[];
  skipped: SkippedRow[];
  /** 「销量」为空的单元格数（按 0 参与计算，需警告） */
  emptyNumberCells: number;
}

export function resolveRegionalHeaders(headers: string[]): HeaderMap {
  return resolveHeaders(headers, REGIONAL_SPECS).map;
}

/**
 * Map a regional sales report (Date × Country rows) to daily rows.
 * Multiple rows for the same (date, country) are summed.
 */
export function mapRegional(table: ParsedTable, map: HeaderMap): MapRegionalResult {
  const skipped: SkippedRow[] = [];
  const byKey = new Map<string, RegionalRow>();
  let emptyNumberCells = 0;

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
    const country = cellAt(row, map, "country") || "未知地区";

    const unitsRaw = cellAt(row, map, "units");
    const units = tryNumber(unitsRaw);
    if (!units.ok) {
      skipped.push({
        rowNo: row.rowNo,
        message: `「销量」列的值「${unitsRaw}」不是合法数字`,
      });
      continue;
    }
    if (unitsRaw === "") emptyNumberCells++;

    let refunds = 0;
    const refundsIdx = map["refunds"] ?? -1;
    if (refundsIdx >= 0) {
      const refundsRaw = cellAt(row, map, "refunds");
      const refundsRes = tryNumber(refundsRaw);
      if (!refundsRes.ok) {
        skipped.push({
          rowNo: row.rowNo,
          message: `「退款」列的值「${refundsRaw}」不是合法数字`,
        });
        continue;
      }
      refunds = Math.abs(refundsRes.value ?? 0);
    }

    const key = `${date}|${country}`;
    const cur = byKey.get(key) ?? { date, country, units: 0, refunds: 0 };
    cur.units += units.value ?? 0;
    cur.refunds += refunds;
    byKey.set(key, cur);
  }

  const rows: RegionalRow[] = [...byKey.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.country < b.country ? -1 : 1
  );

  return { rows, skipped, emptyNumberCells };
}
