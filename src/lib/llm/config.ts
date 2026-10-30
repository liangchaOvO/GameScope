import fs from "node:fs";
import path from "node:path";

/**
 * LLM Provider 配置（阶段 T）。
 * 本地模式：持久化到 data/settings.json（已 gitignore，含 API Key 需用户自行保管）。
 * 在线模式：不读配置文件（多用户服务器），仅环境变量。
 * 优先级：配置文件 > 环境变量 > 内置默认。
 */

export type LlmProviderKind = "glm" | "openai-compat" | "mock";

export interface LlmSettings {
  /** glm = 智谱开放平台；openai-compat = 任意 OpenAI 兼容端点（DeepSeek/Kimi/Ollama…）；mock = 测试 */
  provider: LlmProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const SETTINGS_DIR = path.join(process.cwd(), "data");
export const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");

export const PROVIDER_DEFAULTS: LlmSettings = {
  provider: "glm",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  apiKey: "",
  model: "glm-4-flash",
};

const PROVIDER_KINDS: LlmProviderKind[] = ["glm", "openai-compat", "mock"];

function sanitize(raw: unknown): LlmSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const provider = PROVIDER_KINDS.includes(o.provider as LlmProviderKind)
    ? (o.provider as LlmProviderKind)
    : PROVIDER_DEFAULTS.provider;
  const baseUrl =
    typeof o.baseUrl === "string" && /^https?:\/\//.test(o.baseUrl.trim())
      ? o.baseUrl.trim()
      : PROVIDER_DEFAULTS.baseUrl;
  const model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : PROVIDER_DEFAULTS.model;
  const apiKey = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
  return { provider, baseUrl, apiKey, model };
}

export function readLlmSettings(file: string = SETTINGS_PATH): LlmSettings {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return { ...PROVIDER_DEFAULTS };
  }
}

/** 合并保存（patch.apiKey 为空字符串/缺省 = 保留原 Key）。 */
export function saveLlmSettings(
  patch: Partial<LlmSettings>,
  file: string = SETTINGS_PATH
): LlmSettings {
  const cur = readLlmSettings(file);
  const merged = sanitize({
    ...cur,
    ...patch,
    apiKey: patch.apiKey && patch.apiKey.trim() !== "" ? patch.apiKey : cur.apiKey,
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

/** 生效配置：本地模式且配置文件存在时读文件（空字段回退环境变量）；在线模式只认环境变量。 */
export function effectiveSettings(opts?: {
  localMode?: boolean;
  file?: string;
}): LlmSettings {
  const file = opts?.file ?? SETTINGS_PATH;
  const hasFile = opts?.localMode === true && fs.existsSync(file);
  const fileSettings = hasFile ? readLlmSettings(file) : null;
  return {
    provider: fileSettings?.provider ?? (asKind(process.env.GAMESCOPE_LLM_PROVIDER) ?? "glm"),
    baseUrl:
      fileSettings?.baseUrl ||
      process.env.GAMESCOPE_GLM_BASE_URL ||
      PROVIDER_DEFAULTS.baseUrl,
    apiKey:
      fileSettings?.apiKey || process.env.GAMESCOPE_GLM_API_KEY || "",
    model: fileSettings?.model || process.env.GAMESCOPE_GLM_MODEL || PROVIDER_DEFAULTS.model,
  };
}

function asKind(v: string | undefined): LlmProviderKind | null {
  return v && PROVIDER_KINDS.includes(v as LlmProviderKind) ? (v as LlmProviderKind) : null;
}

export function isConfigured(s: LlmSettings): boolean {
  return s.apiKey.trim() !== "";
}

/** 脱敏展示（永不回传完整 Key）。 */
export function maskKey(k: string): string {
  if (!k) return "";
  if (k.length <= 8) return "*".repeat(k.length);
  return `${k.slice(0, 4)}****${k.slice(-4)}`;
}
