import { describe, expect, it } from "vitest";
import { fetchAppDetails, fetchAppReviews, type FetchLike } from "../src/lib/steam/api";

// ── 罐头响应（字段路径按 2026-10-29 实测样本与 Steamworks 官方文档，纯本地字符串，不发网络请求）──

/** appreviews 成功样本：success=1，query_summary 汇总（num_per_page=0 时 reviews 为空）。 */
const REVIEWS_OK = JSON.stringify({
  success: 1,
  query_summary: {
    num_reviews: 0,
    review_score: 8,
    review_score_desc: "特别好评",
    total_positive: 120,
    total_negative: 30,
    total_reviews: 150,
  },
  reviews: [],
});

/** appreviews 失败样本：success=0。 */
const REVIEWS_FAIL = JSON.stringify({ success: 0 });

/** appdetails 付费游戏样本（仿 1086940 实测结构：price_overview 为分 / 折扣百分比）。 */
const DETAILS_PAID = JSON.stringify({
  "1086940": {
    success: true,
    data: {
      type: "game",
      name: "博德之门3",
      steam_appid: 1086940,
      is_free: false,
      price_overview: {
        currency: "CNY",
        initial: 29800,
        final: 20860,
        discount_percent: 30,
        initial_formatted: "",
        final_formatted: "¥ 208",
      },
      release_date: { coming_soon: false, date: "2023 年 8 月 3 日" },
    },
  },
});

/** appdetails 免费游戏样本（仿 570 实测结构：is_free=true，无 price_overview）。 */
const DETAILS_FREE = JSON.stringify({
  "570": {
    success: true,
    data: {
      type: "game",
      name: "Dota 2",
      steam_appid: 570,
      is_free: true,
      release_date: { coming_soon: false, date: "2013 年 7 月 9 日" },
    },
  },
});

/** appdetails 付费但未定价样本（即将推出：无 price_overview）。 */
const DETAILS_UNPRICED = JSON.stringify({
  "1234": {
    success: true,
    data: {
      type: "game",
      name: "Coming Soon Game",
      steam_appid: 1234,
      is_free: false,
      release_date: { coming_soon: true, date: "即将推出" },
    },
  },
});

/** appdetails 失败样本：appid 不存在时 success=false。 */
const DETAILS_FAIL = JSON.stringify({ "999999": { success: false } });

function assertIsoFetchedAt(s: { fetchedAt: string }): void {
  expect(Number.isNaN(Date.parse(s.fetchedAt))).toBe(false);
  expect(s.fetchedAt.endsWith("Z")).toBe(true);
}

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function makeFetch(
  body: string,
  status = 200
): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return { fetchImpl, calls };
}

describe("fetchAppReviews", () => {
  it("成功路径：映射 query_summary 字段并生成 ISO fetchedAt", async () => {
    const { fetchImpl } = makeFetch(REVIEWS_OK);
    const s = await fetchAppReviews(570, fetchImpl);
    expect(s).toEqual({
      appId: 570,
      totalReviews: 150,
      totalPositive: 120,
      reviewScoreDesc: "特别好评",
      fetchedAt: s.fetchedAt,
    });
    assertIsoFetchedAt(s);
  });

  it("请求 URL 与注入的 fetchImpl：固定查询串，init 为 undefined", async () => {
    const { fetchImpl, calls } = makeFetch(REVIEWS_OK);
    await fetchAppReviews(1086940, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://store.steampowered.com/appreviews/1086940?json=1&language=all&purchase_type=all&num_per_page=0"
    );
    expect(calls[0].init).toBeUndefined();
  });

  it("success≠1 抛可读错误", async () => {
    const { fetchImpl } = makeFetch(REVIEWS_FAIL);
    await expect(fetchAppReviews(570, fetchImpl)).rejects.toThrow(/appreviews\/570.*success=0/);
  });

  it("缺少 query_summary 抛可读错误", async () => {
    const { fetchImpl } = makeFetch(JSON.stringify({ success: 1, reviews: [] }));
    await expect(fetchAppReviews(570, fetchImpl)).rejects.toThrow(/query_summary/);
  });

  it("HTTP 503 抛错（含状态码，且优先于 JSON 解析）", async () => {
    const { fetchImpl } = makeFetch("<html>service unavailable</html>", 503);
    await expect(fetchAppReviews(570, fetchImpl)).rejects.toThrow(/HTTP 503/);
  });

  it("HTTP 200 但 body 非 JSON 抛可读错误", async () => {
    const { fetchImpl } = makeFetch("<html>not json</html>");
    await expect(fetchAppReviews(570, fetchImpl)).rejects.toThrow(/非 JSON/);
  });
});

describe("fetchAppDetails", () => {
  it("付费游戏：映射 price_overview（分 / 折扣百分比）", async () => {
    const { fetchImpl } = makeFetch(DETAILS_PAID);
    const s = await fetchAppDetails(1086940, fetchImpl);
    expect(s).toEqual({
      appId: 1086940,
      name: "博德之门3",
      isFree: false,
      currency: "CNY",
      initialPrice: 29800,
      finalPrice: 20860,
      discountPercent: 30,
      releaseDate: "2023 年 8 月 3 日",
      fetchedAt: s.fetchedAt,
    });
    assertIsoFetchedAt(s);
  });

  it("免费游戏：无 price_overview → 价格 null、折扣 0", async () => {
    const { fetchImpl } = makeFetch(DETAILS_FREE);
    const s = await fetchAppDetails(570, fetchImpl);
    expect(s).toEqual({
      appId: 570,
      name: "Dota 2",
      isFree: true,
      currency: null,
      initialPrice: null,
      finalPrice: null,
      discountPercent: 0,
      releaseDate: "2013 年 7 月 9 日",
      fetchedAt: s.fetchedAt,
    });
  });

  it("付费但未定价（即将推出）：价格 null、折扣 0", async () => {
    const { fetchImpl } = makeFetch(DETAILS_UNPRICED);
    const s = await fetchAppDetails(1234, fetchImpl);
    expect(s.isFree).toBe(false);
    expect(s.currency).toBeNull();
    expect(s.initialPrice).toBeNull();
    expect(s.finalPrice).toBeNull();
    expect(s.discountPercent).toBe(0);
    expect(s.releaseDate).toBe("即将推出");
  });

  it("success=false 抛可读错误", async () => {
    const { fetchImpl } = makeFetch(DETAILS_FAIL);
    await expect(fetchAppDetails(999999, fetchImpl)).rejects.toThrow(
      /appids=999999.*success=false/
    );
  });

  it("响应缺少请求的 appid 键抛可读错误", async () => {
    const { fetchImpl } = makeFetch(DETAILS_FAIL); // 键为 "999999"，请求 570
    await expect(fetchAppDetails(570, fetchImpl)).rejects.toThrow(/缺少键 "570"/);
  });

  it("HTTP 500 抛错（含状态码）", async () => {
    const { fetchImpl } = makeFetch("<html>server error</html>", 500);
    await expect(fetchAppDetails(570, fetchImpl)).rejects.toThrow(/HTTP 500/);
  });

  it("HTTP 200 但 body 非 JSON 抛可读错误", async () => {
    const { fetchImpl } = makeFetch("not-json-at-all");
    await expect(fetchAppDetails(570, fetchImpl)).rejects.toThrow(/非 JSON/);
  });

  it("请求 URL：appids={id}&l=schinese", async () => {
    const { fetchImpl, calls } = makeFetch(DETAILS_PAID);
    await fetchAppDetails(1086940, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://store.steampowered.com/api/appdetails?appids=1086940&l=schinese"
    );
    expect(calls[0].init).toBeUndefined();
  });
});
