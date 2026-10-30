import { NextResponse } from "next/server";
import { getSession, isLocalMode } from "@/lib/auth";
import fs from "node:fs";
import { SETTINGS_PATH } from "@/lib/llm/config";

export const runtime = "nodejs";

/** 清空 Provider 配置（恢复内置默认与环境变量）。 */
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  if (!isLocalMode()) {
    return NextResponse.json({ error: "设置页仅限本地模式。" }, { status: 403 });
  }
  try {
    fs.rmSync(SETTINGS_PATH, { force: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "清除失败" },
      { status: 500 }
    );
  }
}
