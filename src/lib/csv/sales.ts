import type { ParsedTable } from "./parse";
import { cellAt, resolveHeaders, type HeaderMap } from "./schema";
import { tryNumber } from "./values";
import { normalizeDate } from "../dates";
import type { SalesDayRow } from "../types";
import type { SkippedRow } from "../api-types";
import { SALES_SPECS } from "./specs";

export interface MapSalesResult {
  rows: SalesDayRow[];
  skipped: SkippedRow[];
}

export function resolveSalesHeaders(headers: string[]): HeaderMap {
  return resolveHeaders(headers, SALES_SPECS).map;
}

/**
 * Map a sales report to daily {grossUnits, refundUnits}.
 * Supports two shapes:
 *  A) a dedicated refund column (e.g. "Refunds") — units = gross, refunds as-is;
 *  B) a transaction-type column — rows whose type matches /refund/i count as
 *     refunds (sign-agnostic), everything else adds to gross.
 * Multiple rows for the same date are summed (e.g. per-country breakdowns).
 */
export function mapSales(table: ParsedTable, map: HeaderMap): MapSalesResult {
  const skipped: SkippedRow[] = [];
  const byDate = new Map<string, { gross: number; refunds: number }>();

  const hasRefundCol = (map["refunds"] ?? -1) >= 0;
  const hasTypeCol = (map["type"] ?? -1) >= 0;

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

    const unitsRaw = cellAt(row, map, "units");
    const units = tryNumber(unitsRaw);
    if (!units.ok) {
      skipped.push({
        rowNo: row.rowNo,
        message: `「销量」列的值「${unitsRaw}」不是合法数字`,
      });
      continue;
    }
    const unitsVal = units.value ?? 0;

    let gross = 0;
    let refunds = 0;

    if (hasRefundCol) {
      const refundRaw = cellAt(row, map, "refunds");
      const refund = tryNumber(refundRaw);
      if (!refund.ok) {
        skipped.push({
          rowNo: row.rowNo,
          message: `「退款」列的值「${refundRaw}」不是合法数字`,
        });
        continue;
      }
      gross = unitsVal;
      refunds = Math.abs(refund.value ?? 0);
    } else if (hasTypeCol) {
      const typeVal = cellAt(row, map, "type");
      if (/refund|退款/i.test(typeVal)) {
        refunds = Math.abs(unitsVal);
      } else {
        gross = unitsVal;
      }
    } else {
      gross = unitsVal;
    }

    const cur = byDate.get(date) ?? { gross: 0, refunds: 0 };
    cur.gross += gross;
    cur.refunds += refunds;
    byDate.set(date, cur);
  }

  const rows: SalesDayRow[] = [...byDate.entries()]
    .map(([date, v]) => ({
      date,
      grossUnits: v.gross,
      refundUnits: v.refunds,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { rows, skipped };
}
