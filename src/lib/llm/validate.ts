import type { IntentResult } from "./provider";
import { METRIC_CATALOG } from "./prompt";

/**
 * 意图 JSON 二次校验（代码层守卫，LLM 输出不可信）：
 * - 严格白名单：未知字段丢弃、枚举越界拒绝、日期格式/顺序校验；
 * - metricId 必须逐字命中指标目录（防编造指标）；
 * - 任何不合规 → null（管道降级到模板看板）。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateIntent(raw: unknown): IntentResult | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const intent = obj.intent;
  if (intent !== "metric_query" && intent !== "unknown") return null;

  const metricIdRaw = obj.metricId;
  if (metricIdRaw != null && typeof metricIdRaw !== "string") return null;
  const catalogIds = new Set<string>(METRIC_CATALOG.map((m) => m.id));
  let metricId: string | null = null;
  if (typeof metricIdRaw === "string" && metricIdRaw !== "") {
    if (!catalogIds.has(metricIdRaw)) return null; // 编造的指标 id → 整体拒绝
    metricId = metricIdRaw;
  }
  if (intent === "metric_query" && metricId == null) return null;
  if (intent === "unknown" && metricId != null) return null;

  const dimensionRaw = obj.dimension;
  const dimension =
    typeof dimensionRaw === "string" &&
    ["weekly", "daily", "source", "country"].includes(dimensionRaw)
      ? dimensionRaw
      : null;

  let timeRange: IntentResult["timeRange"] = { from: null, to: null };
  const tr = obj.timeRange;
  if (tr != null) {
    if (typeof tr !== "object") return null;
    const { from, to } = tr as Record<string, unknown>;
    const fromOk = from == null || from === "" ? null : from;
    const toOk = to == null || to === "" ? null : to;
    if (fromOk != null && (typeof fromOk !== "string" || !isValidDate(fromOk))) return null;
    if (toOk != null && (typeof toOk !== "string" || !isValidDate(toOk))) return null;
    const f = fromOk as string | null;
    const t = toOk as string | null;
    if (f && t && f > t) return null;
    timeRange = { from: f, to: t };
  }

  return { intent, metricId, dimension, timeRange };
}
