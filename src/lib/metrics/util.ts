/** Math helpers for metric computation (pure, no IO). */

export function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return sum(nums) / nums.length;
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Divide with zero-denominator guard (returns null instead of Infinity/NaN). */
export function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}
