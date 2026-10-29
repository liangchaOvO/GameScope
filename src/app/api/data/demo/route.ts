import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { ingestBuffer } from "@/lib/csv";
import { saveAppSnapshots } from "@/lib/db/store";
import type { FileUploadResult } from "@/lib/api-types";

export const runtime = "nodejs";

const FIXTURES = [
  "wishlist-report.csv",
  "traffic-conversion.csv",
  "sales-report.csv",
  "regional-report.csv",
];

/** 演示用虚构评分/价格快照（《星尘旅人》不存在于 Steam，随演示数据注入并明确标注）。 */
const DEMO_SNAPSHOTS = {
  reviews: {
    appId: 3141592,
    totalReviews: 595,
    totalPositive: 547,
    reviewScoreDesc: "特别好评",
  },
  price: {
    appId: 3141592,
    name: "星尘旅人 (Stardust Drifter)",
    isFree: false,
    currency: "CNY",
    initialPrice: 7800, // 单位：分
    finalPrice: 7800,
    discountPercent: 0,
    releaseDate: "2026 年 9 月 10 日",
  },
};

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "未登录。" }, { status: 401 });

  const results: FileUploadResult[] = [];
  for (const name of FIXTURES) {
    const p = path.join(process.cwd(), "fixtures", name);
    if (!fs.existsSync(p)) {
      results.push({
        filename: name,
        ok: false,
        error: `演示数据文件缺失：${p}（在项目根目录运行 npm run fixtures 重新生成）。`,
      });
      continue;
    }
    results.push(ingestBuffer(session.project.id, name, fs.readFileSync(p)));
  }

  // 注入演示快照（明确标注为虚构数据）
  saveAppSnapshots(session.project.id, DEMO_SNAPSHOTS);

  return NextResponse.json({
    files: results,
    note: "已同时注入演示评分快照（虚构 AppID 3141592，用于「评论销量估算」「好评率分档」两个模板的演示）。",
  });
}
