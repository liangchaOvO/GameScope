import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadMetricInputs } from "@/lib/ask/inputs";
import { ask } from "@/lib/ask/pipeline";
import { getProvider } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

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

  const outcome = await ask(question, inputs, getProvider());
  return NextResponse.json(outcome);
}
