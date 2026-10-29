import type { MetricStatus } from "../lib/metrics/types";

const STYLES: Record<MetricStatus, string> = {
  good: "bg-green-100 text-green-800 border-green-300",
  excellent: "bg-green-100 text-green-800 border-green-300",
  warn: "bg-amber-100 text-amber-800 border-amber-300",
  alert: "bg-red-100 text-red-700 border-red-300",
  info: "bg-gray-100 text-gray-700 border-gray-300",
  insufficient: "bg-amber-100 text-amber-800 border-amber-300",
  unavailable: "bg-gray-100 text-gray-500 border-gray-200",
};

/** 颜色遵循中国习惯：达标绿、警示红（本产品非股票场景）。 */
export default function StatusChip({
  status,
  label,
}: {
  status: MetricStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium ${STYLES[status]}`}
    >
      {label}
    </span>
  );
}
