import type { SalesDayRow } from "../types";
import { isoWeekStart, minMaxDates, weekLabel } from "../dates";
import { fmtInt } from "../format";
import { safeDiv, sum } from "./util";
import type { MetricResult, MetricSource, RefundWeekPoint } from "./types";

/**
 * 模板 7：退款率（发售期 · 首周表现）
 * <10% 正常；10–15% 关注；>15% 警示（常与性能问题/预期不符相关）。
 * 均为独立游戏发行社区经验值，非 Valve 官方标准。
 *
 * 口径：退款率 = Σ退款数 ÷ Σ毛购买数（未扣退款）。
 * 退款按发生日计入所在周，与购买存在时间错位，属近似口径。
 */

const WARN_LINE = 10;
const ALERT_LINE = 15;

export function computeRefundRate(
  rows: SalesDayRow[],
  source: MetricSource | null
): MetricResult {
  const base = {
    id: "refund-rate" as const,
    name: "退款率",
    subtitle: "退款占毛销量的比例",
    caliber: {
      definition: "期内退款占毛购买量的比例。",
      formula: "退款率 = Σ退款数 ÷ Σ毛购买数（未扣退款）",
      fields: ["退款数", "毛销量"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "买单里有多少人退款了。",
      why: "退款÷毛销量（未扣退款），口径更保守。",
      range: "<10% 正常，>15% 警示（经验值，非官方标准）。",
      next: "问「退款集中在首日吗」「差评关键词是什么」。",
    },
    chartData: { kind: "refund" as const, points: [] },
    warnings: [] as MetricSource["warnings"],
  };

  if (!source || rows.length === 0) {
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: `<${WARN_LINE}% 正常；>${ALERT_LINE}% 警示（独立游戏发行社区经验值，非官方标准）。`,
    };
  }

  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const { min, max } = minMaxDates(sorted.map((r) => r.date));

  const firstSaleIdx = sorted.findIndex((r) => r.grossUnits > 0);
  if (firstSaleIdx === -1) {
    return {
      ...base,
      status: "insufficient",
      statusLabel: "暂无销售数据",
      display: "—",
      rangeNote: `<${WARN_LINE}% 正常；>${ALERT_LINE}% 警示（独立游戏发行社区经验值，非官方标准）。`,
      caliber: {
        ...base.caliber,
        rowCount: sorted.length,
        dateRange: min && max ? { from: min, to: max } : null,
        sourceFiles: [source.filename],
      },
    };
  }

  const window = sorted.slice(firstSaleIdx);
  const gross = sum(window.map((r) => r.grossUnits));
  const refunds = sum(window.map((r) => r.refundUnits));
  const rate = safeDiv(refunds, gross);
  const ratePct = rate == null ? null : rate * 100;

  // weekly series over the purchase-open window
  const weekMap = new Map<string, { gross: number; refunds: number }>();
  const weekOrder: string[] = [];
  for (const r of window) {
    const wk = isoWeekStart(r.date);
    let w = weekMap.get(wk);
    if (!w) {
      w = { gross: 0, refunds: 0 };
      weekMap.set(wk, w);
      weekOrder.push(wk);
    }
    w.gross += r.grossUnits;
    w.refunds += r.refundUnits;
  }
  const points: RefundWeekPoint[] = weekOrder.map((wk) => {
    const w = weekMap.get(wk)!;
    const pct = safeDiv(w.refunds, w.gross);
    return { label: weekLabel(wk), pct: pct == null ? null : pct * 100 };
  });

  let status: MetricResult["status"] = "info";
  let statusLabel = "—";
  if (ratePct == null) {
    status = "insufficient";
    statusLabel = "无法计算";
  } else if (ratePct >= ALERT_LINE) {
    status = "alert";
    statusLabel = "警示";
  } else if (ratePct >= WARN_LINE) {
    status = "warn";
    statusLabel = "关注";
  } else {
    status = "good";
    statusLabel = "正常";
  }

  return {
    id: "refund-rate",
    name: "退款率",
    subtitle: "退款占毛销量的比例",
    status,
    statusLabel,
    display: ratePct == null ? "—" : `${ratePct.toFixed(1)}%`,
    secondary: `Σ退款 ${fmtInt(refunds)} / Σ毛销量 ${fmtInt(gross)}`,
    rangeNote: `<${WARN_LINE}% 正常；>${ALERT_LINE}% 警示，常与性能问题或预期不符相关（独立游戏发行社区经验值，非官方标准）。`,
    confidenceNote:
      window.length < 14
        ? `销售窗口仅 ${window.length} 天，样本较少，仅供参考。`
        : undefined,
    caliber: {
      definition: "期内退款占毛购买量的比例。",
      formula: "退款率 = Σ退款数 ÷ Σ毛购买数（未扣退款）",
      fields: ["退款数", "毛销量"],
      rowCount: window.length,
      dateRange: { from: window[0].date, to: window[window.length - 1].date },
      windowNote:
        "购买开放期（首个销售日起）；退款按发生日计入所在周，与购买存在时间错位，属近似口径。",
      sourceFiles: [source.filename],
    },
    teaching: base.teaching,
    chartData: { kind: "refund", points },
    warnings: source.warnings,
  };
}
