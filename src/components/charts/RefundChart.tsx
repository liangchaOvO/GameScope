"use client";

import type { EChartsOption } from "echarts";
import Chart from "../Chart";
import type { RefundWeekPoint } from "../../lib/metrics/types";

/** 模板 7 图表：周退款率折线 + 10% 关注线 / 15% 警示线。 */
export default function RefundChart({ points }: { points: RefundWeekPoint[] }) {
  const option: EChartsOption = {
    grid: { left: 48, right: 20, top: 28, bottom: 52 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) =>
        typeof v === "number" ? `${v.toFixed(1)}%` : "—",
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      axisLabel: { rotate: 45, fontSize: 10, interval: "auto" },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: "{value}%" },
    },
    series: [
      {
        name: "周退款率",
        type: "line",
        data: points.map((p) => p.pct),
        connectNulls: false,
        showSymbol: true,
        symbolSize: 5,
        itemStyle: { color: "#6366f1" },
        lineStyle: { color: "#6366f1", width: 2 },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              yAxis: 10,
              lineStyle: { color: "#d97706", type: "dashed" },
              label: { formatter: "10% 关注线", fontSize: 10, color: "#d97706" },
            },
            {
              yAxis: 15,
              lineStyle: { color: "#dc2626", type: "dashed" },
              label: { formatter: "15% 警示线", fontSize: 10, color: "#dc2626" },
            },
          ],
        },
      },
    ],
  };
  return <Chart option={option} />;
}
