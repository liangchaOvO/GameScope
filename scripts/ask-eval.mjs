/**
 * F3 真题评测脚本：把 fixtures/ask-tests.json 的 30 题逐条 POST /api/ask，
 * 统计正确率（可答题命中预期指标；陷阱题正确降级），结果写入 docs/ask-eval-results.json。
 *
 * 用法：
 *   1. npm run dev（服务运行中）
 *   2. 准备账号（默认 founder@gamescope.test / test12345，可用 ASK_EMAIL/ASK_PASSWORD 覆盖）
 *   3. 生产评测：GAMESCOPE_LLM_PROVIDER=glm 且设置 GAMESCOPE_GLM_API_KEY 后重启服务
 *      本机离线演示：GAMESCOPE_LLM_PROVIDER=mock 重启服务（评测的是管道接线与守卫）
 *   4. node scripts/ask-eval.mjs
 *
 * 评分口径（立项书 F3 验收）：≥24/30 正确为通过；陷阱题不得返回任何指标结果（编造即失败）。
 */

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.ASK_BASE_URL ?? "http://localhost:3100";
const EMAIL = process.env.ASK_EMAIL ?? "founder@gamescope.test";
const PASSWORD = process.env.ASK_PASSWORD ?? "test12345";

const cases = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "fixtures", "ask-tests.json"), "utf8")
).cases;

async function main() {
  // 登录
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error(`登录失败（${loginRes.status}）：请先在页面注册该账号或用 ASK_EMAIL/ASK_PASSWORD 指定已有账号。`);
    process.exit(1);
  }
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (!cookie) {
    console.error("登录响应中没有会话 Cookie。");
    process.exit(1);
  }

  // 确保有数据（幂等：重复载入会替换同项目数据）
  await fetch(`${BASE}/api/data/demo`, { method: "POST", headers: { cookie } });

  const results = [];
  let correct = 0;
  let providerId = null;
  for (const c of cases) {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ question: c.question }),
    });
    const json = await res.json();
    if (providerId == null && json.providerId) providerId = json.providerId;
    let ok = false;
    let detail = "";
    if (c.type === "metric") {
      const routed = !json.degraded && json.metric?.id === c.expectMetricId;
      ok = routed;
      detail = json.degraded ? `降级：${json.reason?.slice(0, 60)}` : `命中 ${json.metric?.id}`;
    } else {
      const rejected = json.degraded === true && !("metric" in json);
      ok = rejected;
      detail = json.degraded ? "正确拒绝（降级）" : "✗ 返回了指标结果（编造）";
    }
    if (ok) correct++;
    results.push({ id: c.id, type: c.type, question: c.question, ok, detail });
    console.log(`${ok ? "✓" : "✗"} ${c.id} ${c.question} → ${detail}`);
  }

  const summary = {
    evaluatedAt: new Date().toISOString(),
    providerId: providerId ?? "(未取得——全部降级？)",
    note: "providerId=mock 为关键词规则意图（离线演示/管道回归）；接 GLM 后同脚本重跑即为真题实测",
    total: cases.length,
    correct,
    passThreshold: 24,
    passed: correct >= 24,
    trapsAllRejected: results.filter((r) => r.type === "trap").every((r) => r.ok),
    results,
  };
  const out = path.join(process.cwd(), "docs", "ask-eval-results.json");
  fs.writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(`\n合计 ${correct}/${cases.length} 正确（通过线 24）；陷阱全部拒绝：${summary.trapsAllRejected}`);
  console.log(`结果已写入 ${out}`);
  if (!summary.passed) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
