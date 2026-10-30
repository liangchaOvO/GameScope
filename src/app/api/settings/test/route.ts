import { NextResponse } from "next/server";
import { getSession, isLocalMode } from "@/lib/auth";
import { effectiveSettings, isConfigured } from "@/lib/llm/config";
import { getMemorySettings } from "@/lib/trial";
import { GlmProvider } from "@/lib/llm/glm";

export const runtime = "nodejs";

/** 设置页「测试连接」：对当前生效配置发一次极小 completion。 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

  const s = isLocalMode()
    ? effectiveSettings({ localMode: true })
    : (getMemorySettings(session.project.id) ?? effectiveSettings({ localMode: false }));
  if (!isConfigured(s)) {
    return NextResponse.json({ ok: false, error: "尚未配置 API Key。" }, { status: 200 });
  }

  try {
    const provider = new GlmProvider({ apiKey: s.apiKey, baseUrl: s.baseUrl, model: s.model });
    const r = await provider.ping();
    return NextResponse.json({ ok: true, model: r.model, latencyMs: r.latencyMs });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "未知错误" },
      { status: 200 }
    );
  }
}
