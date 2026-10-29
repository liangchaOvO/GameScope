/**
 * Value normalization for CSV cells.
 */

export type NumResult =
  | { ok: true; value: number | null } // null = empty cell
  | { ok: false }; // present but not a valid number

const EMPTY_MARKERS = new Set(["", "-", "–", "—", "n/a", "na", "null", "none"]);

export function tryNumber(raw: string): NumResult {
  const v = (raw ?? "").trim();
  if (EMPTY_MARKERS.has(v.toLowerCase())) return { ok: true, value: null };

  // strip thousands separators
  const cleaned = v
    .replace(/\u00a0/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/^\+/, "");

  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

/** For optional columns that may be absent: absent -> null without error. */
export function numberOrZero(v: number | null): number {
  return v ?? 0;
}
