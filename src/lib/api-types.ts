import type { DatasetMeta, SanityWarning } from "./types";
import type { MetricResult } from "./metrics/types";
import type { StoredSnapshots } from "./db/store";

export interface SkippedRow {
  rowNo: number;
  message: string;
}

export interface FileUploadResult {
  filename: string;
  ok: boolean;
  kindLabel?: string;
  rowCount?: number;
  dateMin?: string | null;
  dateMax?: string | null;
  error?: string;
  skipped?: SkippedRow[];
  warnings?: SanityWarning[];
}

export interface OverviewDTO {
  datasets: DatasetMeta[];
  metrics: MetricResult[];
  hasData: boolean;
  user: { email: string };
  project: { id: number; name: string; appId: number | null };
  snapshots?: StoredSnapshots;
}
