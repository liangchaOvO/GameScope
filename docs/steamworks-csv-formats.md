# Steamworks CSV 导出格式调研（M0 依据）

> 调研时间：2026-10-29 · 调研人：GameScope 执行方（M0）
> 结论分级：✅ 官方文档核实 · ⚠️ 依据开源/社区资料 · ❓ 未核实（构造，需创始人用真实导出验证）

## 1. 愿望单报告（Wishlist Reporting）✅/⚠️

- **位置（✅ 官方）**：Sales & Activation Reports Portal（partner.steampowered.com）→ 各 App 详情页 →「Wishlists」板块，含完整报告与历史。官方说明该页追踪 *additions, purchases, and deletions*。
- **日期列（✅ 官方）**：官方 Wishlist Reporting 文档明确：「In the CSV download of the wishlist data, there is a column for **DateLocal** and **MonthCohort**」，其中 DateLocal 为太平洋时间日期。每日数据为前一日快照（最新一天不包含）。
- **字段语义（✅ 官方+API 交叉）**：Valve 官方开放 API `ISteamEconomy`→`GetAppWishlistReporting`（开源项目 steam-wishlist-pulse 引用）提供 *adds, deletes, purchases, gifts* 及国家/语言细分；与我们解析器的规范字段一一对应。
- **地区细分（✅ 官方）**：愿望单的地区/国家数字在「Regional Sales Report」页。
- **完整原始列头（❓ 未核实）**：登录墙内，公开资料无法逐字确认。M0 测试数据按以下仿真列头构造（解析器对同义变体做了别名表）：
  `DateLocal, Wishlist Adds, Wishlist Deletes, Wishlist Purchases, Wishlist Gifts, Wishlist Net, Total Wishlist`

## 2. 流量与转化报告（Store & Platform Traffic Breakdown）✅/❓

- **位置（✅ 官方）**：App landing page → Marketing & Visibility →「Store & Steam Platform Traffic Breakdown」。
- **指标概念（✅ 官方）**：*Impressions*（品牌曝光）、*Visits*（商店页唯一加载次数）、*Click-Thru Rate*（曝光→访问）。官方确认报告可按 App 或按发行商聚合查看，含平台/地区维度。
- **数据起始（✅ 官方）**：整体流量自 2014-09-23 起收集；地区与归属自 2018-10-17；Direct Navigation 自 2019-04-17；2021-03-23 起排除 opted-out 用户。
- **完整原始列头与购买列（❓ 未核实）**：官方文档未给出 CSV 列名。M0 测试数据按
  `Date, Traffic Source, Impressions, Visits, Units`
  构造（Units=当日购买，用于页面转化率；解析器要求 Date+Visits+Units 三列必需）。

## 3. 退款数据（Developer Refund Reporting）✅/❓

- **位置（✅ 官方）**：Sales & Activations Reports 网站 → 选中 package →「Refund Data」链接。含退款数、退款率与玩家退款理由。
- **退款率官方口径（✅ 官方，逐字）**：*"The refund rate is simply the number of units returned in a given period divided by the number of units purchased in that period."* —— GameScope 模板 7（退款率 = Σ退款 ÷ Σ毛购买）与 Valve 官方定义一致。
- **波动性提示（✅ 官方）**：官方明确周视图在发售初期与折扣后波动很大（折扣后常出现退款率抬升）——与我们的「按周展示 + 时间错位近似口径」提示一致。
- **完整原始列头（❓ 未核实）**：M0 测试数据按 `Date, Units, Refunds` 构造；解析器同时支持「Transaction Type 列（Refund 行）」形态。

## 4. 格式细节

- **编码（⚠️ 社区经验）**：Steamworks 部分导出为 UTF-16（带 BOM），其余为 UTF-8。解析器自动嗅探 BOM（UTF-8 / UTF-16LE / UTF-16BE）。
- **千分位/引号（⚠️ 社区经验）**：数字可能带千分位逗号并被引号包裹（如 `"1,234"`），解析器统一剥离后按数字校验。
- **日期格式（✅ 官方为 DateLocal 概念，格式 ❓）**：解析器接受 `YYYY-MM-DD`、`YYYY/M/D`、`M/D/YYYY`。
- **数据粒度（✅ 官方）**：愿望单为逐日序列（T+1 更新）。

## 5. 对 M0 的约束与验证方式

1. 解析器以「语义字段 + 别名表」实现，真实导出的列名变体只需增补别名，无需改映射逻辑。
2. M0 验收按立项书允许的「按 Steamworks 导出格式构造的测试 CSV」执行；**创始人用真实导出回归是 M1 首个任务**。
3. 退款率健康区间（<10% 正常 / >15% 警示）为社区经验值（非官方）；官方仅定义了口径本身。

## 来源

- Wishlist Reporting — Steamworks Documentation: https://partner.steamgames.com/doc/marketing/wishlist/reporting （2026-10-29 读取）
- Store and Platform Traffic Reporting — Steamworks Documentation: https://partner.steamgames.com/doc/marketing/traffic_reporting （2026-10-29 读取）
- Developer Refund Reporting — Steamworks Documentation: https://partner.steamgames.com/doc/finance/refunds （2026-10-29 读取）
- hortopan/steam-wishlist-pulse（GetAppWishlistReporting 字段: adds/deletes/purchases/gifts + country/language）: https://github.com/hortopan/steam-wishlist-pulse （2026-10-29 读取）
