import { NextResponse } from "next/server";
import { getSession, isLocalMode, trialTtlHours } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }
  return NextResponse.json({
    user: session.user,
    project: session.project,
    mode: isLocalMode() ? "local" : "online",
    trial: isLocalMode()
      ? null
      : { ttlHours: trialTtlHours(), expiresAt: session.project.expiresAt },
  });
}
