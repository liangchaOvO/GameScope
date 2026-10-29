import type { StoredSnapshots } from "../db/store";
import { fmtInt, fmtPct } from "../format";
import { safeDiv } from "./util";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 10：好评率分档（长线运营）
 * >95% 压倒性好评 / >80% 特别好评 / >70% 多半好评（Valve 评价档位 + 社区通行阈值）。
 */
export function computeReviewScoreTier(
  snapshots: StoredSnapshots,
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "review-score-tier" as const,
    name: "好评率分档",
    subtitle: "Steam 评价档位与好评率",
    group: "liveops" as const,
    caliber: {
      definition: "好评数 ÷ 评论总数，按 Valve 评价档位划分。",
      formula: "好评率 = 好评数 ÷ 评论总数；档位：>95% 压倒性 / >80% 特别 / >70% 多半",
      fields: ["好评数", "评论总数（Steam 评价快照）"],
      rowCount: 1,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "玩家对游戏的整体评价落在哪一档。",
      why: "好评率÷总评论数，与 Steam 商店页展示的档位同口径。",
      range: ">95% 压倒性；>80% 特别；>70% 多半（Valve 档位通行阈值）。",
      next: "问「差评都在说什么」「哪个更新能拉回好评率」。",
    },
    chartData: { kind: "bars" as const, items: [], unit: "pct" as const, horizontal: true },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || snapshots.reviews == null) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: "档位：>95% 压倒性好评 / >80% 特别好评 / >70% 多半好评。",
      confidenceNote: "还没有 Steam 评价快照：在页面顶部输入 App ID 拉取公开评论后自动计算。",
    };
  }

  const r = snapshots.reviews;
  const pct = safeDiv(r.totalPositive, r.totalReviews);
  const pctVal = pct == null ? null : pct * 100;

  let status: MetricResult["status"] = "info";
  let statusLabel = "—";
  if (pctVal == null) {
    status = "insufficient";
    statusLabel = "无法计算";
  } else if (pctVal > 95) {
    status = "excellent";
    statusLabel = "压倒性好评";
  } else if (pctVal > 80) {
    status = "good";
    statusLabel = "特别好评";
  } else if (pctVal > 70) {
    status = "warn";
    statusLabel = "多半好评";
  } else {
    status = "alert";
    statusLabel = "褒贬不一及以下";
  }

  return {
    ...base,
    status,
    statusLabel,
    display: fmtPct(pctVal),
    secondary: `${fmtInt(r.totalPositive)} 好评 / ${fmtInt(r.totalReviews)} 总评论 · Steam 档位：${r.reviewScoreDesc}`,
    rangeNote:
      "档位阈值：>95% 压倒性好评 / >80% 特别好评 / >70% 多半好评（社区通行标准，非 Valve 官方口径文档）。",
    confidenceNote:
      (snapshots.fetchedAt && Date.now() - new Date(snapshots.fetchedAt).getTime() > 7 * 86400000)
        ? `评价快照已超过 7 天（${snapshots.fetchedAt.slice(0, 10)}），建议刷新。`
        : undefined,
    caliber: {
      ...base.caliber,
      windowNote: `基于 ${snapshots.fetchedAt?.slice(0, 10) ?? "—"} 的评价快照（累计值）。`,
      sourceFiles: [source.filename],
    },
    chartData: {
      kind: "bars",
      items: [{ label: "好评率", value: pctVal ?? 0 }],
      unit: "pct",
      horizontal: true,
      maxPct: 100,
      markLines: [
        { y: 70, label: "70% 多半" },
        { y: 80, label: "80% 特别" },
        { y: 95, label: "95% 压倒性" },
      ],
    },
    warnings: source.warnings,
  };
}
