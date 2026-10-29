import { describe, expect, it } from "vitest";
import { parseCsv } from "../src/lib/csv/parse";
import { decodeBuffer } from "../src/lib/csv/decode";
import { tryNumber } from "../src/lib/csv/values";
import { detectCsvKind, bestCandidateKind } from "../src/lib/csv/specs";
import { resolveHeaders } from "../src/lib/csv/schema";
import { WISHLIST_SPECS } from "../src/lib/csv/specs";
import { mapWishlist, resolveWishlistHeaders } from "../src/lib/csv/wishlist";
import { mapSales, resolveSalesHeaders } from "../src/lib/csv/sales";
import { mapTraffic, resolveTrafficHeaders } from "../src/lib/csv/traffic";

describe("CSV 基础解析", () => {
  it("解析表头与数据行，行号从 2 开始", () => {
    const t = parseCsv("Date,Adds,Deletes\n2026-01-01,5,1\n2026-01-02,3,0");
    expect(t.headers).toEqual(["Date", "Adds", "Deletes"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].rowNo).toBe(2);
    expect(t.rows[1].rowNo).toBe(3);
  });

  it("跳过空行，处理引号包裹的千分位数字", () => {
    const t = parseCsv('Date,Adds\n\n2026-01-01,"1,234"\n');
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].cells[1]).toBe("1,234");
  });

  it("识别 UTF-16 LE BOM 编码", () => {
    const text = "Date,Adds\n2026-01-01,5\n";
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, "utf16le"),
    ]);
    expect(decodeBuffer(buf)).toBe(text);
  });
});

describe("数值与日期规范化", () => {
  it("千分位与空值", () => {
    expect(tryNumber("1,234")).toEqual({ ok: true, value: 1234 });
    expect(tryNumber("")).toEqual({ ok: true, value: null });
    expect(tryNumber("-")).toEqual({ ok: true, value: null });
    expect(tryNumber("12x3")).toEqual({ ok: false });
    expect(tryNumber("abc")).toEqual({ ok: false });
  });
});

describe("文件类型自动识别", () => {
  it("愿望单表头 → wishlist", () => {
    expect(detectCsvKind(["Date", "Adds", "Deletes"])).toBe("wishlist");
    expect(detectCsvKind(["Date", "Wishlist Adds", "Wishlist Deletes", "Total Wishlist"])).toBe("wishlist");
  });
  it("流量表头 → traffic", () => {
    expect(detectCsvKind(["Date", "Traffic Source", "Visits", "Units"])).toBe("traffic");
  });
  it("销售表头（含退款列）→ sales", () => {
    expect(detectCsvKind(["Date", "Units", "Refunds"])).toBe("sales");
  });
  it("无法识别 → null", () => {
    expect(detectCsvKind(["commit,message,author"])).toBeNull();
    expect(detectCsvKind(["Date"])).toBeNull();
  });
  it("缺一列时给出最接近的类型与缺失列提示", () => {
    const r = bestCandidateKind([
      "Date",
      "Wishlist Adds",
      "Wishlist Purchases",
      "Wishlist Gifts",
      "Wishlist Net",
      "Total Wishlist",
    ]);
    expect(r?.kind).toBe("wishlist");
    expect(r?.missing).toContain("删除愿望单");
    expect(bestCandidateKind(["id,name,created_at"])).toBeNull();
  });
});

describe("愿望单映射与可读报错", () => {
  it("合法数据全部入列", () => {
    const csv = "Date,Wishlist Adds,Wishlist Deletes\n2026-01-01,10,2\n2026-01-02,8,1";
    const t = parseCsv(csv);
    const res = mapWishlist(t, resolveWishlistHeaders(t.headers));
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ date: "2026-01-01", adds: 10, deletes: 2 });
    expect(res.skipped).toHaveLength(0);
  });

  it("坏数字行被跳过，报错指出列名与行号", () => {
    const csv = "Date,Wishlist Adds,Wishlist Deletes\n2026-01-01,10,2\n2026-01-02,12x,1\n2026-01-03,5,0";
    const t = parseCsv(csv);
    const res = mapWishlist(t, resolveWishlistHeaders(t.headers));
    expect(res.rows).toHaveLength(2);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].rowNo).toBe(3);
    expect(res.skipped[0].message).toContain("「新增愿望单」列的值「12x」不是合法数字");
  });

  it("坏日期行被跳过，报错指出行号与原值", () => {
    const csv = "Date,Wishlist Adds,Wishlist Deletes\n2026-01-01,10,2\n2026-13-40,5,1";
    const t = parseCsv(csv);
    const res = mapWishlist(t, resolveWishlistHeaders(t.headers));
    expect(res.skipped[0].rowNo).toBe(3);
    expect(res.skipped[0].message).toContain("2026-13-40");
  });

  it("空行不打乱物理行号", () => {
    const csv = "Date,Wishlist Adds,Wishlist Deletes\n\n2026-01-01,10,2\n2026-01-02,12x,1";
    const t = parseCsv(csv);
    const res = mapWishlist(t, resolveWishlistHeaders(t.headers));
    expect(res.rows).toHaveLength(1);
    expect(res.skipped[0].rowNo).toBe(4); // 物理行号（含空行）
  });

  it("一行多列坏值一次报全", () => {
    const csv = "Date,Wishlist Adds,Wishlist Deletes\n2026-01-01,12x,3y";
    const t = parseCsv(csv);
    const res = mapWishlist(t, resolveWishlistHeaders(t.headers));
    expect(res.rows).toHaveLength(0);
    expect(res.skipped[0].message).toContain("「新增愿望单」列的值「12x」");
    expect(res.skipped[0].message).toContain("「删除愿望单」列的值「3y」");
  });

  it("重复日期被合并并记录", () => {
    const csv = "Date,Wishlist Adds,Wishlist Deletes\n2026-01-01,10,2\n2026-01-01,7,1";
    const t = parseCsv(csv);
    const res = mapWishlist(t, resolveWishlistHeaders(t.headers));
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].adds).toBe(7); // 后出现的行优先
    expect(res.duplicateDates).toEqual(["2026-01-01"]);
  });

  it("缺少必需列时给出列级报错", () => {
    const headers = ["Date", "Adds"];
    const { missing } = resolveHeaders(headers, WISHLIST_SPECS);
    expect(missing).toContain("删除愿望单");
  });
});

describe("流量映射", () => {
  it("按 日期×来源 存储，缺来源列时归入「全部来源」", () => {
    const csv = "Date,Visits,Units\n2026-01-01,100,3";
    const t = parseCsv(csv);
    const res = mapTraffic(t, resolveTrafficHeaders(t.headers));
    expect(res.rows).toEqual([
      { date: "2026-01-01", source: "全部来源", visits: 100, units: 3 },
    ]);
  });

  it("同日多来源分别成行", () => {
    const csv = "Date,Traffic Source,Visits,Units\n2026-01-01,Search,60,2\n2026-01-01,External,40,1";
    const t = parseCsv(csv);
    const res = mapTraffic(t, resolveTrafficHeaders(t.headers));
    expect(res.rows).toHaveLength(2);
    // 聚合后按日期+来源排序（字母序）
    expect(res.rows.map((r) => r.source)).toEqual(["External", "Search"]);
  });

  it("空访问/购买单元格计数并按 0 参与计算", () => {
    const csv = "Date,Visits,Units\n2026-01-01,,3\n2026-01-02,100,";
    const t = parseCsv(csv);
    const res = mapTraffic(t, resolveTrafficHeaders(t.headers));
    expect(res.emptyNumberCells).toBe(2);
    expect(res.rows[0].visits).toBe(0);
  });
});

describe("销售映射（退款两种形态）", () => {
  it("形态 A：独立退款列", () => {
    const csv = "Date,Units,Refunds\n2026-01-01,100,5\n2026-01-02,80,2";
    const t = parseCsv(csv);
    const res = mapSales(t, resolveSalesHeaders(t.headers));
    expect(res.rows).toEqual([
      { date: "2026-01-01", grossUnits: 100, refundUnits: 5 },
      { date: "2026-01-02", grossUnits: 80, refundUnits: 2 },
    ]);
  });

  it("形态 B：交易类型列，退款行（含负数）计入退款", () => {
    const csv =
      "Date,Transaction Type,Units\n2026-01-01,Payment,100\n2026-01-01,Refund,-5\n2026-01-02,Payment,80\n2026-01-02,Refund,2";
    const t = parseCsv(csv);
    const res = mapSales(t, resolveSalesHeaders(t.headers));
    expect(res.rows).toEqual([
      { date: "2026-01-01", grossUnits: 100, refundUnits: 5 },
      { date: "2026-01-02", grossUnits: 80, refundUnits: 2 },
    ]);
  });
});
