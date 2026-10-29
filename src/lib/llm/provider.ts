/**
 * LLM Provider 抽象 —— 立项书第 9 节：LLM 必须封装为可切换。
 *
 * 纪律（F3 硬性约束）：
 * - LLM 只输出「意图 JSON」（指标 + 维度 + 时间范围），禁止输出任何计算结果或数值；
 * - 全部计算在代码层（指标模板）执行；
 * - 意图解析失败 → 管道降级到模板看板引导，绝不由 LLM 兜底生成数值。
 */

export interface IntentTimeRange {
  /** YYYY-MM-DD 或 null（不限定起点） */
  from: string | null;
  /** YYYY-MM-DD 或 null（不限定终点） */
  to: string | null;
}

export interface IntentResult {
  /** metric_query = 定位到指标；unknown = 无法定位（如闲聊/范围外请求） */
  intent: "metric_query" | "unknown";
  /** 12 个指标模板之一的 id；unknown 时必须为 null */
  metricId: string | null;
  /** 用户关注的维度（weekly/daily/source/country 等，仅供展示） */
  dimension: string | null;
  timeRange: IntentTimeRange;
}

export interface LlmProvider {
  /** provider id，如 'glm' | 'openai' | 'mock' */
  readonly id: string;
  /**
   * 意图理解：把自然语言问题映射为意图 JSON（受 schema 约束，由 validate.ts 二次校验）。
   * 实现方在任何失败（网络/鉴权/格式）时应抛出可读错误，由管道统一降级。
   */
  interpretIntent(question: string): Promise<unknown>;
}
