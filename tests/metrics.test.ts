import { describe, expect, it } from "vitest";
import { computeWishlistAccumulation } from "../src/lib/metrics/wishlistAccumulation";
import { computePageConversion } from "../src/lib/metrics/pageConversion";
import { computeRefundRate } from "../src/lib/metrics/refundRate";
import type { SalesDayRow, TrafficDayRow, WishDayRow } from "../src/lib/types";

const SRC = { filename: "test.csv", warnings: [] };

function makeDates(start: string, n: number): string[] {
  const out: string[] = [];
  const t = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    out.push(new Date(t + i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

function wishRow(date: string, partial: Partial<WishDayRow> = {}): WishDayRow {
  return {
    date,
    adds: 10,
    deletes: 1,
    purchases: 0,
    gifts: 0,
    net: null,
    total: null,
    ...partial,
  };
}

describe("模板 1：愿望单积累速率（手工计算基准）", () => {
  it("两周稳定净增：周净增 = (10-1)*7 = 63", () => {
    const dates = makeDates("2026-03-02", 14); // 两个完整 ISO 周
    let total = 100;
    const rows = dates.map((d) => {
      total += 9;
      return wishRow(d, { total });
    });
    const m = computeWishlistAccumulation(rows, SRC);
    expect(m.status).toBe("info");
    expect(m.display).toBe("+63 / 周");
    const weeks = m.chartData.kind === "weekly-net" ? m.chartData.weeks : [];
    expect(weeks).toHaveLength(2);
    expect(weeks[0].net).toBe(63);
    expect(weeks[0].pulse).toBe(false);
    expect(weeks[1].net).toBe(63);
  });

  it("脉冲检测：基线 10/天，某日 200 → 脉冲周", () => {
    const dates = makeDates("2026-03-02", 42); // 6 个完整周
    const rows = dates.map((d, i) =>
      wishRow(d, i === dates.length - 1 ? { adds: 200 } : {})
    );
    const m = computeWishlistAccumulation(rows, SRC);
    const weeks = m.chartData.kind === "weekly-net" ? m.chartData.weeks : [];
    expect(weeks).toHaveLength(6);
    const last = weeks[weeks.length - 1];
    expect(last.pulse).toBe(true);
    expect(last.pulseAdds).toBe(200);
    // 最后一周净增 = 6*9 + (200-1) = 253
    expect(last.net).toBe(253);
  });

  it("脉冲不误报：基线 10/天，某日 25 → 阈值 max(30, 30)=30，不算脉冲", () => {
    const dates = makeDates("2026-03-02", 42);
    const rows = dates.map((d, i) =>
      wishRow(d, i === dates.length - 1 ? { adds: 25 } : {})
    );
    const m = computeWishlistAccumulation(rows, SRC);
    const weeks = m.chartData.kind === "weekly-net" ? m.chartData.weeks : [];
    expect(weeks[weeks.length - 1].pulse).toBe(false);
  });

  it("少于 7 行 → 样本不足", () => {
    const rows = makeDates("2026-03-02", 5).map((d) => wishRow(d));
    const m = computeWishlistAccumulation(rows, SRC);
    expect(m.status).toBe("insufficient");
  });

  it("无数据源 → unavailable", () => {
    const m = computeWishlistAccumulation([], null);
    expect(m.status).toBe("unavailable");
  });
});

describe("模板 6：页面转化率（手工计算基准）", () => {
  it("购买开放期从首个购买日起：Σ购买25 / Σ访问200 = 12.5%", () => {
    const rows: TrafficDayRow[] = [
      { date: "2026-05-04", visits: 100, units: 0 },
      { date: "2026-05-05", visits: 100, units: 0 },
      { date: "2026-05-06", visits: 100, units: 10 },
      { date: "2026-05-07", visits: 100, units: 15 },
    ];
    const m = computePageConversion(rows, SRC);
    expect(m.display).toBe("12.5%");
    expect(m.status).toBe("excellent");
    expect(m.caliber.rowCount).toBe(2); // 只统计购买开放期
    expect(m.caliber.dateRange).toEqual({ from: "2026-05-06", to: "2026-05-07" });
    const pts = m.chartData.kind === "conversion" ? m.chartData.points : [];
    expect(pts.map((p) => p.pct)).toEqual([10, 15]);
  });

  it("低于 5% → 偏低（红）", () => {
    const rows: TrafficDayRow[] = [
      { date: "2026-05-04", visits: 1000, units: 40 },
    ];
    const m = computePageConversion(rows, SRC);
    expect(m.display).toBe("4.0%");
    expect(m.status).toBe("alert");
    expect(m.statusLabel).toBe("偏低");
  });

  it("5–12% 之间 → 达标（绿）", () => {
    const rows: TrafficDayRow[] = [
      { date: "2026-05-04", visits: 1000, units: 80 },
    ];
    const m = computePageConversion(rows, SRC);
    expect(m.status).toBe("good");
    expect(m.statusLabel).toBe("达标");
  });

  it("无购买数据 → 正确拒绝（insufficient），不编造 0%", () => {
    const rows: TrafficDayRow[] = [
      { date: "2026-05-04", visits: 100, units: 0 },
      { date: "2026-05-05", visits: 100, units: 0 },
    ];
    const m = computePageConversion(rows, SRC);
    expect(m.status).toBe("insufficient");
    expect(m.display).toBe("—");
    expect(m.confidenceNote).toBeTruthy();
  });
});

describe("模板 7：退款率（手工计算基准）", () => {
  it("Σ退款15 / Σ毛销量200 = 7.5% → 正常", () => {
    const rows: SalesDayRow[] = [
      { date: "2026-05-04", grossUnits: 100, refundUnits: 5 },
      { date: "2026-05-05", grossUnits: 100, refundUnits: 10 },
      { date: "2026-05-06", grossUnits: 0, refundUnits: 0 },
    ];
    const m = computeRefundRate(rows, SRC);
    expect(m.display).toBe("7.5%");
    expect(m.status).toBe("good");
    expect(m.statusLabel).toBe("正常");
    // 销售窗口从首个销售日起：05-04、05-05、05-06（含中间 0 销量日）共 3 天
    expect(m.caliber.rowCount).toBe(3);
    const pts = m.chartData.kind === "refund" ? m.chartData.points : [];
    expect(pts).toHaveLength(1); // 05-04 ~ 05-10 同一周
    expect(pts[0].pct).toBeCloseTo(7.5, 5);
  });

  it(">15% → 警示（红）", () => {
    const rows: SalesDayRow[] = [
      { date: "2026-05-04", grossUnits: 100, refundUnits: 16 },
    ];
    const m = computeRefundRate(rows, SRC);
    expect(m.status).toBe("alert");
    expect(m.statusLabel).toBe("警示");
  });

  it("10–15% → 关注（琥珀）", () => {
    const rows: SalesDayRow[] = [
      { date: "2026-05-04", grossUnits: 100, refundUnits: 12 },
    ];
    const m = computeRefundRate(rows, SRC);
    expect(m.status).toBe("warn");
    expect(m.statusLabel).toBe("关注");
  });

  it("无销售数据 → 正确拒绝（insufficient）", () => {
    const rows: SalesDayRow[] = [
      { date: "2026-05-04", grossUnits: 0, refundUnits: 0 },
    ];
    const m = computeRefundRate(rows, SRC);
    expect(m.status).toBe("insufficient");
    expect(m.display).toBe("—");
  });
});
