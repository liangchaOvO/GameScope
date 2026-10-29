"use client";

import type { EChartsOption } from "echarts";
import Chart from "../Chart";
import type { LinePctLine, LinePctPoint } from "../../lib/metrics/types";

/** 通用百分比折线图：可选健康区间带 + 参考线（模板 2/3 等）。 */
export default function LinePctChart({
  points,
  band,
  lines = [],
}: {
  points: LinePctPoint[];
  band?: [number, number];
  lines?: LinePctLine[];
}) {
  const series: EChartsOption["series"] = [
    {
      name: "占比",
      type: "line",
      data: points.map((p) => p.pct),
      connectNulls: false,
      showSymbol: points.length <= 40,
      itemStyle: { color: "#6366f1" },
      lineStyle: { color: "#6366f1", width: 2 },
    },
  ];
  const first = series[0] as Record<string, unknown>;
  if (band) {
    first.markArea = {
      silent: true,
      itemStyle: { color: "rgba(34,197,94,0.08)" },
      label: { show: true, position: "insideTop", fontSize: 10, color: "#16a34a" },
      data: [[{ yAxis: band[0], name: `健康区间 ${band[0]}–${band[1]}%` }, { yAxis: band[1] }]],
    };
  }
  if (lines.length > 0) {
    first.markLine = {
      silent: true,
      symbol: "none",
      data: lines.map((l) => ({
        yAxis: l.y,
        lineStyle: { color: l.color, type: "dashed" },
        label: { formatter: l.label, fontSize: 10, color: l.color },
      })),
    };
  }

  const option: EChartsOption = {
    grid: { left: 48, right: 20, top: 28, bottom: 52 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => (typeof v === "number" ? `${v.toFixed(1)}%` : "—"),
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      axisLabel: { rotate: 45, fontSize: 10, interval: "auto" },
    },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
    series,
  };
  return <Chart option={option} />;
}
