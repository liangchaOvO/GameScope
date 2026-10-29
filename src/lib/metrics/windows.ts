import type { SalesDayRow } from "../types";
import { dateDiffDays } from "../dates";

/** 首个有销量的日期（≈ 发售日/购买开放日）。 */
export function findFirstSaleDate(rows: SalesDayRow[]): string | null {
  for (const r of rows) {
    if (r.grossUnits > 0) return r.date;
  }
  return null;
}

/** [from, to] 闭区间内的毛销量合计。 */
export function sumGrossInRange(rows: SalesDayRow[], from: string, to: string): number {
  return rows
    .filter((r) => r.date >= from && r.date <= to)
    .reduce((a, r) => a + r.grossUnits, 0);
}

/** 发售日起第 n 天（n 从 0 计）的日期字符串。 */
export function dayAfter(from: string, n: number): string {
  return new Date(
    new Date(`${from}T00:00:00Z`).getTime() + n * 86400000
  )
    .toISOString()
    .slice(0, 10);
}

/** 发售日距今数据覆盖天数（含发售日）。 */
export function daysSinceCovered(sales: SalesDayRow[], launch: string): number {
  const last = sales.length > 0 ? sales[sales.length - 1].date : launch;
  return Math.max(1, dateDiffDays(launch, last) + 1);
}
