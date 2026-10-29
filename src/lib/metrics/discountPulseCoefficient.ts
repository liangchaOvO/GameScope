import type { SalesDayRow, WishDayRow } from "../types";
import { dateDiffDays } from "../dates";
import { mean } from "./util";
import { detectPulseDays } from "./pulse";
import { findFirstSaleDate } from "./windows";
import type { MetricResult, MetricSource } from "./types";

/**
 * 模板 8：折扣愿望单脉冲系数（长线运营）
 * 折扣期愿望单增速 ÷ 平日常态值。经验 5–20 倍（社区经验值，非官方标准）。
 *
 * M1 口径说明：Steam 公开数据无法确证历史折扣日，本模板以「发售后疑似脉冲窗口」
 * 近似折扣期（脉冲日判定同模板 1，排除发售首周），属启发式口径；
 * 后续版本将支持手动标记折扣窗口以提高精度。
 */

export function computeDiscountPulseCoefficient(
  wishRows: WishDayRow[],
  salesRows: SalesDayRow[],
  wishSource: MetricSource | null,
  salesSource: MetricSource | null
): MetricResult {
  const base = {
    id: "discount-pulse-coefficient" as const,
    name: "折扣愿望单脉冲系数",
    subtitle: "折扣/活动期愿望单增速 ÷ 平日",
    group: "liveops" as const,
    caliber: {
      definition: "发售后活动/折扣窗口的愿望单日均新增，是平日的多少倍。",
      formula:
        "系数 = 脉冲窗口日均新增 ÷ 非脉冲日日均新增（脉冲日判定同模板 1；排除发售首两周长尾）",
      fields: ["新增愿望单", "销量（定发售日）"],
      rowCount: 0,
      dateRange: null,
      sourceFiles: [] as string[],
    },
    teaching: {
      what: "打折时愿望单涨速是平时的几倍。",
      why: "脉冲窗口日均÷平日日均，衡量折扣对曝光的放大效应。",
      range: "5–20 倍为常见带（经验值，非官方标准）；<5 倍常见于小型促销。",
      next: "问「下次大促的倍数会更高吗」「折扣期转化率有没有掉」。",
    },
    chartData: {
      kind: "bars" as const,
      items: [],
      unit: "int" as const,
    },
    warnings: [] as MetricSource["warnings"],
  };

  if (!wishSource || !salesSource || wishRows.length === 0) {
    const missing = [
      !wishSource || wishRows.length === 0 ? "愿望单报告" : null,
      !salesSource ? "销售报告（用于定位发售日）" : null,
    ].filter(Boolean) as string[];
    return {
      ...base,
      status: "unavailable",
      statusLabel: "缺少数据",
      display: "—",
      rangeNote: "经验 5–20 倍（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote: `还差：${missing.join("、")}。`,
    };
  }

  const launch = findFirstSaleDate(salesRows);
  if (!launch) {
    return {
      ...base,
      status: "insufficient",
      statusLabel: "暂无销售数据",
      display: "—",
      rangeNote: "经验 5–20 倍（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote: "该模板衡量发售后折扣期的脉冲，需先有销售数据定位发售日。",
    };
  }

  const sorted = [...wishRows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const pulses = detectPulseDays(sorted);
  // 排除发售首两周（launch 长尾会被误认为折扣脉冲）
  const postLaunch = sorted.filter((r) => dateDiffDays(launch, r.date) > 13);
  const postLaunchPulses = postLaunch.filter((r) => {
    const idx = sorted.indexOf(r);
    return pulses[idx];
  });

  if (postLaunchPulses.length === 0) {
    return {
      ...base,
      status: "insufficient",
      statusLabel: "未检测到脉冲",
      display: "—",
      rangeNote: "经验 5–20 倍（独立游戏发行社区经验值，非官方标准）。",
      confidenceNote:
        "发售后（排除首周）未检测到疑似折扣/活动脉冲窗口；折扣力度小或数据期短时属正常。",
    };
  }

  const pulseDates = new Set(postLaunchPulses.map((r) => r.date));
  const windowAdds = postLaunchPulses.map((r) => r.adds ?? 0);
  const normalAdds = postLaunch.filter((r) => !pulseDates.has(r.date)).map((r) => r.adds ?? 0);
  const pulseMean = mean(windowAdds);
  const normalMean = normalAdds.length > 0 ? mean(normalAdds) : null;
  const coef = pulseMean != null && normalMean != null && normalMean > 0 ? pulseMean / normalMean : null;

  // 相邻（间隔 ≤2 天）的脉冲日归并为窗口
  const pulseDayList = postLaunchPulses.map((r) => r.date).sort();
  const windows: { from: string; to: string }[] = [];
  for (const d of pulseDayList) {
    const last = windows[windows.length - 1];
    if (last && dateDiffDays(last.to, d) <= 2) {
      last.to = d;
    } else {
      windows.push({ from: d, to: d });
    }
  }

  return {
    ...base,
    status: "info",
    statusLabel: "参考（启发式）",
    display: coef == null ? "—" : `${coef.toFixed(1)} 倍`,
    secondary: `疑似脉冲窗口 ${windows.length} 个（首个 ${windows[0].from}）；脉冲日 ${pulseDayList.length} 天`,
    rangeNote:
      "经验 5–20 倍为常见带（独立游戏发行社区经验值，非官方标准）；<5 倍常见于小型促销、愿望单趋于饱和或折扣曝光不足。",
    confidenceNote:
      "启发式口径：以发售后疑似脉冲窗口近似折扣期（Steam 公开数据无法确证历史折扣日），请人工核对实际折扣日历。",
    caliber: {
      ...base.caliber,
      rowCount: postLaunch.length,
      dateRange:
        postLaunch.length > 0
          ? { from: postLaunch[0].date, to: postLaunch[postLaunch.length - 1].date }
          : null,
      windowNote: `统计发售后第 15 天起（排除发售首两周长尾）；疑似窗口：${windows
        .map((w) => (w.from === w.to ? w.from : `${w.from}~${w.to}`))
        .join("、") || "无"}。`,
      sourceFiles: [wishSource.filename, salesSource.filename],
    },
    chartData: {
      kind: "bars",
      items: postLaunch.map((r) => ({
        label: r.date.slice(5).replace("-", "/"),
        value: r.adds ?? 0,
        color: pulseDates.has(r.date) ? "#f59e0b" : undefined,
      })),
      unit: "int",
    },
    warnings: [...wishSource.warnings, ...salesSource.warnings],
  };
}
