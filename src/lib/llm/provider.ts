/**
 * LLM provider seam — M1 预留接口（立项书第 9 节：LLM 必须封装为可切换）。
 *
 * M0 不接入任何 LLM。此接口为 M1 的「AI 问数」（F3）定义边界：
 * - LLM 只负责意图理解与结论文案，禁止直接算数；
 * - 输出必须受 JSON schema 约束（结构化中间表示 → 代码执行计算）；
 * - 具体实现（Claude / GPT / GLM 等）通过实现本接口接入并可随时切换。
 */
export interface LlmProvider {
  /** provider id, e.g. 'glm' | 'openai' | 'anthropic' */
  readonly id: string;
  /**
   * 意图理解：把自然语言问题映射为结构化中间表示（受 schema 约束）。
   * 计算本身由指标模板代码执行，LLM 不参与算数。
   */
  interpretIntent(question: string): Promise<unknown>;
  /**
   * 结论文案：基于代码计算出的结构化结果生成自然语言结论。
   */
  renderConclusion(computed: unknown): Promise<string>;
}
