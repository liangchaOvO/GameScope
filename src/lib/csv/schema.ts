import type { ParsedTable } from "./parse";

export type FieldType = "date" | "number" | "string";

export interface ColumnSpec {
  /** canonical field name used in code */
  field: string;
  /** header names accepted for this field (compared case-insensitively after trim) */
  aliases: string[];
  required: boolean;
  type: FieldType;
  /** human-readable name used in error messages */
  label: string;
}

export interface HeaderMap {
  /** field -> column index (-1 when absent) */
  [field: string]: number;
}

export interface ResolveResult {
  map: HeaderMap;
  /** labels of required columns that are missing */
  missing: string[];
}

export function resolveHeaders(
  headers: string[],
  specs: ColumnSpec[]
): ResolveResult {
  const normalized = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h.toLowerCase().replace(/\s+/g, " ");
    if (!normalized.has(key)) normalized.set(key, i);
  });

  const map: HeaderMap = {};
  const missing: string[] = [];
  for (const spec of specs) {
    let idx = -1;
    for (const alias of spec.aliases) {
      const key = alias.toLowerCase().replace(/\s+/g, " ");
      if (normalized.has(key)) {
        idx = normalized.get(key)!;
        break;
      }
    }
    map[spec.field] = idx;
    if (idx === -1 && spec.required) missing.push(spec.label);
  }
  return { map, missing };
}

/** Count how many required specs are satisfiable by the given headers. */
export function countRequiredMatches(
  headers: string[],
  specs: ColumnSpec[]
): { matched: number; total: number } {
  const { missing } = resolveHeaders(headers, specs);
  const total = specs.filter((s) => s.required).length;
  return { matched: total - missing.length, total };
}

export function cellAt(row: { cells: string[] }, map: HeaderMap, field: string): string {
  const idx = map[field];
  if (idx == null || idx < 0) return "";
  return (row.cells[idx] ?? "").trim();
}
