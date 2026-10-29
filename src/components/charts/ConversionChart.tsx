"use client";

import type { EChartsOption } from "echarts";
import Chart from "../Chart";
import type { ConversionPoint } from "../lib/metrics/types";

/** 模板 6 图表：日转化率折线 + 健康区间 5–12% 绿色参考带。 */
export default function ConversionChart({ points }: { points: ConversionPoint[] }) {
  const option: EChartsOption = {
    grid: { left: 48, right: 20, top: 28, bottom: 52 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) =>
        typeof v === "number" ? `${v.toFixed(1)}%` : "—",
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.date),
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        interval: "auto",
        formatter: (s: string) => s.slice(5).replace("-", "/"),
      },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: "{value}%" },
    },
    series: [
      {
        name: "日转化率",
        type: "line",
        data: points.map((p) => p.pct),
        connectNulls: false,
        showSymbol: false,
        itemStyle: { color: "#6366f1" },
        lineStyle: { color: "#6366f1", width: 2 },
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(34,197,94,0.08)" },
          label: { show: true, position: "insideTop", fontSize: 10, color: "#16a34a" },
          data: [[{ yAxis: 5, name: "健康区间 5–12%" }, { yAxis: 12 }]],
        },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              yAxis: 5,
              lineStyle: { color: "#dc2626", type: "dashed" },
              label: { formatter: "5% 健康下限", fontSize: 10, color: "#dc2626" },
            },
          ],
        },
      },
    ],
  };
  return <Chart option={option} />;
}
