import { NextResponse } from "next/server";
import { getSession, isLocalMode } from "@/lib/auth";
import {
  getAppSnapshots,
  getDatasets,
  getRegionalRows,
  getSalesRows,
  getTrafficSourceRows,
  getWishlistRows,
} from "@/lib/db/store";
import { computeAllMetrics } from "@/lib/metrics";
import type { OverviewDTO } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

  const { project } = session;
  const datasets = getDatasets(project.id);
  const byKind = new Map(datasets.map((d) => [d.kind, d]));

  const metrics = computeAllMetrics({
    wishlist:
      byKind.has("wishlist")
        ? { rows: getWishlistRows(project.id), meta: byKind.get("wishlist")! }
        : null,
    traffic:
      byKind.has("traffic")
        ? { rows: getTrafficSourceRows(project.id), meta: byKind.get("traffic")! }
        : null,
    sales:
      byKind.has("sales")
        ? { rows: getSalesRows(project.id), meta: byKind.get("sales")! }
        : null,
    regional:
      byKind.has("regional")
        ? { rows: getRegionalRows(project.id), meta: byKind.get("regional")! }
        : null,
    snapshots: getAppSnapshots(project.id),
  });

  const dto: OverviewDTO & {
    user: { email: string };
    project: { id: number; name: string; appId: number | null };
    mode: "local" | "online";
  } = {
    datasets,
    metrics,
    hasData: datasets.length > 0,
    user: session.user,
    project: { id: project.id, name: project.name, appId: project.appId },
    mode: isLocalMode() ? "local" : "online",
  };
  return NextResponse.json(dto);
}
