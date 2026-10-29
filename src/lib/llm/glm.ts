import type { FetchLike } from "../steam/api";
import type { LlmProvider } from "./provider";
import { assertWithinBudget, buildIntentPrompt, estimateTokens } from "./prompt";
import type { MetricId } from "../metrics/types";

export const GLM_COMPLETIONS_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
export const GLM_TOKEN_URL = "http://127.0.0.1:18432/get_token";

export interface GlmOptions {
  /** 智谱开放平台 API Key（env GAMESCOPE_GLM_API_KEY）。与 tokenUrl 二选一。 */
  apiKey?: string;
  /** 模型（env GAMESCOPE_GLM_MODEL，默认 glm-4-flash）。 */
  model?: string;
  /** completions 端点（默认智谱开放平台 v4；可指向 OpenAI 兼容网关）。 */
  baseUrl?: string;
  /** 可选：从本地 token 服务取 Bearer 凭据（AutoClaw 环境默认不可用于开放平台，实测 401）。 */
  tokenUrl?: string | null;
  fetchImpl?: FetchLike;
  /** JSON 解析容错测试用 */
  now?: () => Date;
}

/**
 * 主 Provider：智谱 GLM（开放平台 v4，OpenAI 兼容 chat/completions）。
 * 只做意图理解：system prompt 约束其只输出意图 JSON，输出由 validate.ts 白名单校验。
 * 合规与成本：单次输入 <5K tokens（prompt.ts 预算守卫）；模型可经 env 切换。
 */
export class GlmProvider implements LlmProvider {
  readonly id = "glm";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly tokenUrl: string | null;
  private readonly fetchImpl: FetchLike;

  constructor(opts: GlmOptions = {}) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? process.env.GAMESCOPE_GLM_MODEL ?? "glm-4-flash";
    this.baseUrl = opts.baseUrl ?? process.env.GAMESCOPE_GLM_BASE_URL ?? GLM_COMPLETIONS_URL;
    this.tokenUrl = opts.tokenUrl ?? null;
    this.fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  }

  private async getAuthHeader(): Promise<string> {
    if (this.apiKey) return `Bearer ${this.apiKey}`;
    if (this.tokenUrl) {
      const res = await this.fetchImpl(this.tokenUrl);
      if (!res.ok) throw new Error(`GLM: 本地 token 服务返回 ${res.status}`);
      const text = (await res.text()).trim();
      if (!text) throw new Error("GLM: 本地 token 服务返回空凭据");
      return text.startsWith("Bearer ") ? text : `Bearer ${text}`;
    }
    throw new Error("GLM: 缺少 API Key——请设置环境变量 GAMESCOPE_GLM_API_KEY（获取方式见 docs/llm-providers.md）");
  }

  async interpretIntent(question: string): Promise<unknown> {
    const prompt = buildIntentPrompt(question, "以用户项目已接入数据的实际窗口为准（由管道注入校验，模型无需复述）");
    assertWithinBudget(prompt);
    const auth = await this.getAuthHeader();

    const res = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: question },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `GLM: 接口返回 ${res.status}${body ? `（${body.slice(0, 120)}）` : ""}`
      );
    }
    const json = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("GLM: 响应中没有文本内容");
    }
    return extractJson(content);
  }
}

/** 从模型输出中提取 JSON（容忍 ```json 围栏与前后杂散文字）。 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("GLM: 输出中未找到 JSON 对象");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error("GLM: 输出的 JSON 无法解析");
  }
}

export type { MetricId };
