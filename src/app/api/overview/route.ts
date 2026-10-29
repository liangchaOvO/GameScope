import { NextResponse } from "next/server";
import {
  getDatasets,
  getSalesRows,
  getTrafficDaily,
  getWishlistRows,
} from "@/lib/db/store";
import { computeAllMetrics } from "@/lib/metrics";
import type { OverviewDTO } from "@/lib/api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const datasets = getDatasets();
  const byKind = new Map(datasets.map((d) => [d.kind, d]));

  const wishlistRows = byKind.has("wishlist") ? getWishlistRows() : [];
  const trafficRows = byKind.has("traffic") ? getTrafficDaily() : [];
  const salesRows = byKind.has("sales") ? getSalesRows() : [];

  const metrics = computeAllMetrics({
    wishlist: byKind.has("wishlist")
      ? { rows: wishlistRows, meta: byKind.get("wishlist")! }
      : null,
    traffic: byKind.has("traffic")
      ? { rows: trafficRows, meta: byKind.get("traffic")! }
      : null,
    sales: byKind.has("sales")
      ? { rows: salesRows, meta: byKind.get("sales")! }
      : null,
  });

  const dto: OverviewDTO = {
    datasets,
    metrics,
    hasData: datasets.length > 0,
  };
  return NextResponse.json(dto);
}
