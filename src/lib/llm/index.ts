import type { LlmProvider } from "./provider";
import { GlmProvider } from "./glm";
import { MockProvider } from "./mock";

/**
 * Provider 注册（立项书第 9 节：LLM 可切换）。
 * 主 Provider：GLM（智谱开放平台）；备用切换步骤见 docs/llm-providers.md。
 */
export function getProvider(): LlmProvider {
  const which = (process.env.GAMESCOPE_LLM_PROVIDER ?? "glm").toLowerCase();
  switch (which) {
    case "mock":
      return new MockProvider();
    case "glm":
    default:
      return new GlmProvider({
        apiKey: process.env.GAMESCOPE_GLM_API_KEY,
        model: process.env.GAMESCOPE_GLM_MODEL,
        baseUrl: process.env.GAMESCOPE_GLM_BASE_URL,
        tokenUrl: process.env.GAMESCOPE_GLM_TOKEN_URL ?? null,
      });
  }
}

export { GlmProvider, MockProvider };
export type { LlmProvider, IntentResult } from "./provider";
