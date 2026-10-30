import type { MetricInputs } from "../metrics";
import type { MetricResult } from "../metrics/types";
import { METRIC_REGISTRY, computeAllMetrics } from "../metrics";
import type { LlmProvider } from "../llm/provider";
import { buildIntentPrompt, estimateTokens, assertWithinBudget } from "../llm/prompt";
import { validateIntent } from "../llm/validate";
import { dataWindowSummary, filterInputsByRange } from "./inputs";

/**
 * F3 问数管道：问题 → LLM 意图 JSON → 代码层校验 → 复用模板计算（同源同构）。
 *
 * 硬性纪律：
 * - LLM 输出只有意图（指标/维度/时间范围），管道不透传任何 LLM 数值；
 * - 意图无效 / 定位不到指标 / Provider 失败 → 一律降级到模板看板引导；
 * - 降级结果全部来自代码计算（computeAllMetrics），LLM 派生数值在结构上无路径。
 */

export type AskOutcome =
  | {
      degraded: true;
      reason: string;
      /** 降级引导：当前项目全部模板结果（即模板看板数据） */
      metrics: MetricResult[];
      providerId: string | null;
    }
  | {
      degraded: false;
      intent: {
        intent: "metric_query";
        metricId: string;
        dimension: string | null;
        timeRange: { from: string | null; to: string | null };
      };
      /** LLM 原始输出（经白名单校验前的透明展示） */
      rawIntent: unknown;
      metric: MetricResult;
      providerId: string;
      tokens: { inputEstimate: number; outputEstimate: number };
    };

export async function ask(
  question: string,
  inputs: MetricInputs,
  provider: LlmProvider
): Promise<AskOutcome> {
  const degrade = (reason: string): AskOutcome => ({
    degraded: true,
    reason,
    metrics: computeAllMetrics(inputs),
    providerId: provider.id,
  });

  const trimmed = question.trim();
  if (!trimmed || trimmed.length > 200) {
    return degrade("问题为空或超过 200 字，请重新输入。");
  }

  const prompt = buildIntentPrompt(trimmed, dataWindowSummary(inputs));
  try {
    assertWithinBudget(prompt);
  } catch (e) {
    return degrade(e instanceof Error ? e.message : "prompt 超预算");
  }

  let raw: unknown;
  try {
    raw = await provider.interpretIntent(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return degrade(`意图解析失败（${msg}）。已降级到模板看板：下方为当前全部指标结果，可直接查看或重新提问。`);
  }

  const intent = validateIntent(raw);
  if (intent == null) {
    return degrade("意图解析结果不合规，已降级到模板看板：请从下方 12 个模板中直接查看，或换一种问法。");
  }
  if (intent.intent === "unknown" || intent.metricId == null) {
    return degrade(
      "这个问题超出了当前数据能回答的范围（如收入、竞品、预测、文本分析等），已降级到模板看板。可从下方模板中选择，或换一种问法。"
    );
  }

  const entry = METRIC_REGISTRY.find((e) => e.id === intent.metricId);
  if (!entry) {
    return degrade("未找到对应指标模板，已降级到模板看板。");
  }

  const filtered = filterInputsByRange(inputs, intent.timeRange.from, intent.timeRange.to);
  const metric = entry.compute(filtered);

  const outputEstimate = estimateTokens(
    JSON.stringify({ intent, resultSummary: metric.display + metric.secondary })
  );

  return {
    degraded: false,
    intent: {
      intent: "metric_query",
      metricId: intent.metricId,
      dimension: intent.dimension,
      timeRange: intent.timeRange,
    },
    rawIntent: raw,
    metric,
    providerId: provider.id,
    tokens: { inputEstimate: estimateTokens(prompt), outputEstimate },
  };
}
