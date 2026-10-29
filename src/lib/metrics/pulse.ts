import type { WishDayRow } from "../types";
import { dateDiffDays } from "../dates";

/**
 * 脉冲日判定（经验规则，模板 1/8 共用）：
 * 当日新增 ≥ max(3 × 前 28 天非脉冲日新增中位数, 中位数 + 20)。
 * 基线剔除已判定为脉冲的日子，避免「发售周抬高自身后续基线」导致后续活动漏检；
 * 非脉冲日不足 7 天时退回全窗口中位数，全窗口不足 7 天时不判定。
 */
export const PULSE_WINDOW_DAYS = 28;
export const PULSE_MIN_BASELINE_DAYS = 7;

export function detectPulseDays(rows: WishDayRow[]): boolean[] {
  const pulses: boolean[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cur = rows[i];
    const priorAll: number[] = [];
    const priorNonPulse: number[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const diff = dateDiffDays(rows[j].date, cur.date);
      if (diff > PULSE_WINDOW_DAYS) break;
      if (diff > 0) {
        priorAll.push(rows[j].adds ?? 0);
        if (!pulses[j]) priorNonPulse.push(rows[j].adds ?? 0);
      }
    }
    if (priorAll.length < PULSE_MIN_BASELINE_DAYS) {
      pulses.push(false);
      continue;
    }
    const baseline =
      priorNonPulse.length >= PULSE_MIN_BASELINE_DAYS ? priorNonPulse : priorAll;
    const med = median(baseline) ?? 0;
    const threshold = Math.max(3 * med, med + 20);
    pulses.push((cur.adds ?? 0) >= threshold);
  }
  return pulses;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
