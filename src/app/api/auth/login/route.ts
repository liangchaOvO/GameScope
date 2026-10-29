import { NextResponse } from "next/server";
import { startSession, verifyPassword } from "@/lib/auth";
import { getUserByEmail, getOrCreateProject } from "@/lib/db/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求不是合法的 JSON。" }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "邮箱或密码不正确。" }, { status: 401 });
  }
  getOrCreateProject(user.id);
  await startSession(user.id);
  return NextResponse.json({ ok: true, email: user.email });
}
