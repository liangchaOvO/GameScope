import { describe, expect, it } from "vitest";
import { computeWishlistDeletionRate } from "../src/lib/metrics/wishlistDeletionRate";
import { computeWishlistVisitConversion } from "../src/lib/metrics/wishlistVisitConversion";
import { computeWishlistLaunchConversion } from "../src/lib/metrics/wishlistLaunchConversion";
import { computeFirstWeekShare } from "../src/lib/metrics/firstWeekShare";
import { computeDiscountPulseCoefficient } from "../src/lib/metrics/discountPulseCoefficient";
import { computeReviewSalesEstimate } from "../src/lib/metrics/reviewSalesEstimate";
import { computeReviewScoreTier } from "../src/lib/metrics/reviewScoreTier";
import { computeTrafficSourceStructure } from "../src/lib/metrics/trafficSourceStructure";
import { computeRegionalSalesStructure } from "../src/lib/metrics/regionalSalesStructure";
import { detectPulseDays } from "../src/lib/metrics/pulse";
import type { StoredSnapshots } from "../src/lib/db/store";
import type {
  RegionalRow,
  SalesDayRow,
  TrafficSourceRow,
  WishDayRow,
} from "../src/lib/types";

const SRC = { filename: "test.csv", warnings: [] };

function dates(start: string, n: number): string[] {
  const t = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(t + i * 86400000).toISOString().slice(0, 10)
  );
}

function wishRow(date: string, partial: Partial<WishDayRow> = {}): WishDayRow {
  return { date, adds: 10, deletes: 1, purchases: 0, gifts: 0, net: null, total: null, ...partial };
}

const SNAPSHOTS: StoredSnapshots = {
  reviews: { appId: 1, totalReviews: 595, totalPositive: 547, reviewScoreDesc: "特别好评" },
  price: null,
  fetchedAt: "2026-10-29T00:00:00.000Z",
};

describe("模板 2：愿望单删单率", () => {
  it("15 删单 / (15+300) = 4.8% → 健康", () => {
    const rows = dates("2026-03-02", 7).map((d) => wishRow(d, { adds: 100, deletes: 5 }));
    const m = computeWishlistDeletionRate(rows, SRC);
    expect(m.display).toBe("4.8%");
    expect(m.status).toBe("good");
    expect(m.statusLabel).toBe("健康");
  });

  it(">8% → 需关注（红）", () => {
    const rows = dates("2026-03-02", 14).map((d) => wishRow(d, { adds: 10, deletes: 2 }));
    const m = computeWishlistDeletionRate(rows, SRC);
    // 28/(28+140) = 16.7%
    expect(m.display).toBe("16.7%");
    expect(m.status).toBe("alert");
    expect(m.statusLabel).toBe("需关注");
  });

  it("无数据 → unavailable", () => {
    expect(computeWishlistDeletionRate([], null).status).toBe("unavailable");
  });
});

describe("模板 3：愿望单/页面访问转化", () => {
  it("150 新增 / 3000 访问 = 5.0% → 达标（共同覆盖期）", () => {
    const ds = dates("2026-03-02", 3);
    const wish = ds.map((d) => wishRow(d, { adds: 50 }));
    const traffic: TrafficSourceRow[] = ds.flatMap((d) => [
      { date: d, source: "Search", visits: 600, units: 0 },
      { date: d, source: "External", visits: 400, units: 0 },
    ]);
    const m = computeWishlistVisitConversion(wish, traffic, SRC, SRC);
    expect(m.display).toBe("5.0%");
    expect(m.status).toBe("good");
    expect(m.caliber.rowCount).toBe(3); // 共同覆盖期天数
    expect(m.caliber.sourceFiles).toHaveLength(2);
  });

  it("日期不重叠 → 无法计算（insufficient），不编造", () => {
    const wish = dates("2026-03-02", 3).map((d) => wishRow(d));
    const traffic: TrafficSourceRow[] = dates("2026-04-01", 3).map((d) => ({
      date: d,
      source: "Search",
      visits: 100,
      units: 0,
    }));
    const m = computeWishlistVisitConversion(wish, traffic, SRC, SRC);
    expect(m.status).toBe("insufficient");
  });

  it("缺一个数据源 → unavailable 并提示还差什么", () => {
    const m = computeWishlistVisitConversion(
      dates("2026-03-02", 3).map((d) => wishRow(d)),
      [],
      SRC,
      null
    );
    expect(m.status).toBe("unavailable");
    expect(m.confidenceNote).toContain("流量与转化报告");
  });
});

describe("模板 4：愿望单→首周销量转化", () => {
  // 发售前夜（2026-05-03）总量 1000；首周（05-04 ~ 05-10）销量 150 → 15%
  const wish: WishDayRow[] = [
    wishRow("2026-05-03", { total: 1000 }),
    wishRow("2026-05-10", { total: 1050 }),
  ];
  const sales: SalesDayRow[] = [
    ["2026-05-04", 60], ["2026-05-05", 30], ["2026-05-06", 20],
    ["2026-05-07", 15], ["2026-05-08", 10], ["2026-05-09", 10], ["2026-05-10", 5],
  ].map(([date, gross]) => ({ date: date as string, grossUnits: gross as number, refundUnits: 0 }));

  it("150 / 1000 = 15.0% → 达标（10–20%）", () => {
    const m = computeWishlistLaunchConversion(wish, sales, SRC, SRC);
    expect(m.display).toBe("15.0%");
    expect(m.status).toBe("good");
    expect(m.caliber.rowCount).toBe(8); // 7 天销量 + 1 天愿望单
  });

  it("<5% → 偏低（灌水/准备不足）", () => {
    const lowSales = sales.map((r) => ({ ...r, grossUnits: Math.round(r.grossUnits / 4) }));
    const m = computeWishlistLaunchConversion(wish, lowSales, SRC, SRC);
    // 37/1000 = 3.7%
    expect(m.status).toBe("alert");
    expect(m.statusLabel).toBe("偏低");
  });

  it("愿望单无总量列 → unavailable 并说明", () => {
    const noTotal = wish.map((r) => ({ ...r, total: null }));
    const m = computeWishlistLaunchConversion(noTotal, sales, SRC, SRC);
    expect(m.status).toBe("unavailable");
    expect(m.statusLabel).toBe("缺少总量列");
  });
});

describe("模板 5：首周销量占比", () => {
  it("首周 700 / 首月 1160 = 60.3% → 参考区间说明脉冲型", () => {
    const sales: SalesDayRow[] = dates("2026-05-04", 30).map((d, i) => ({
      date: d,
      grossUnits: i < 7 ? 100 : 20,
      refundUnits: 0,
    }));
    const m = computeFirstWeekShare(sales, SRC);
    expect(m.display).toBe("60.3%");
    expect(m.status).toBe("info");
    const bars = m.chartData.kind === "bars" ? m.chartData.items : [];
    expect(bars.map((b) => b.label)).toEqual(["首周", "第 2 周", "第 3 周", "第 4 周"]);
    expect(bars[0].value).toBe(700);
  });

  it("数据不足 30 天 → 置信度提示", () => {
    const sales: SalesDayRow[] = dates("2026-05-04", 10).map((d) => ({
      date: d,
      grossUnits: 100,
      refundUnits: 0,
    }));
    const m = computeFirstWeekShare(sales, SRC);
    expect(m.confidenceNote).toContain("不足 30 天");
  });
});

describe("模板 8：折扣愿望单脉冲系数", () => {
  it("基线 10/天，脉冲窗口 100/天×5 天 → 约 10 倍", () => {
    // 发售日 2026-05-01；42 天数据；第 20-24 天（2026-05-20 ~ 05-24）脉冲
    const ds = dates("2026-05-01", 42);
    const sales: SalesDayRow[] = ds.map((d, i) => ({
      date: d,
      grossUnits: i === 0 ? 100 : 10,
      refundUnits: 0,
    }));
    const wish = ds.map((d) => {
      const isPulse = d >= "2026-05-20" && d <= "2026-05-24";
      return wishRow(d, { adds: isPulse ? 100 : 10, deletes: 1 });
    });
    const m = computeDiscountPulseCoefficient(wish, sales, SRC, SRC);
    // 脉冲日均 100 / 平日日均 10 ≈ 10.0
    expect(m.display).toBe("10.0 倍");
    expect(m.status).toBe("info");
    expect(m.secondary).toContain("疑似脉冲窗口 1 个");
  });

  it("无发售后脉冲 → insufficient（不编造）", () => {
    const ds = dates("2026-05-01", 40);
    const sales: SalesDayRow[] = ds.map((d, i) => ({
      date: d,
      grossUnits: i === 0 ? 100 : 10,
      refundUnits: 0,
    }));
    const wish = ds.map((d) => wishRow(d, { adds: 10, deletes: 1 }));
    const m = computeDiscountPulseCoefficient(wish, sales, SRC, SRC);
    expect(m.status).toBe("insufficient");
    expect(m.display).toBe("—");
  });
});

describe("脉冲检测：基线剔除已判定脉冲日（防后续活动漏检）", () => {
  it("前有尖峰、后有活动峰：两峰均应检出", () => {
    const ds = dates("2026-05-01", 60);
    const rows = ds.map((d, i) => {
      let adds = 10;
      if (i >= 25 && i <= 27) adds = 200; // 第一峰
      if (i >= 45 && i <= 49) adds = 100; // 第二峰（28 天窗口内含第一峰）
      return wishRow(d, { adds });
    });
    const pulses = detectPulseDays(rows);
    expect(pulses.slice(25, 28)).toEqual([true, true, true]);
    expect(pulses.slice(45, 50)).toEqual([true, true, true, true, true]);
    // 非峰日不误报
    expect(pulses.slice(30, 45).some(Boolean)).toBe(false);
  });
});

describe("模板 9：评论销量估算（Boxleiter）", () => {
  it("595 评论 → 14,875 – 41,650（区间展示）", () => {
    const m = computeReviewSalesEstimate(SNAPSHOTS, SRC);
    expect(m.display).toBe("14,875 – 41,650");
    expect(m.status).toBe("info");
    expect(m.rangeNote).toContain("粗估");
  });

  it("无快照 → unavailable 并引导", () => {
    const m = computeReviewSalesEstimate({ reviews: null, price: null, fetchedAt: null }, null);
    expect(m.status).toBe("unavailable");
    expect(m.confidenceNote).toContain("App ID");
  });
});

describe("模板 10：好评率分档", () => {
  it("547/595 = 91.9% → 特别好评（绿）", () => {
    const m = computeReviewScoreTier(SNAPSHOTS, SRC);
    expect(m.display).toBe("91.9%");
    expect(m.status).toBe("good");
    expect(m.statusLabel).toBe("特别好评");
  });

  it(">95% → 压倒性好评；>70% → 多半好评；<70% → 警示", () => {
    const over95: StoredSnapshots = {
      reviews: { appId: 1, totalReviews: 100, totalPositive: 96, reviewScoreDesc: "压倒性好评" },
      price: null,
      fetchedAt: "2026-10-29T00:00:00.000Z",
    };
    expect(computeReviewScoreTier(over95, SRC).status).toBe("excellent");

    const mostly: StoredSnapshots = {
      reviews: { appId: 1, totalReviews: 100, totalPositive: 72, reviewScoreDesc: "多半好评" },
      price: null,
      fetchedAt: "2026-10-29T00:00:00.000Z",
    };
    expect(computeReviewScoreTier(mostly, SRC).status).toBe("warn");

    const mixed: StoredSnapshots = {
      reviews: { appId: 1, totalReviews: 100, totalPositive: 65, reviewScoreDesc: "褒贬不一" },
      price: null,
      fetchedAt: "2026-10-29T00:00:00.000Z",
    };
    expect(computeReviewScoreTier(mixed, SRC).status).toBe("alert");
  });
});

describe("模板 11：流量来源结构", () => {
  it("Search 400 / Storefront 300 / Wishlist 200 / External 80 → 最大来源 Search 40%", () => {
    const rows: TrafficSourceRow[] = [
      { date: "2026-05-01", source: "Search", visits: 400, units: 0 },
      { date: "2026-05-01", source: "Storefront", visits: 300, units: 0 },
      { date: "2026-05-01", source: "Wishlist", visits: 200, units: 0 },
      { date: "2026-05-01", source: "External", visits: 80, units: 0 },
    ];
    const m = computeTrafficSourceStructure(rows, SRC);
    expect(m.display).toBe("最大来源 Search 40.8%"); // 400/980
    const bars = m.chartData.kind === "bars" ? m.chartData.items : [];
    expect(bars[0].label).toBe("Search");
    // External 8% < 10% → 启发式提示（无社区出处阈值，仅披露内部规则）
    expect(m.confidenceNote).toContain("启发式提示");
  });

  it("无数据 → unavailable", () => {
    expect(computeTrafficSourceStructure([], null).status).toBe("unavailable");
  });
});

describe("模板 12：地区销售结构", () => {
  it("CN 240 / US 200 / RU 90 → 最大市场 CN 45.3%", () => {
    const rows: RegionalRow[] = [
      { date: "2026-05-01", country: "CN", units: 240, refunds: 0 },
      { date: "2026-05-01", country: "US", units: 200, refunds: 0 },
      { date: "2026-05-01", country: "RU", units: 90, refunds: 0 },
    ];
    const m = computeRegionalSalesStructure(rows, SRC);
    expect(m.display).toBe("最大市场 CN 45.3%");
    expect(m.secondary).toContain("530");
  });

  it("无地区报告 → unavailable", () => {
    const m = computeRegionalSalesStructure([], null);
    expect(m.status).toBe("unavailable");
    expect(m.confidenceNote).toContain("地区销售报告");
  });
});
