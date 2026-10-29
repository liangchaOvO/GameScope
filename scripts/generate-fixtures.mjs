/**
 * GameScope 演示数据生成器（确定性，固定种子）
 *
 * 生成虚构独立游戏《星尘旅人》2026-02-16 ~ 2026-10-25 的全周期数据：
 *  - fixtures/wishlist-report.csv      愿望单日序列
 *  - fixtures/traffic-conversion.csv   流量与转化（日期×来源）
 *  - fixtures/sales-report.csv         销售（毛销量 + 退款）
 *  - fixtures/dirty/*                  脏数据样例（用于演示可读报错与数据质量提示）
 *
 * 数据故事：2 月起自然增长 → 6 月新品节脉冲 → 9/3 起发售前营销爬坡 →
 * 9/10 发售（流量/销量/愿望单脉冲）→ 发售后第 2 周退款率因性能问题冲高 → 修复后回落。
 *
 * 列头以 docs/steamworks-csv-formats.md 的调研结论为准（Steamworks 真实导出格式）。
 */

import fs from "node:fs";
import path from "node:path";

// ---------- deterministic random ----------
let seed = 20261025;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function noise(factor) {
  return 1 + (rnd() - 0.5) * 2 * factor;
}

// ---------- date helpers ----------
const DAY = 86400000;
function toMs(d) {
  return new Date(`${d}T00:00:00Z`).getTime();
}
function diffDays(a, b) {
  return Math.round((toMs(b) - toMs(a)) / DAY);
}
function addDays(d, n) {
  return new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
}
function eachDate(start, end) {
  const out = [];
  for (let t = toMs(start); t <= toMs(end); t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
function inRange(d, [from, to]) {
  return d >= from && d <= to;
}

// ---------- timeline ----------
const START = "2026-02-16";
const END = "2026-10-25";
const LAUNCH = "2026-09-10";
const FESTIVAL = ["2026-06-15", "2026-06-21"]; // 新品节（脉冲）
const PRELAUNCH = ["2026-09-03", "2026-09-09"]; // 发售前营销周

// ---------- Steamworks 导出列头（按 docs/steamworks-csv-formats.md 调研校准） ----------
// DateLocal 为官方文档确认的愿望单 CSV 日期列名；其余列名按官方语义
// （additions/purchases/deletions + API 字段 adds/deletes/purchases/gifts）构造。
const WISHLIST_HEADERS = [
  "DateLocal",
  "Wishlist Adds",
  "Wishlist Deletes",
  "Wishlist Purchases",
  "Wishlist Gifts",
  "Wishlist Net",
  "Total Wishlist",
];
const TRAFFIC_HEADERS = ["Date", "Traffic Source", "Visits", "Units"];
const SALES_HEADERS = ["Date", "Units", "Refunds"];

const DISCOUNT = ["2026-10-08", "2026-10-15"]; // 发售后折扣（脉冲，供模板 8）

// 地区权重（地区销售报告，模板 12）
const REGION_WEIGHTS = [
  ["CN", 0.24], ["US", 0.2], ["RU", 0.09], ["DE", 0.07], ["BR", 0.06],
  ["JP", 0.05], ["KR", 0.04], ["GB", 0.04], ["FR", 0.04], ["CA", 0.03],
  ["PL", 0.03], ["ES", 0.03], ["ROW", 0.12],
];

// ---------- simulation ----------
const wishlist = [];
const traffic = [];
const sales = [];
let total = 2400; // 初始愿望单存量

const days = eachDate(START, END);
for (const d of days) {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6;

  // ===== 销售：毛销量 + 退款 =====
  let gross = 0;
  let refundRate = 0;
  if (d === LAUNCH) {
    gross = 1250;
    refundRate = 0.035;
  } else if (d > LAUNCH) {
    const ds = diffDays(LAUNCH, d);
    if (ds <= 6) {
      gross = [1050, 850, 700, 600, 520, 470][ds - 1];
      refundRate = 0.06;
    } else if (ds <= 17) {
      // 发售后第 2-3 周：性能问题，退款冲高（跨满一个 ISO 周，演示警示线）
      gross = Math.round(340 * (1 - Math.min(ds - 7, 6) * 0.05) * (weekend ? 1.3 : 1) * noise(0.15));
      refundRate = 0.16;
    } else if (ds <= 27) {
      gross = Math.round(250 * (1 - (ds - 14) * 0.02) * (weekend ? 1.25 : 1) * noise(0.15));
      refundRate = 0.1;
    } else {
      gross = Math.round(
        Math.max(60, 210 - (ds - 28) * 2.2) * (weekend ? 1.25 : 1) * noise(0.15)
      );
      refundRate = 0.085;
    }
    if (d >= DISCOUNT[0] && d <= DISCOUNT[1]) {
      // 折扣期：销量 ×2.2，退款率 +1pp
      gross = Math.round(gross * 2.2 * noise(0.1));
      refundRate += 0.01;
    }
  }
  const refunds = Math.round(gross * refundRate * noise(0.1));
  sales.push({ date: d, gross, refunds });

  // ===== 流量：访问 + 购买（按来源拆分） =====
  let visits;
  if (d < LAUNCH) {
    if (inRange(d, FESTIVAL)) visits = Math.round(5500 * noise(0.12));
    else if (inRange(d, PRELAUNCH)) visits = Math.round(2500 * noise(0.12));
    else {
      const t = diffDays(START, d) / diffDays(START, LAUNCH);
      visits = Math.round((850 + 350 * t) * (weekend ? 1.15 : 1) * noise(0.12));
    }
  } else {
    const ds = diffDays(LAUNCH, d);
    if (ds === 0) visits = 26000;
    else if (ds <= 6) visits = [17000, 12000, 9000, 7000, 5800, 5000][ds - 1];
    else if (ds <= 13)
      visits = Math.round(4200 * (1 - (ds - 7) * 0.09) * (weekend ? 1.2 : 1) * noise(0.1));
    else
      visits = Math.round(
        Math.max(950, 2200 - (ds - 14) * 22) * (weekend ? 1.18 : 1) * noise(0.12)
      );
    if (d >= DISCOUNT[0] && d <= DISCOUNT[1]) visits = Math.round(visits * 1.8 * noise(0.08));
  }
  const eventish =
    inRange(d, FESTIVAL) || inRange(d, PRELAUNCH) || (d >= LAUNCH && diffDays(LAUNCH, d) <= 6);
  const split = eventish
    ? { Search: 0.3, Storefront: 0.24, External: 0.28, Wishlist: 0.1, Other: 0.08 }
    : { Search: 0.42, Storefront: 0.27, External: 0.13, Wishlist: 0.1, Other: 0.08 };
  const names = Object.keys(split);
  let visitsLeft = visits;
  let unitsLeft = gross;
  const perSource = [];
  names.forEach((name, i) => {
    if (i === names.length - 1) {
      perSource.push([name, visitsLeft, unitsLeft]); // 收尾行吸收取整误差
    } else {
      const v = Math.round(visits * split[name] * noise(0.08));
      const u = Math.round((gross * v) / Math.max(1, visits));
      perSource.push([name, v, u]);
      visitsLeft -= v;
      unitsLeft -= u;
    }
  });
  for (const [source, v, u] of perSource) {
    traffic.push({ date: d, source, visits: v, units: u });
  }

  // ===== 愿望单 =====
  let adds;
  if (inRange(d, FESTIVAL)) adds = Math.round(480 * noise(0.18));
  else if (inRange(d, PRELAUNCH)) adds = Math.round(160 * noise(0.15));
  else if (d === LAUNCH) adds = 880;
  else if (d > LAUNCH) {
    const ds = diffDays(LAUNCH, d);
    if (ds <= 6) adds = Math.round([520, 410, 340, 290, 260, 230][ds - 1] * noise(0.1));
    else
      adds = Math.round(
        Math.max(42, 150 - (ds - 7) * 2.0) * (weekend ? 1.1 : 1) * noise(0.15)
      );
    if (d >= DISCOUNT[0] && d <= DISCOUNT[1]) adds = Math.round(adds * 6 * noise(0.12));
  } else {
    const t = diffDays(START, d) / diffDays(START, LAUNCH);
    adds = Math.round((32 + 14 * t) * (weekend ? 1.12 : 1) * noise(0.18));
  }
  const deletes =
    d > LAUNCH
      ? Math.round(Math.max(1, adds * 0.06 + total * 0.0008))
      : Math.round(Math.max(1, adds * 0.04 + total * 0.0004));
  const purchases = Math.min(Math.round(gross * 0.34), Math.floor(total * 0.05));
  const gifts = Math.max(0, Math.round(adds * 0.008));
  const net = adds - deletes - purchases - gifts;
  total += net;
  wishlist.push({ date: d, adds, deletes, purchases, gifts, net, total });
}

// ---------- CSV 输出 ----------
function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(r.join(","));
  return lines.join("\r\n") + "\r\n";
}

const fixturesDir = path.join(process.cwd(), "fixtures");
const dirtyDir = path.join(fixturesDir, "dirty");
fs.mkdirSync(dirtyDir, { recursive: true });

fs.writeFileSync(
  path.join(fixturesDir, "wishlist-report.csv"),
  toCsv(
    WISHLIST_HEADERS,
    wishlist.map((r) => [r.date, r.adds, r.deletes, r.purchases, r.gifts, r.net, r.total])
  ),
  "utf8"
);
fs.writeFileSync(
  path.join(fixturesDir, "traffic-conversion.csv"),
  toCsv(
    TRAFFIC_HEADERS,
    traffic.map((r) => [r.date, r.source, r.visits, r.units])
  ),
  "utf8"
);
fs.writeFileSync(
  path.join(fixturesDir, "sales-report.csv"),
  toCsv(
    SALES_HEADERS,
    sales.map((r) => [r.date, r.gross, r.refunds])
  ),
  "utf8"
);

// 地区销售报告：逐日×国家，最大余额法保证与当日毛销量一致
const REGIONAL_HEADERS = ["Date", "Country", "Units", "Refunds"];
const regionalRows = [];
for (const s of sales) {
  if (s.gross <= 0 && s.refunds <= 0) continue;
  const raw = REGION_WEIGHTS.map(([c, w]) => [c, s.gross * w]);
  const floored = raw.map(([c, v]) => [c, Math.floor(v)]);
  let remainder = s.gross - floored.reduce((a, r) => a + r[1], 0);
  const order = [...raw]
    .sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])))
    .map((r) => r[0]);
  for (const c of order) {
    if (remainder <= 0) break;
    const row = floored.find((r) => r[0] === c);
    row[1] += 1;
    remainder--;
  }
  for (const [c, u] of floored) {
    regionalRows.push([s.date, c, u, Math.round(s.refunds * (u / Math.max(1, s.gross)))]);
  }
}
fs.writeFileSync(
  path.join(fixturesDir, "regional-report.csv"),
  toCsv(REGIONAL_HEADERS, regionalRows),
  "utf8"
);

// ---------- 脏数据样例 ----------
// 1) 缺少必需列
fs.writeFileSync(
  path.join(dirtyDir, "missing-column.csv"),
  ["Date,Wishlist Adds,Wishlist Purchases,Wishlist Gifts,Wishlist Net,Total Wishlist",
   "2026-08-01,40,0,0,38,6520",
   "2026-08-02,35,0,0,33,6553"].join("\r\n") + "\r\n",
  "utf8"
);

// 2) 行级错误（坏数字 + 坏日期），其余行合法
fs.writeFileSync(
  path.join(dirtyDir, "bad-rows.csv"),
  ["Date,Wishlist Adds,Wishlist Deletes,Wishlist Purchases,Wishlist Gifts,Wishlist Net,Total Wishlist",
   "2026-08-01,40,2,0,0,38,6520",
   "2026-08-02,3x5,2,0,0,33,6553",
   "2026-08-03,31,1,0,0,30,6583",
   "2026-13-40,28,1,0,0,27,6610",
   "2026-08-05,44,3,0,0,41,6651"].join("\r\n") + "\r\n",
  "utf8"
);

// 3) 不是 Steamworks 导出
fs.writeFileSync(
  path.join(dirtyDir, "not-steamworks.csv"),
  ["id,name,created_at",
   "1,fix typo,2026-08-01T10:00:00Z",
   "2,update readme,2026-08-02T09:30:00Z"].join("\r\n") + "\r\n",
  "utf8"
);

// 4) 日期缺口 + 重复日期（触发 sanity 提示，仍可导入）
{
  const rows = [];
  let t = 7000;
  const dates = ["2026-08-01", "2026-08-02", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11", "2026-08-11"];
  for (const d of dates) {
    const adds = 30 + Math.round(rnd() * 20);
    const deletes = 2;
    const net = adds - deletes;
    t += net;
    rows.push([d, adds, deletes, 0, 0, net, t]);
  }
  fs.writeFileSync(
    path.join(dirtyDir, "gap-and-duplicate.csv"),
    [WISHLIST_HEADERS.join(",")].concat(rows.map((r) => r.join(","))).join("\r\n") + "\r\n",
    "utf8"
  );
}

// 5) UTF-16 LE 编码的合法愿望单文件（Steam 部分导出为 UTF-16）
{
  const rows = [];
  let t = 7000;
  for (let i = 0; i < 10; i++) {
    const d = addDays("2026-08-01", i);
    const adds = 30 + Math.round(rnd() * 20);
    const deletes = 2;
    const net = adds - deletes;
    t += net;
    rows.push([d, adds, deletes, 0, 0, net, t]);
  }
  const csv = [WISHLIST_HEADERS.join(",")].concat(rows.map((r) => r.join(","))).join("\r\n") + "\r\n";
  fs.writeFileSync(
    path.join(dirtyDir, "utf16-wishlist.csv"),
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, "utf16le")])
  );
}

// ---------- 摘要（用于人工核对 UI 数值） ----------
const launchIdx = days.indexOf(LAUNCH);
const postVisits = traffic
  .filter((r) => r.date >= LAUNCH)
  .reduce((a, r) => a + r.visits, 0);
const postUnits = sales.filter((r) => r.date >= LAUNCH).reduce((a, r) => a + r.gross, 0);
const postRefunds = sales.filter((r) => r.date >= LAUNCH).reduce((a, r) => a + r.refunds, 0);
const week2 = sales.filter((r) => diffDays(LAUNCH, r.date) >= 7 && diffDays(LAUNCH, r.date) <= 17);
const w2gross = week2.reduce((a, r) => a + r.gross, 0);
const w2ref = week2.reduce((a, r) => a + r.refunds, 0);

console.log(`日数: ${days.length}（${START} ~ ${END}），发售日 ${LAUNCH}`);
console.log(`愿望单: 期末总量 ${total}，期间新增 Σ${wishlist.reduce((a, r) => a + r.adds, 0)}`);
console.log(`购买开放期: Σ访问 ${postVisits.toLocaleString()}，Σ毛销量 ${postUnits.toLocaleString()}，页面转化率 ${(postUnits / postVisits * 100).toFixed(1)}%`);
console.log(`退款: Σ退款 ${postRefunds.toLocaleString()} / Σ毛销量 ${postUnits.toLocaleString()} = ${(postRefunds / postUnits * 100).toFixed(1)}%`);
console.log(`性能问题期（发售第 7-17 天）退款率: ${(w2ref / w2gross * 100).toFixed(1)}%`);
const disc = sales.filter((r) => r.date >= DISCOUNT[0] && r.date <= DISCOUNT[1]);
console.log(`折扣期（${DISCOUNT[0]} ~ ${DISCOUNT[1]}）Σ销量 ${disc.reduce((a, r) => a + r.gross, 0)}`);
console.log(`地区报告: ${regionalRows.length} 行（${REGION_WEIGHTS.length} 个国家/地区）`);
console.log(`fixture 已写入 ${fixturesDir}`);
