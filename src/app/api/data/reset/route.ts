import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clearProjectData } from "@/lib/db/store";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  clearProjectData(session.project.id);
  return NextResponse.json({ ok: true });
}
