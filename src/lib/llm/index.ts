import type { LlmProvider } from "./provider";
import { GlmProvider } from "./glm";
import { MockProvider } from "./mock";
import { effectiveSettings, type LlmSettings } from "./config";

/**
 * Provider 注册（立项书第 9 节：LLM 可切换；阶段 T：支持设置页 BYOK 配置）。
 * 主 Provider：GLM / 任意 OpenAI 兼容端点（同一实现，baseUrl 可换，含 Ollama 本地零成本）。
 * 备用切换步骤见 docs/llm-providers.md。
 */
export function getProvider(settings?: LlmSettings): LlmProvider {
  // 无显式 settings 时只用环境变量（服务器安全默认）；本地模式调用方应显式传入
  // effectiveSettings({ localMode: isLocalMode() })——见 /api/ask。
  const s = settings ?? effectiveSettings({ localMode: false });
  if (s.provider === "mock") return new MockProvider();
  return new GlmProvider({
    apiKey: s.apiKey || undefined,
    baseUrl: s.baseUrl,
    model: s.model,
  });
}

export { GlmProvider, MockProvider };
export type { LlmProvider, IntentResult } from "./provider";
export type { LlmSettings } from "./config";
