import { NextResponse } from "next/server";
import { getSession, isLocalMode, trialTtlHours } from "@/lib/auth";
import { loadMetricInputs } from "@/lib/ask/inputs";
import { ask } from "@/lib/ask/pipeline";
import { getProvider } from "@/lib/llm";
import { effectiveSettings } from "@/lib/llm/config";
import { clientIp, countEvent, getMemorySettings, rateLimit, sweepIfNeeded } from "@/lib/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASK_LIMIT_PER_HOUR = 20;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

  // 在线试用站：IP 级限速 + 过期数据清理（本地模式跳过）
  if (!isLocalMode()) {
    sweepIfNeeded();
    const rl = rateLimit(`ask:${clientIp(req)}`, ASK_LIMIT_PER_HOUR, 3600_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `请求过于频繁（IP 限速 ${ASK_LIMIT_PER_HOUR} 次/小时），请 ${rl.retryAfterSec} 秒后重试。` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }
    countEvent(session.project.id, "session");
    countEvent(session.project.id, "ask");
  }

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求不是合法的 JSON。" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question : "";
  if (!question.trim()) {
    return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
  }
  if (question.length > 200) {
    return NextResponse.json({ error: "问题请控制在 200 字以内。" }, { status: 400 });
  }

  const { inputs } = loadMetricInputs(session.project.id);
  if (!inputs.wishlist && !inputs.traffic && !inputs.sales && !inputs.regional) {
    return NextResponse.json(
      { degraded: true, reason: "还没有数据：请先上传 CSV 或载入演示数据，再使用 AI 问数。", metrics: [], providerId: null },
      { status: 200 }
    );
  }

  // Provider 配置：本地模式读本机设置文件；在线模式读内存中的会话 Key（单次转发，不落盘）
  const settings = isLocalMode()
    ? effectiveSettings({ localMode: true })
    : (getMemorySettings(session.project.id) ?? effectiveSettings({ localMode: false }));
  const outcome = await ask(question, inputs, getProvider(settings));
  return NextResponse.json(outcome);
}
