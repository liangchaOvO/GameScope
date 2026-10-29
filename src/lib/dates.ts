/**
 * Date-only helpers working on 'YYYY-MM-DD' strings, computed in UTC
 * to avoid timezone/DST surprises.
 */

const YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const Y_FIRST = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/;
const Y_LAST = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validY(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Normalize common date formats to 'YYYY-MM-DD'; null when unparseable. */
export function normalizeDate(raw: string): string | null {
  const v = (raw ?? "").trim();
  let m = YMD.exec(v);
  if (m) return validY(+m[1], +m[2], +m[3]);
  m = Y_FIRST.exec(v);
  if (m) return validY(+m[1], +m[2], +m[3]);
  m = Y_LAST.exec(v);
  if (m) {
    // assume M/D/YYYY (US style, common in exports)
    return validY(+m[3], +m[1], +m[2]);
  }
  return null;
}

export function toUtc(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

/** whole days from a to b (b - a) */
export function dateDiffDays(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86400000);
}

/** Monday of the ISO week containing d, as 'YYYY-MM-DD'. */
export function isoWeekStart(d: string): string {
  const dt = toUtc(d);
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/** 'MM-DD~MM-DD' label for a week given its Monday. */
export function weekLabel(weekStart: string): string {
  const start = weekStart.slice(5, 10).replace("-", "/");
  const end = new Date(toUtc(weekStart).getTime() + 6 * 86400000)
    .toISOString()
    .slice(5, 10)
    .replace("-", "/");
  return `${start}~${end}`;
}

export function minMaxDates(dates: string[]): {
  min: string | null;
  max: string | null;
} {
  if (dates.length === 0) return { min: null, max: null };
  const sorted = [...dates].sort();
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}
