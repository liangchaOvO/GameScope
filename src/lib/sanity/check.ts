import type {
  SanityWarning,
  SalesDayRow,
  TrafficDayRow,
  WishDayRow,
} from "../types";
import { dateDiffDays, minMaxDates } from "../dates";

/**
 * F5 sanity checks (M0 subset): row counts, time-range completeness,
 * null ratios and internal consistency. Warnings are surfaced in the UI —
 * the system must warn instead of silently producing wrong numbers.
 */

function checkDailyCoverage(
  rowCount: number,
  dates: string[]
): SanityWarning[] {
  const out: SanityWarning[] = [];
  const { min, max } = minMaxDates(dates);
  if (rowCount < 7) {
    out.push({
      level: "warn",
      code: "few-rows",
      message: `样本较少：仅 ${rowCount} 行日数据，结果仅供参考。`,
    });
  } else if (min && max) {
    const expected = dateDiffDays(min, max) + 1;
    const distinct = new Set(dates).size;
    const missing = expected - distinct;
    if (missing > 0) {
      out.push({
        level: "warn",
        code: "date-gaps",
        message: `时间范围不连续：${min} ~ ${max} 之间缺少 ${missing} 天的数据（导出时段选择或后端缺失所致），涉及按日汇总的指标为近似值。`,
      });
    }
  }
  return out;
}

function nullRatioWarn(
  label: string,
  values: (number | null)[],
  total: number
): SanityWarning | null {
  const nulls = values.filter((v) => v == null).length;
  if (total > 0 && nulls / total > 0.05) {
    return {
      level: "warn",
      code: "null-ratio",
      message: `「${label}」列有 ${nulls}/${total} 行为空（${((
        (nulls / total) *
        100
      )).toFixed(0)}%），空值按 0 参与计算，可能低估。`,
    };
  }
  return null;
}

export function checkWishlist(rows: WishDayRow[]): SanityWarning[] {
  const out = checkDailyCoverage(rows.length, rows.map((r) => r.date));
  const addWarn = nullRatioWarn("新增", rows.map((r) => r.adds), rows.length);
  if (addWarn) out.push(addWarn);
  const delWarn = nullRatioWarn("删单", rows.map((r) => r.deletes), rows.length);
  if (delWarn) out.push(delWarn);

  // cumulative consistency: total[i] == total[i-1] + net[i]
  let mismatches = 0;
  let checked = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.total == null || cur.total == null) continue;
    const net =
      cur.net ??
      (cur.adds ?? 0) - (cur.deletes ?? 0) - (cur.purchases ?? 0) - (cur.gifts ?? 0);
    checked++;
    if (Math.abs(prev.total + net - cur.total) > 0.5) mismatches++;
  }
  if (checked > 0 && mismatches > 0) {
    out.push({
      level: "warn",
      code: "cumulative-mismatch",
      message: `愿望单总量与逐日净增在 ${mismatches}/${checked} 处对不上（数据可能被二次编辑或口径不同），净增类指标以「新增−删单−购买移除−礼物移除」计算为准。`,
    });
  }
  return out;
}

export function checkTraffic(rows: TrafficDayRow[]): SanityWarning[] {
  return checkDailyCoverage(rows.length, rows.map((r) => r.date));
}

export function checkSales(rows: SalesDayRow[]): SanityWarning[] {
  return checkDailyCoverage(rows.length, rows.map((r) => r.date));
}
