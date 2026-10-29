import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAppSnapshots, saveAppSnapshots, updateProject } from "@/lib/db/store";

export const runtime = "nodejs";

/**
 * F1 补全：按 App ID 拉取公开评论与价格（官方只读接口，无凭据）。
 * 合规：限速 ≥3 秒/请求（此处对同一项目两次刷新强制间隔 3s，两个接口之间间隔 3s）。
 */
const MIN_INTERVAL_MS = 3000;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

  let body: { appId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求不是合法的 JSON。" }, { status: 400 });
  }
  const appId = Number(body.appId);
  if (!Number.isInteger(appId) || appId <= 0 || appId > 9_999_999_999) {
    return NextResponse.json({ error: "App ID 必须是正整数（Steam 商店页 URL 中的数字）。" }, { status: 400 });
  }

  const last = getAppSnapshots(session.project.id);
  if (last.fetchedAt && Date.now() - new Date(last.fetchedAt).getTime() < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: "操作过于频繁：Steam 接口限速 ≥3 秒/请求，请稍后再试。" },
      { status: 429 }
    );
  }

  const { fetchAppDetails, fetchAppReviews } = await import("@/lib/steam/api");

  try {
    const reviews = await fetchAppReviews(appId);
    // 合规红线：请求间隔 ≥3 秒
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
    const price = await fetchAppDetails(appId);

    saveAppSnapshots(session.project.id, { reviews, price });
    updateProject(session.project.id, { appId });
    return NextResponse.json({ ok: true, reviews, price });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `拉取失败：${e.message}（已保留上次快照；请确认 App ID 对应的商店页是否公开）`
            : "拉取失败：未知错误。",
      },
      { status: 502 }
    );
  }
}
