import { decodeBuffer } from "./decode";
import { parseCsv } from "./parse";
import { bestCandidateKind, detectCsvKind, KIND_SPECS } from "./specs";
import { resolveHeaders } from "./schema";
import { mapWishlist, resolveWishlistHeaders } from "./wishlist";
import { mapTraffic, resolveTrafficHeaders } from "./traffic";
import { mapSales, resolveSalesHeaders } from "./sales";
import { checkSales, checkTraffic, checkWishlist } from "../sanity/check";
import {
  replaceSales,
  replaceTraffic,
  replaceWishlist,
} from "../db/store";
import { KIND_LABELS, type DatasetKind, type SanityWarning } from "../types";
import type { FileUploadResult } from "../api-types";
import type { TrafficDayRow } from "../types";

/**
 * Ingest one uploaded file: decode → parse → detect kind → map → validate →
 * store. Errors must be human-readable and point at the offending
 * column/row (F1 acceptance).
 */
export function ingestBuffer(filename: string, buf: Buffer): FileUploadResult {
  const text = decodeBuffer(buf);
  if (!text.trim()) {
    return { filename, ok: false, error: "文件为空或无法解码。" };
  }

  const table = parseCsv(text);
  if (table.headers.length === 0 || table.rows.length === 0) {
    return {
      filename,
      ok: false,
      error: "未找到数据行（文件可能只有表头，或不是 CSV 文件）。",
    };
  }

  const kind = detectCsvKind(table.headers);
  if (!kind) {
    const candidate = bestCandidateKind(table.headers);
    if (candidate) {
      return {
        filename,
        ok: false,
        error:
          `疑似${KIND_LABELS[candidate.kind]}，但缺少必需列：「${candidate.missing.join("、")}」。` +
          `识别到的表头：「${table.headers.join("、")}」。` +
          `请检查导出的报告类型与文件完整性。`,
      };
    }
    return {
      filename,
      ok: false,
      error:
        `无法识别文件类型：表头与已支持的 Steamworks 导出格式均不匹配。` +
        `识别到的表头：「${table.headers.join("、")}」。` +
        `当前支持：${Object.values(KIND_LABELS).join("、")}。`,
    };
  }

  if (kind === "wishlist") {
    const { missing } = resolveHeaders(table.headers, KIND_SPECS.wishlist);
    if (missing.length > 0) {
      return missingColumns(filename, missing, table.headers);
    }
    const map = resolveWishlistHeaders(table.headers);
    const { rows, skipped, duplicateDates } = mapWishlist(table, map);
    if (rows.length === 0) {
      return allRowsFailed(filename, skipped);
    }
    const warnings: SanityWarning[] = [];
    if (duplicateDates.length > 0) {
      warnings.push({
        level: "warn",
        code: "duplicate-dates",
        message: `存在 ${duplicateDates.length} 个重复日期（如 ${duplicateDates
          .slice(0, 3)
          .join("、")}），已按「后出现的行优先」合并。`,
      });
    }
    warnings.push(...checkWishlist(rows));
    const meta = replaceWishlist(filename, rows, warnings);
    return {
      filename,
      ok: true,
      kindLabel: KIND_LABELS.wishlist,
      rowCount: meta.rowCount,
      dateMin: meta.dateMin,
      dateMax: meta.dateMax,
      skipped: skipped.length > 0 ? skipped : undefined,
      warnings,
    };
  }

  if (kind === "traffic") {
    const { missing } = resolveHeaders(table.headers, KIND_SPECS.traffic);
    if (missing.length > 0) {
      return missingColumns(filename, missing, table.headers);
    }
    const map = resolveTrafficHeaders(table.headers);
    const { rows, skipped, duplicateKeys } = mapTraffic(table, map);
    if (rows.length === 0) {
      return allRowsFailed(filename, skipped);
    }
    const warnings: SanityWarning[] = [];
    if (duplicateKeys > 0) {
      warnings.push({
        level: "warn",
        code: "duplicate-keys",
        message: `存在 ${duplicateKeys} 行「日期×来源」重复，已按访问/购买求和合并。`,
      });
    }
    // sanity runs on daily aggregates
    const daily = aggregateDaily(rows);
    warnings.push(...checkTraffic(daily));
    const meta = replaceTraffic(filename, rows, warnings);
    return {
      filename,
      ok: true,
      kindLabel: KIND_LABELS.traffic,
      rowCount: meta.rowCount,
      dateMin: meta.dateMin,
      dateMax: meta.dateMax,
      skipped: skipped.length > 0 ? skipped : undefined,
      warnings,
    };
  }

  // sales
  const { missing } = resolveHeaders(table.headers, KIND_SPECS.sales);
  if (missing.length > 0) {
    return missingColumns(filename, missing, table.headers);
  }
  const map = resolveSalesHeaders(table.headers);
  const { rows, skipped } = mapSales(table, map);
  if (rows.length === 0) {
    return allRowsFailed(filename, skipped);
  }
  const warnings = checkSales(rows);
  const meta = replaceSales(filename, rows, warnings);
  return {
    filename,
    ok: true,
    kindLabel: KIND_LABELS.sales,
    rowCount: meta.rowCount,
    dateMin: meta.dateMin,
    dateMax: meta.dateMax,
    skipped: skipped.length > 0 ? skipped : undefined,
    warnings,
  };
}

function missingColumns(
  filename: string,
  missing: string[],
  headers: string[]
): FileUploadResult {
  return {
    filename,
    ok: false,
    error:
      `缺少必需列：「${missing.join("、")}」。` +
      `该文件表头为：「${headers.join("、")}」。` +
      `请确认导出的是 Steamworks 对应报告的 CSV 原始文件。`,
  };
}

function allRowsFailed(
  filename: string,
  skipped: { rowNo: number; message: string }[]
): FileUploadResult {
  const first = skipped[0];
  return {
    filename,
    ok: false,
    error:
      `所有数据行都无法解析（共 ${skipped.length} 处错误）。` +
      `首个错误：第 ${first?.rowNo} 行：${first?.message ?? "未知错误"}。`,
  };
}

function aggregateDaily(rows: { date: string; visits: number; units: number }[]): TrafficDayRow[] {
  const map = new Map<string, TrafficDayRow>();
  for (const r of rows) {
    const cur = map.get(r.date) ?? { date: r.date, visits: 0, units: 0 };
    cur.visits += r.visits;
    cur.units += r.units;
    map.set(r.date, cur);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
