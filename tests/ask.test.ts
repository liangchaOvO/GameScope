import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildIntentPrompt, estimateTokens, assertWithinBudget, MAX_INPUT_TOKENS } from "../src/lib/llm/prompt";
import { validateIntent } from "../src/lib/llm/validate";
import { GlmProvider, extractJson } from "../src/lib/llm/glm";
import { MockProvider } from "../src/lib/llm/mock";
import { ask } from "../src/lib/ask/pipeline";
import type { MetricInputs } from "../src/lib/metrics";
import type { WishDayRow, TrafficSourceRow, SalesDayRow, RegionalRow } from "../src/lib/types";

interface AskCase {
  id: string;
  type: "metric" | "trap";
  question: string;
  expectMetricId?: string;
  /** 措辞歧义题：任一命中均合法（如「愿望单转化率」） */
  acceptAnyOf?: string[];
  expectTimeFrom?: string;
  trapReason?: string;
}
const CASES: AskCase[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "fixtures", "ask-tests.json"), "utf8")
).cases;
expect(CASES).toHaveLength(30);
expect(CASES.filter((c) => c.type === "trap")).toHaveLength(10);

// ---------- 合成数据（60 天，足够各模板出非 unavailable 结果） ----------
function dates(start: string, n: number): string[] {
  const t = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(t + i * 86400000).toISOString().slice(0, 10));
}
const D = dates("2026-08-27", 60); // 2026-08-27 ~ 2026-10-25，含发售（第 15 天 ≈ 2026-09-10）
function buildInputs(): MetricInputs {
  let total = 5000;
  const wishlist: WishDayRow[] = D.map((d, i) => {
    const adds = i >= 15 ? 200 : 40;
    const deletes = 3;
    const purchases = i >= 15 ? 60 : 0;
    total += adds - deletes - purchases;
    return { date: d, adds, deletes, purchases, gifts: 0, net: null, total };
  });
  const traffic: TrafficSourceRow[] = D.flatMap((d, i) => [
    { date: d, source: "Search", visits: i >= 15 ? 2000 : 500, units: i >= 15 ? 150 : 0 },
    { date: d, source: "External", visits: i >= 15 ? 500 : 120, units: i >= 15 ? 40 : 0 },
  ]);
  const sales: SalesDayRow[] = D.map((d, i) => ({
    date: d,
    grossUnits: i >= 15 ? (i < 22 ? 300 : 150) : 0,
    refundUnits: i >= 15 ? 12 : 0,
  }));
  const regional: RegionalRow[] = D.flatMap((d, i) =>
    i >= 15
      ? [
          { date: d, country: "CN", units: 100, refunds: 5 },
          { date: d, country: "US", units: 90, refunds: 7 },
        ]
      : []
  );
  return {
    wishlist: { rows: wishlist, meta: { kind: "wishlist", filename: "w.csv", rowCount: wishlist.length, dateMin: D[0], dateMax: D[59], uploadedAt: "2026-10-29T00:00:00Z", warnings: [] } },
    traffic: { rows: traffic, meta: { kind: "traffic", filename: "t.csv", rowCount: traffic.length, dateMin: D[0], dateMax: D[59], uploadedAt: "2026-10-29T00:00:00Z", warnings: [] } },
    sales: { rows: sales, meta: { kind: "sales", filename: "s.csv", rowCount: sales.length, dateMin: D[0], dateMax: D[59], uploadedAt: "2026-10-29T00:00:00Z", warnings: [] } },
    regional: { rows: regional, meta: { kind: "regional", filename: "r.csv", rowCount: regional.length, dateMin: "2026-09-10", dateMax: D[59], uploadedAt: "2026-10-29T00:00:00Z", warnings: [] } },
    snapshots: {
      reviews: { appId: 1, totalReviews: 595, totalPositive: 547, reviewScoreDesc: "特别好评" },
      price: null,
      fetchedAt: "2026-10-29T00:00:00.000Z",
    },
  };
}

// ---------- prompt 预算 ----------
describe("意图 prompt 与 <5K tokens 预算", () => {
  it("完整 prompt 估算在 5K tokens 内", () => {
    const prompt = buildIntentPrompt("最近愿望单涨得怎么样？", "2026-08-27 ~ 2026-10-25；已接入：愿望单、流量与转化、销售、地区销售");
    expect(estimateTokens(prompt)).toBeLessThan(MAX_INPUT_TOKENS);
    expect(() => assertWithinBudget(prompt)).not.toThrow();
  });
});

// ---------- 意图校验（代码层守卫） ----------
describe("意图 JSON 白名单校验", () => {
  it("合法意图通过", () => {
    const v = validateIntent({
      intent: "metric_query",
      metricId: "page-conversion",
      dimension: "weekly",
      timeRange: { from: "2026-09-26", to: "2026-10-25" },
      hackerField: "rm -rf",
    });
    expect(v).toEqual({
      intent: "metric_query",
      metricId: "page-conversion",
      dimension: "weekly",
      timeRange: { from: "2026-09-26", to: "2026-10-25" },
    });
  });
  it("编造的指标 id → 整体拒绝", () => {
    expect(validateIntent({ intent: "metric_query", metricId: "revenue-usd" })).toBeNull();
  });
  it("metric_query 无指标 / unknown 带指标 → 拒绝", () => {
    expect(validateIntent({ intent: "metric_query", metricId: null })).toBeNull();
    expect(validateIntent({ intent: "unknown", metricId: "refund-rate" })).toBeNull();
  });
  it("坏日期 / from>to → 拒绝", () => {
    expect(validateIntent({ intent: "metric_query", metricId: "refund-rate", timeRange: { from: "2026-13-01", to: null } })).toBeNull();
    expect(validateIntent({ intent: "metric_query", metricId: "refund-rate", timeRange: { from: "2026-10-25", to: "2026-09-01" } })).toBeNull();
  });
  it("非对象/坏枚举 → 拒绝", () => {
    expect(validateIntent("退款率")).toBeNull();
    expect(validateIntent({ intent: "sql_query", metricId: null })).toBeNull();
  });
});

// ---------- GLM Provider（注入 fetch，不发起真实网络） ----------
describe("GLM Provider（可注入 fetch）", () => {
  it("正常路径：取 API Key → chat/completions → 提取 JSON", async () => {
    let captured: { url: string; auth: string; body: string } | null = null;
    const provider = new GlmProvider({
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        captured = {
          url: String(url),
          auth: String((init?.headers as Record<string, string>)?.Authorization),
          body: String(init?.body),
        };
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '```json\n{"intent":"metric_query","metricId":"refund-rate","dimension":null,"timeRange":{"from":null,"to":null}}\n```' } }] }),
          { status: 200 }
        );
      },
    });
    const raw = await provider.interpretIntent("退款率高不高？");
    expect(captured).toBeTruthy();
    expect(captured!.url).toContain("open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(captured!.auth).toBe("Bearer test-key");
    expect((JSON.parse(captured!.body) as { model: string }).model).toBe("glm-4-flash");
    expect(validateIntent(raw)?.metricId).toBe("refund-rate");
  });

  it("缺 API Key 且无 tokenUrl → 抛可读错误（管道将降级）", async () => {
    const provider = new GlmProvider({ fetchImpl: async () => new Response("{}", { status: 200 }) });
    await expect(provider.interpretIntent("q")).rejects.toThrow("GAMESCOPE_GLM_API_KEY");
  });

  it("HTTP 401 → 抛可读错误", async () => {
    const provider = new GlmProvider({
      apiKey: "bad",
      fetchImpl: async () => new Response('{"error":{"code":"401","message":"令牌已过期或验证不正确"}}', { status: 401 }),
    });
    await expect(provider.interpretIntent("q")).rejects.toThrow("401");
  });

  it("extractJson 容忍围栏与杂散文字", () => {
    expect(extractJson('好的，结果是 {"a":1} 请查收')).toEqual({ a: 1 });
    expect(extractJson('{"a":{"b":2}}')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("完全没有 JSON")).toThrow();
  });
});

// ---------- 30 题回归（MockProvider 走真实管道：校验/守卫/降级/计算） ----------
describe("30 题测试集回归（管道接线 + 陷阱拒答）", () => {
  const provider = new MockProvider();
  const inputs = buildInputs();

  it("20 条可答题：正确路由到预期指标并返回代码计算的 MetricResult", async () => {
    for (const c of CASES.filter((x) => x.type === "metric")) {
      const out = await ask(c.question, inputs, provider);
      if (out.degraded) {
        throw new Error(`${c.id}「${c.question}」意外降级：${out.reason}`);
      }
      expect(
        c.acceptAnyOf
          ? c.acceptAnyOf.includes(out.metric.id)
          : out.metric.id === c.expectMetricId,
        c.id,
      ).toBe(true);
      // D4：口径链路必须存在（与看板同构）
      expect(out.metric.caliber.formula.length).toBeGreaterThan(0);
      expect(out.metric.teaching.what.length).toBeGreaterThan(0);
      if (c.expectTimeFrom) {
        expect(out.intent.timeRange.from).toBe(c.expectTimeFrom);
      }
    }
  });

  it("10 条陷阱题：一律降级，不携带 LLM 派生的指标结果（不编造）", async () => {
    for (const c of CASES.filter((x) => x.type === "trap")) {
      const out = await ask(c.question, inputs, provider);
      if (!out.degraded) throw new Error(`${c.id}「${c.question}」应降级，却返回了指标结果`);
      expect(out.reason.length).toBeGreaterThan(0);
    }
  });

  it("审阅盲区变体：转化成销量路由到首周转化；未来时态问题拒答", async () => {
    const v1 = await ask("愿望单转化成销量怎么样？", inputs, provider);
    if (v1.degraded) throw new Error("应路由到 wishlist-launch-conversion");
    expect(v1.metric.id).toBe("wishlist-launch-conversion");
    const v2 = await ask("下个月的愿望单会涨吗？", inputs, provider);
    if (!v2.degraded) throw new Error("未来时态应拒答");
  });

  it("时间范围过滤生效：最近30天题的参与行数小于全量", async () => {
    const full = await ask("页面转化率多少？", inputs, provider);
    const ranged = await ask("最近30天页面转化率怎么样？", inputs, provider);
    if (full.degraded || ranged.degraded) throw new Error("不应降级");
    expect(ranged.intent.timeRange.from).toBe("2026-09-26");
    expect(ranged.metric.caliber.rowCount).toBeLessThan(full.metric.caliber.rowCount);
  });

  it("Provider 抛错 → 可读降级（无指标结果）", async () => {
    const throwing: MockProvider = new MockProvider();
    (throwing as unknown as { interpretIntent: () => Promise<unknown> }).interpretIntent = async () => {
      throw new Error("GLM: 接口返回 401");
    };
    const out = await ask("退款率高不高？", inputs, throwing);
    if (!out.degraded) throw new Error("应降级");
    expect(out.reason).toContain("401");
  });

  it("LLM 输出垃圾 → 降级（不猜）", async () => {
    const garbage: MockProvider = new MockProvider();
    (garbage as unknown as { interpretIntent: () => Promise<unknown> }).interpretIntent = async () => "我觉得答案是 42%";
    const out = await ask("退款率高不高？", inputs, garbage);
    if (!out.degraded) throw new Error("应降级");
    expect(out.reason).toContain("降级");
  });

  it("LLM 输出编造指标 → 校验层整体拒绝并降级", async () => {
    const hallucinate: MockProvider = new MockProvider();
    (hallucinate as unknown as { interpretIntent: () => Promise<unknown> }).interpretIntent = async () => ({
      intent: "metric_query",
      metricId: "revenue-in-usd",
      dimension: null,
      timeRange: { from: null, to: null },
    });
    const out = await ask("赚了多少美元？", inputs, hallucinate);
    if (!out.degraded) throw new Error("应降级");
    expect(out.reason).toContain("不合规");
  });
});
