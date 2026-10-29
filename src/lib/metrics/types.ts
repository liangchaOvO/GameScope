import type { SanityWarning } from "../types";

/** Metric status → chip color semantics: 达标绿 / 警示红 / 关注琥珀。 */
export type MetricStatus =
  | "good"
  | "excellent"
  | "warn"
  | "alert"
  | "info"
  | "insufficient"
  | "unavailable";

/** D4 信任机制：每个分析结果必须展示的口径链路。 */
export interface CaliberInfo {
  definition: string;
  formula: string;
  fields: string[];
  rowCount: number;
  dateRange: { from: string; to: string } | null;
  windowNote?: string;
  sourceFiles: string[];
}

/** D7 教学卡片四要素（每张 ≤120 字）。 */
export interface TeachingCardInfo {
  what: string;
  why: string;
  range: string;
  next: string;
}

export interface WeekBar {
  label: string;
  net: number;
  pulse: boolean;
  pulseAdds: number;
  totalEnd: number | null;
}

export interface ConversionPoint {
  date: string;
  pct: number | null;
}

export interface RefundWeekPoint {
  label: string;
  pct: number | null;
}

export type MetricChartData =
  | { kind: "weekly-net"; weeks: WeekBar[] }
  | { kind: "conversion"; points: ConversionPoint[] }
  | { kind: "refund"; points: RefundWeekPoint[] };

export type MetricId =
  | "wishlist-accumulation"
  | "page-conversion"
  | "refund-rate";

export interface MetricResult {
  id: MetricId;
  name: string;
  subtitle: string;
  status: MetricStatus;
  statusLabel: string;
  display: string;
  secondary?: string;
  rangeNote: string;
  confidenceNote?: string;
  caliber: CaliberInfo;
  teaching: TeachingCardInfo;
  chartData: MetricChartData;
  warnings: SanityWarning[];
}

export interface MetricSource {
  filename: string;
  warnings: SanityWarning[];
}
