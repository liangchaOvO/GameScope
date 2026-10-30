import { NextResponse } from "next/server";
import { getSession, isLocalMode } from "@/lib/auth";
import {
  effectiveSettings,
  isConfigured,
  maskKey,
  saveLlmSettings,
  type LlmProviderKind,
} from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: LlmProviderKind[] = ["glm", "openai-compat", "mock"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  if (!isLocalMode()) {
    return NextResponse.json(
      { error: "设置页仅限本地模式（在线试用站使用会话级 BYOK，不落盘）。" },
      { status: 403 }
    );
  }
  const s = effectiveSettings({ localMode: true });
  return NextResponse.json({
    settings: {
      provider: s.provider,
      baseUrl: s.baseUrl,
      model: s.model,
      apiKeyMasked: maskKey(s.apiKey),
      hasApiKey: isConfigured(s),
    },
    configured: isConfigured(s),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  if (!isLocalMode()) {
    return NextResponse.json(
      { error: "设置页仅限本地模式（在线试用站使用会话级 BYOK，不落盘）。" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求不是合法的 JSON。" }, { status: 400 });
  }

  const provider = KINDS.includes(body.provider as LlmProviderKind)
    ? (body.provider as LlmProviderKind)
    : undefined;
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : undefined;
  if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
    return NextResponse.json({ error: "baseUrl 必须以 http(s):// 开头。" }, { status: 400 });
  }
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;

  const saved = saveLlmSettings({
    ...(provider ? { provider } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined && model !== "" ? { model } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
  });
  const eff = effectiveSettings({ localMode: true });

  return NextResponse.json({
    ok: true,
    settings: {
      provider: eff.provider,
      baseUrl: eff.baseUrl,
      model: eff.model,
      apiKeyMasked: maskKey(eff.apiKey),
      hasApiKey: isConfigured(eff),
    },
    configured: isConfigured(eff),
    saved: { provider: saved.provider, baseUrl: saved.baseUrl, model: saved.model },
  });
}
