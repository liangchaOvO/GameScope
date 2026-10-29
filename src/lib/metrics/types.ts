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

/** 立项书模板库的三阶段分组。 */
export type MetricGroup = "prelaunch" | "launch" | "liveops";

export const GROUP_LABELS: Record<MetricGroup, string> = {
  prelaunch: "发售前 · 愿望单健康",
  launch: "发售期 · 首周表现",
  liveops: "长线运营",
};

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

export interface LinePctPoint {
  label: string;
  pct: number | null;
}

export interface LinePctLine {
  y: number;
  color: string;
  label: string;
}

export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

export interface BarMarkLine {
  y: number;
  label: string;
}

export type MetricChartData =
  | { kind: "weekly-net"; weeks: WeekBar[] }
  | { kind: "conversion"; points: ConversionPoint[] }
  | { kind: "refund"; points: RefundWeekPoint[] }
  | {
      kind: "line-pct";
      points: LinePctPoint[];
      band?: [number, number];
      lines?: LinePctLine[];
    }
  | {
      kind: "bars";
      items: BarItem[];
      unit: "int" | "pct";
      horizontal?: boolean;
      maxPct?: number;
      markLines?: BarMarkLine[];
    };

export type MetricId =
  | "wishlist-accumulation"
  | "wishlist-deletion-rate"
  | "wishlist-visit-conversion"
  | "wishlist-launch-conversion"
  | "first-week-share"
  | "page-conversion"
  | "refund-rate"
  | "discount-pulse-coefficient"
  | "review-sales-estimate"
  | "review-score-tier"
  | "traffic-source-structure"
  | "regional-sales-structure";

export interface MetricResult {
  id: MetricId;
  name: string;
  subtitle: string;
  group: MetricGroup;
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
