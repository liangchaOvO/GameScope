import type { ReactNode } from "react";
import type { MetricResult } from "../lib/metrics/types";
import StatusChip from "./StatusChip";
import { CaliberPanel, TeachingCard, WarningList } from "./InfoPanels";

export default function MetricCard({
  metric,
  chart,
}: {
  metric: MetricResult;
  chart: ReactNode;
}) {
  const unavailable =
    metric.status === "unavailable" || metric.status === "insufficient";
  return (
    <article className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{metric.name}</h3>
          <p className="text-sm text-gray-500">{metric.subtitle}</p>
        </div>
        <StatusChip status={metric.status} label={metric.statusLabel} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-4xl font-bold tabular-nums tracking-tight">
          {metric.display}
        </span>
        {metric.secondary && (
          <span className="text-sm text-gray-500">{metric.secondary}</span>
        )}
      </div>

      <p className="text-sm text-gray-600">{metric.rangeNote}</p>

      {metric.confidenceNote && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {metric.confidenceNote}
        </p>
      )}

      {unavailable && metric.confidenceNote ? null : chart}

      <CaliberPanel caliber={metric.caliber} />
      <TeachingCard teaching={metric.teaching} />
      <WarningList warnings={metric.warnings} />
    </article>
  );
}
