import { NextResponse } from "next/server";
import { getSession, isLocalMode } from "@/lib/auth";
import fs from "node:fs";
import {
  effectiveSettings,
  isConfigured,
  maskKey,
  saveLlmSettings,
  type LlmProviderKind,
} from "@/lib/llm/config";
import { clearMemorySettings, getMemorySettings, setMemorySettings } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: LlmProviderKind[] = ["glm", "openai-compat", "mock"];

function currentState(projectId: number) {
  // 本地模式：本机 settings.json；在线模式：仅内存（不落盘不写日志）
  const s = isLocalMode()
    ? effectiveSettings({ localMode: true })
    : (getMemorySettings(projectId) ?? effectiveSettings({ localMode: false }));
  return {
    settings: {
      provider: s.provider,
      baseUrl: s.baseUrl,
      model: s.model,
      apiKeyMasked: maskKey(s.apiKey),
      hasApiKey: isConfigured(s),
    },
    configured: isConfigured(s),
    storage: isLocalMode() ? "file" : "memory",
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  return NextResponse.json(currentState(session.project.id));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

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
  const patch = {
    ...(provider ? { provider } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(model !== undefined && model !== "" ? { model } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
  };

  if (isLocalMode()) {
    saveLlmSettings(patch);
  } else {
    // 在线试用站：Key 仅存内存（随会话/进程结束消失），不落盘不写日志
    const cur = getMemorySettings(session.project.id) ?? effectiveSettings({ localMode: false });
    setMemorySettings(session.project.id, {
      ...cur,
      ...patch,
      apiKey: patch.apiKey && patch.apiKey.trim() !== "" ? patch.apiKey : cur.apiKey,
    });
  }

  return NextResponse.json({ ok: true, ...currentState(session.project.id) });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  if (isLocalMode()) {
    try {
      fs.rmSync("data/settings.json", { force: true });
    } catch {
      /* 忽略 */
    }
  } else {
    clearMemorySettings(session.project.id);
  }
  return NextResponse.json({ ok: true });
}
