"use client";

import type { AskOutcome } from "../lib/ask/pipeline";
import { METRIC_CATALOG } from "../lib/llm/prompt";
import MetricCard from "./MetricCard";
import MetricChart from "./MetricChart";

/** 问数结果：意图透明 + 与看板同构的指标卡片（含教学卡片，F4）。 */
export default function AskResult({
  outcome,
}: {
  outcome: AskOutcome;
}) {
  if (outcome.degraded) {
    return (
      <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <p>⚠ {outcome.reason}</p>
        {outcome.metrics.length > 0 ? (
          <p className="text-amber-700">
            下方模板看板已列出全部 {outcome.metrics.length} 个指标结果，可直接查看；也可换一种问法重试。
          </p>
        ) : (
          <p className="text-amber-700">请先上传数据或载入演示数据。</p>
        )}
        {outcome.providerId && (
          <p className="text-xs text-amber-600/80">意图 Provider：{outcome.providerId}</p>
        )}
      </div>
    );
  }

  const metricName = METRIC_CATALOG.find((m) => m.id === outcome.intent.metricId)?.name ?? outcome.intent.metricId;
  const { from, to } = outcome.intent.timeRange;

  return (
    <div className="space-y-4">
      <section
        aria-label="意图解析"
        className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm"
      >
        <h3 className="mb-2 font-semibold text-gray-700">意图解析（LLM 只做这一步，计算在本地代码执行）</h3>
        <dl className="grid grid-cols-[7em_1fr] gap-x-3 gap-y-1 text-gray-800">
          <dt className="text-gray-500">定位指标</dt>
          <dd>
            {metricName}{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-gray-600">
              {outcome.intent.metricId}
            </code>
          </dd>
          <dt className="text-gray-500">时间范围</dt>
          <dd>{from || to ? `${from ?? "起点"} ~ ${to ?? "终点"}` : "全部数据"}</dd>
          <dt className="text-gray-500">维度</dt>
          <dd>{outcome.intent.dimension ?? "—"}</dd>
          <dt className="text-gray-500">Provider</dt>
          <dd>
            {outcome.providerId} · 输入 ≈{outcome.tokens.inputEstimate} tokens（预算 5,000）· 输出 ≈
            {outcome.tokens.outputEstimate} tokens
          </dd>
        </dl>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-gray-500">查看模型原始输出</summary>
          <pre className="mt-1 overflow-x-auto rounded bg-white p-2 font-mono text-xs text-gray-600">
            {JSON.stringify(outcome.rawIntent, null, 2)}
          </pre>
        </details>
      </section>

      <MetricCard metric={outcome.metric} chart={<MetricChart metric={outcome.metric} />} />
    </div>
  );
}
