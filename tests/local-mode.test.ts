import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isLocalMode, ensureLocalSession } from "../src/lib/auth";
import {
  readLlmSettings,
  saveLlmSettings,
  effectiveSettings,
  maskKey,
  isConfigured,
  PROVIDER_DEFAULTS,
} from "../src/lib/llm/config";
import { getProvider, MockProvider } from "../src/lib/llm";

const ENV_KEYS = ["GAMESCOPE_LOCAL_MODE", "GAMESCOPE_LLM_PROVIDER", "GAMESCOPE_GLM_API_KEY", "GAMESCOPE_GLM_BASE_URL", "GAMESCOPE_GLM_MODEL"];

function withEnv(kv: Record<string, string | undefined>, fn: () => void): void {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(kv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gamescope-test-")), "settings.json");
}

afterEach(() => {
  // 清理本地模式测试留下的全局缓存
  (globalThis as { __gamescopeLocalUserId?: number }).__gamescopeLocalUserId = undefined;
});

describe("T2: 本地免登录模式（GAMESCOPE_LOCAL_MODE）", () => {
  it("默认开启；显式 off 才关闭", () => {
    withEnv({ GAMESCOPE_LOCAL_MODE: undefined }, () => expect(isLocalMode()).toBe(true));
    withEnv({ GAMESCOPE_LOCAL_MODE: "on" }, () => expect(isLocalMode()).toBe(true));
    withEnv({ GAMESCOPE_LOCAL_MODE: "off" }, () => expect(isLocalMode()).toBe(false));
  });

  it("本地会话懒创建且幂等（同一用户与项目）", () => {
    withEnv({ GAMESCOPE_LOCAL_MODE: "on" }, () => {
      const a = ensureLocalSession();
      const b = ensureLocalSession();
      expect(a.user.id).toBe(b.user.id);
      expect(a.project.id).toBe(b.project.id);
      expect(a.user.email).toBe("local@gamescope.local");
    });
  });
});

describe("T3: Provider 配置（本机 settings.json）", () => {
  it("无配置文件 → 内置默认", () => {
    const s = readLlmSettings(path.join(os.tmpdir(), "gamescope-missing-" + Date.now() + ".json"));
    expect(s).toEqual(PROVIDER_DEFAULTS);
  });

  it("保存/读取往返；坏字段回退默认", () => {
    const file = tmpFile();
    saveLlmSettings(
      { provider: "openai-compat", baseUrl: "https://api.example.com/chat/completions", model: "test-model", apiKey: "sk-secret-12345678" },
      file
    );
    const s = readLlmSettings(file);
    expect(s.provider).toBe("openai-compat");
    expect(s.model).toBe("test-model");
    expect(s.apiKey).toBe("sk-secret-12345678");

    // 非法 provider / 非法 baseUrl 回退默认，合法字段保留
    saveLlmSettings({ provider: "hacker" as never, baseUrl: "javascript:alert(1)" }, file);
    const s2 = readLlmSettings(file);
    expect(s2.provider).toBe("glm");
    expect(s2.baseUrl).toBe(PROVIDER_DEFAULTS.baseUrl);
    expect(s2.model).toBe("test-model");
  });

  it("patch.apiKey 留空 = 保留原 Key（不误清空）", () => {
    const file = tmpFile();
    saveLlmSettings({ apiKey: "sk-keep-me" }, file);
    saveLlmSettings({ model: "other" }, file);
    expect(readLlmSettings(file).apiKey).toBe("sk-keep-me");
  });

  it("maskKey 脱敏；isConfigured 判定", () => {
    expect(maskKey("")).toBe("");
    expect(maskKey("short")).toBe("*****");
    expect(maskKey("sk-abcd1234wxyz")).toBe("sk-a****wxyz");
    expect(isConfigured({ ...PROVIDER_DEFAULTS, apiKey: "" })).toBe(false);
    expect(isConfigured({ ...PROVIDER_DEFAULTS, apiKey: "sk-x" })).toBe(true);
  });

  it("生效优先级：本地模式配置文件 > 环境变量 > 默认；在线模式不读文件", () => {
    const file = tmpFile();
    saveLlmSettings({ apiKey: "sk-from-file", model: "file-model" }, file);
    withEnv({ GAMESCOPE_GLM_API_KEY: "sk-from-env", GAMESCOPE_GLM_MODEL: undefined }, () => {
      const local = effectiveSettings({ localMode: true, file });
      expect(local.apiKey).toBe("sk-from-file"); // 文件优先
      expect(local.model).toBe("file-model");

      const online = effectiveSettings({ localMode: false, file });
      expect(online.apiKey).toBe("sk-from-env"); // 在线模式不读文件
      expect(online.model).toBe(PROVIDER_DEFAULTS.model); // env 未设 → 默认
    });
  });

  it("getProvider：env mock 选择与 BYOK 配置注入（连接串不写死）", () => {
    withEnv({ GAMESCOPE_LLM_PROVIDER: "mock", GAMESCOPE_GLM_API_KEY: undefined }, () => {
      expect(getProvider()).toBeInstanceOf(MockProvider); // env 选择（无显式 settings）
    });
    // glm + 自定义 baseUrl/key 的注入由 tests/ask.test.ts 的 GlmProvider 用例覆盖
  });
});
