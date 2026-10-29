"use client";

import type { EChartsOption } from "echarts";
import Chart from "../Chart";
import type { BarItem, BarMarkLine } from "../../lib/metrics/types";

const DEFAULT_COLOR = "#6366f1";

/** 通用条形图：纵向/横向、绝对值或百分比、可选参考线（模板 4/5/8/9/10/11/12）。 */
export default function BarsChart({
  items,
  unit,
  horizontal = false,
  maxPct,
  markLines = [],
}: {
  items: BarItem[];
  unit: "int" | "pct";
  horizontal?: boolean;
  maxPct?: number;
  markLines?: BarMarkLine[];
}) {
  const valueFormatter = (v: unknown) =>
    typeof v === "number"
      ? unit === "pct"
        ? `${v.toFixed(1)}%`
        : Math.round(v).toLocaleString("en-US")
      : "—";

  if (horizontal) {
    const option: EChartsOption = {
      grid: { left: 110, right: 48, top: 12, bottom: 28 },
      tooltip: { trigger: "item", valueFormatter },
      xAxis: {
        type: "value",
        axisLabel: { formatter: unit === "pct" ? "{value}%" : "{value}", fontSize: 10 },
        ...(maxPct != null ? { max: maxPct } : {}),
      },
      yAxis: {
        type: "category",
        data: items.map((i) => i.label),
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: "bar",
          data: items.map((i) => ({ value: i.value, itemStyle: { color: i.color ?? DEFAULT_COLOR } })),
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            formatter: (pRaw: unknown) => {
              const v = (pRaw as { value?: unknown })?.value;
              return valueFormatter(v);
            },
          },
        },
      ],
    };
    return <Chart option={option} height={Math.max(120, items.length * 34 + 40)} />;
  }

  const series: Record<string, unknown> = {
    type: "bar",
    data: items.map((i) => ({ value: i.value, itemStyle: { color: i.color ?? DEFAULT_COLOR } })),
    barMaxWidth: 30,
  };
  if (markLines.length > 0) {
    series.markLine = {
      silent: true,
      symbol: "none",
      data: markLines.map((l) => ({
        yAxis: l.y,
        lineStyle: { color: "#dc2626", type: "dashed" },
        label: { formatter: l.label, fontSize: 10, color: "#dc2626" },
      })),
    };
  }

  const option: EChartsOption = {
    grid: { left: 56, right: 20, top: 20, bottom: 48 },
    tooltip: { trigger: "axis", valueFormatter },
    xAxis: {
      type: "category",
      data: items.map((i) => i.label),
      axisLabel: { rotate: items.length > 12 ? 45 : 0, fontSize: 10, interval: "auto" },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: unit === "pct" ? "{value}%" : "{value}", fontSize: 10 },
    },
    series: [series],
  };
  return <Chart option={option} />;
}
