import type { MetricResult } from "../lib/metrics/types";
import WeeklyNetChart from "./charts/WeeklyNetChart";
import ConversionChart from "./charts/ConversionChart";
import RefundChart from "./charts/RefundChart";
import LinePctChart from "./charts/LinePctChart";
import BarsChart from "./charts/BarsChart";

/** 图表分发：看板与问数结果共用（D4 同源同构）。 */
export default function MetricChart({ metric }: { metric: MetricResult }) {
  const d = metric.chartData;
  if (d.kind === "weekly-net") return <WeeklyNetChart weeks={d.weeks} />;
  if (d.kind === "conversion") return <ConversionChart points={d.points} />;
  if (d.kind === "refund") return <RefundChart points={d.points} />;
  if (d.kind === "line-pct")
    return <LinePctChart points={d.points} band={d.band} lines={d.lines} />;
  return (
    <BarsChart
      items={d.items}
      unit={d.unit}
      horizontal={d.horizontal}
      maxPct={d.maxPct}
      markLines={d.markLines}
    />
  );
}
