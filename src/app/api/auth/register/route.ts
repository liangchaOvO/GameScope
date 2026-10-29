import { NextResponse } from "next/server";
import {
  getSession,
  startSession,
  hashPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { createUser, getUserByEmail, getOrCreateProject } from "@/lib/db/store";

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

  if (!validateEmail(email)) {
    return NextResponse.json({ error: "邮箱格式不正确。" }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 });

  if (getUserByEmail(email)) {
    return NextResponse.json({ error: "该邮箱已注册，请直接登录。" }, { status: 409 });
  }

  const user = createUser(email, hashPassword(password));
  getOrCreateProject(user.id); // 每账号 1 个游戏项目（D5；多项目留 v2）
  await startSession(user.id);
  return NextResponse.json({ ok: true, email: user.email });
}

// 防止 GET 缓存误用
export async function GET() {
  const session = await getSession();
  return NextResponse.json({ authenticated: session != null });
}
