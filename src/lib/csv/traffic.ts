import type { ParsedTable } from "./parse";
import { cellAt, resolveHeaders, type HeaderMap } from "./schema";
import { tryNumber } from "./values";
import { normalizeDate } from "../dates";
import type { TrafficSourceRow } from "../types";
import type { SkippedRow } from "../api-types";
import { TRAFFIC_SPECS } from "./specs";

export interface MapTrafficResult {
  rows: TrafficSourceRow[];
  skipped: SkippedRow[];
  duplicateKeys: number;
}

export function resolveTrafficHeaders(headers: string[]): HeaderMap {
  return resolveHeaders(headers, TRAFFIC_SPECS).map;
}

export function mapTraffic(table: ParsedTable, map: HeaderMap): MapTrafficResult {
  const rows: TrafficSourceRow[] = [];
  const skipped: SkippedRow[] = [];
  const keys = new Set<string>();

  const hasSource = (map["source"] ?? -1) >= 0;

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

    const visitsRaw = cellAt(row, map, "visits");
    const unitsRaw = cellAt(row, map, "units");
    const visits = tryNumber(visitsRaw);
    const units = tryNumber(unitsRaw);
    if (!visits.ok) {
      skipped.push({
        rowNo: row.rowNo,
        message: `「访问」列的值「${visitsRaw}」不是合法数字`,
      });
      continue;
    }
    if (!units.ok) {
      skipped.push({
        rowNo: row.rowNo,
        message: `「购买」列的值「${unitsRaw}」不是合法数字`,
      });
      continue;
    }

    const source = hasSource ? cellAt(row, map, "source") || "未知来源" : "全部来源";

    rows.push({
      date,
      source,
      visits: visits.value ?? 0,
      units: units.value ?? 0,
    });
  }

  const uniqueKeys = new Set(rows.map((r) => `${r.date}|${r.source}`));
  const duplicateKeys = rows.length - uniqueKeys.size;

  // aggregate duplicates (same date+source) by summing
  const agg = new Map<string, TrafficSourceRow>();
  for (const r of rows) {
    const key = `${r.date}|${r.source}`;
    const cur = agg.get(key);
    if (cur) {
      cur.visits += r.visits;
      cur.units += r.units;
    } else {
      agg.set(key, { ...r });
    }
  }
  const unique = [...agg.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.source < b.source ? -1 : 1
  );

  return { rows: unique, skipped, duplicateKeys };
}
