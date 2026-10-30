"use client";

import { useCallback, useEffect, useState } from "react";

interface SettingsState {
  settings: {
    provider: "glm" | "openai-compat" | "mock";
    baseUrl: string;
    model: string;
    apiKeyMasked: string;
    hasApiKey: boolean;
  };
  configured: boolean;
}

const PRESETS = [
  {
    name: "智谱 GLM（含免费模型）",
    provider: "glm" as const,
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash",
  },
  {
    name: "DeepSeek",
    provider: "openai-compat" as const,
    baseUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat",
  },
  {
    name: "Moonshot Kimi",
    provider: "openai-compat" as const,
    baseUrl: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k",
  },
  {
    name: "Ollama（本机，零成本）",
    provider: "openai-compat" as const,
    baseUrl: "http://localhost:11434/v1/chat/completions",
    model: "qwen2.5:7b",
  },
];

/** 首次运行向导 / 设置页（本地模式）：BYOK Provider 配置，存本机 data/settings.json。 */
export default function SettingsPanel() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<SettingsState["settings"]["provider"]>("glm");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) return; // 在线模式 403：不展示设置面板
      const json = (await res.json()) as SettingsState;
      setState(json);
      setProvider(json.settings.provider);
      setBaseUrl(json.settings.baseUrl);
      setModel(json.settings.model);
      if (!json.configured) setOpen(true); // 首次运行向导
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!state) return null; // 在线模式不渲染

  async function save(andTest: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, model, apiKey: apiKey || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `保存失败（${res.status}）`);
      await refresh();
      setApiKey("");
      if (andTest) {
        const t = await fetch("/api/settings/test", { method: "POST" });
        const tj = await t.json();
        setMsg(
          tj.ok
            ? `✓ 连接成功：${tj.model}（${tj.latencyMs}ms）`
            : `✗ 连接失败：${tj.error ?? "未知错误"}（配置已保存，可稍后重试）`
        );
      } else {
        setMsg("✓ 已保存到本机 data/settings.json。");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`space-y-3 rounded-2xl border bg-white p-6 shadow-sm ${
        state.configured ? "border-gray-200" : "border-indigo-300"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            ⚙ LLM Provider 设置（BYOK，本地模式）
          </h2>
          <p className="text-sm text-gray-500">
            {state.configured
              ? `已配置：${state.settings.model} @ ${new URL(state.settings.baseUrl).host} · Key ${state.settings.apiKeyMasked}`
              : "首次运行：配置任意 OpenAI 兼容端点即可启用 AI 问数（可选——模板看板无需配置）。"}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          {open ? "收起" : "修改配置"}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setProvider(p.provider);
                  setBaseUrl(p.baseUrl);
                  setModel(p.model);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  baseUrl === p.baseUrl
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">端点 baseUrl</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">模型名</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">
                API Key{state.settings.apiKeyMasked && `（当前 ${state.settings.apiKeyMasked}，留空保留）`}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => save(false)}
              disabled={busy}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              保存
            </button>
            <button
              onClick={() => save(true)}
              disabled={busy}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {busy ? "处理中…" : "保存并测试连接"}
            </button>
            <span className="text-xs text-gray-400">
              Key 明文存于本机 data/settings.json（已 gitignore）；本工具不做任何上传或遥测。
            </span>
          </div>
          {msg && <p className="text-sm text-gray-700">{msg}</p>}
        </div>
      )}
    </div>
  );
}
