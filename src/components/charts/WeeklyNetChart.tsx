"use client";

import type { EChartsOption } from "echarts";
import Chart from "../Chart";
import type { WeekBar } from "../../lib/metrics/types";

/** 模板 1 图表：周净增柱状（脉冲周橙色高亮）+ 愿望单总量趋势线。 */
export default function WeeklyNetChart({ weeks }: { weeks: WeekBar[] }) {
  const option: EChartsOption = {
    grid: { left: 56, right: 56, top: 34, bottom: 52 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) =>
        typeof v === "number" ? Math.round(v).toLocaleString("en-US") : "—",
    },
    legend: {
      data: ["周净增", "愿望单总量"],
      top: 0,
      textStyle: { fontSize: 11 },
    },
    xAxis: {
      type: "category",
      data: weeks.map((w) => w.label),
      axisLabel: { rotate: 45, fontSize: 10, interval: "auto" },
    },
    yAxis: [
      { type: "value", name: "周净增", nameTextStyle: { fontSize: 10 } },
      {
        type: "value",
        name: "总量",
        nameTextStyle: { fontSize: 10 },
        min: 0,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "周净增",
        type: "bar",
        data: weeks.map((w) => ({
          value: w.net,
          itemStyle: { color: w.pulse ? "#f59e0b" : "#6366f1" },
        })),
      },
      {
        name: "愿望单总量",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        data: weeks.map((w) => w.totalEnd),
        itemStyle: { color: "#94a3b8" },
        lineStyle: { color: "#94a3b8", width: 1.5 },
        connectNulls: true,
      },
    ],
  };
  return <Chart option={option} />;
}
