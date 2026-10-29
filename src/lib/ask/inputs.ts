import {
  getAppSnapshots,
  getDatasets,
  getRegionalRows,
  getSalesRows,
  getTrafficSourceRows,
  getWishlistRows,
} from "../db/store";
import { computeAllMetrics, type MetricInputs } from "../metrics";
import { minMaxDates } from "../dates";
import { KIND_LABELS, type DatasetKind } from "../types";

/** 装载某项目的全部指标输入（看板与问数共用）。 */
export function loadMetricInputs(projectId: number): {
  inputs: MetricInputs;
  datasets: ReturnType<typeof getDatasets>;
} {
  const datasets = getDatasets(projectId);
  const byKind = new Map(datasets.map((d) => [d.kind, d]));

  const inputs: MetricInputs = {
    wishlist:
      byKind.has("wishlist")
        ? { rows: getWishlistRows(projectId), meta: byKind.get("wishlist")! }
        : null,
    traffic:
      byKind.has("traffic")
        ? { rows: getTrafficSourceRows(projectId), meta: byKind.get("traffic")! }
        : null,
    sales:
      byKind.has("sales")
        ? { rows: getSalesRows(projectId), meta: byKind.get("sales")! }
        : null,
    regional:
      byKind.has("regional")
        ? { rows: getRegionalRows(projectId), meta: byKind.get("regional")! }
        : null,
    snapshots: getAppSnapshots(projectId),
  };
  return { inputs, datasets };
}

/** 按意图时间范围过滤输入行（from/to 均为闭区间；null 表示不限）。 */
export function filterInputsByRange(
  inputs: MetricInputs,
  from: string | null,
  to: string | null
): MetricInputs {
  const inRange = (d: string) => (from == null || d >= from) && (to == null || d <= to);
  return {
    wishlist: inputs.wishlist
      ? { ...inputs.wishlist, rows: inputs.wishlist.rows.filter((r) => inRange(r.date)) }
      : null,
    traffic: inputs.traffic
      ? { ...inputs.traffic, rows: inputs.traffic.rows.filter((r) => inRange(r.date)) }
      : null,
    sales: inputs.sales
      ? { ...inputs.sales, rows: inputs.sales.rows.filter((r) => inRange(r.date)) }
      : null,
    regional: inputs.regional
      ? { ...inputs.regional, rows: inputs.regional.rows.filter((r) => inRange(r.date)) }
      : null,
    snapshots: inputs.snapshots,
  };
}

/** 数据窗口摘要（进 prompt；几行文字，远低于 5K tokens 预算）。 */
export function dataWindowSummary(inputs: MetricInputs): string {
  const allDates: string[] = [];
  const kinds: DatasetKind[] = [];
  for (const key of ["wishlist", "traffic", "sales", "regional"] as const) {
    const ds = inputs[key];
    if (!ds || ds.rows.length === 0) continue;
    kinds.push(key);
    const dates = ds.rows.map((r) => r.date);
    const { min, max } = minMaxDates(dates);
    if (min && max) {
      allDates.push(min, max);
    }
  }
  if (allDates.length === 0) return "（项目尚未接入任何数据）";
  const { min, max } = minMaxDates(allDates);
  return `${min} ~ ${max}；已接入：${kinds.map((k) => KIND_LABELS[k]).join("、")}`;
}
