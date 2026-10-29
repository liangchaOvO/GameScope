# Steam Web API 客户端（src/lib/steam/api.ts）

封装两个官方公开、无需凭据的只读端点，供 GameScope 拉取 Steam 商店评论汇总与价格快照。
实现文件：`src/lib/steam/api.ts`；测试：`tests/steamApi.test.ts`（罐头 JSON，不发起网络请求）。

## 端点说明

### 1. 评论汇总：appreviews

```
GET https://store.steampowered.com/appreviews/{appId}?json=1&language=all&purchase_type=all&num_per_page=0
```

- `json=1`：返回 JSON；`language=all`：统计所有语言的评论；`purchase_type=all`：包含 Steam 购买与非 Steam 获取的评论。
- `num_per_page=0`：不返回评论列表，只要 `query_summary` 汇总（总量口径不受分页影响）。
- 官方文档：<https://partner.steamgames.com/doc/store/getreviews>（“用户评测 - 获得列表”）。

### 2. 详情 / 价格：appdetails

```
GET https://store.steampowered.com/api/appdetails?appids={appId}&l=schinese
```

- 响应以 appid 字符串为键：`{"{appId}": {"success": true, "data": {...}}}`。
- `l=schinese`：`name`、`release_date.date` 返回简体中文。
- 价格字段 `data.price_overview` 仅在收费且有定价时出现；**免费游戏没有该键**。
- `price_overview.initial` / `final` 单位是最小货币单位（分），`discount_percent` 为整数百分比。

## 实测记录（访问日期：2026-10-29）

**实测环境说明**：本开发机对 `store.steampowered.com` 直连超时（curl.exe exit 28，HTTP 000，带浏览器 UA 同样超时），改经 fetch_content 工具读取接口 URL 完成实测。**appdetails 已实测确认；appreviews 两次请求均被回以商店首页 HTML，未能取得 JSON 样本 → 未直连实测**，其字段路径以官方 Steamworks 文档为准。

### 实测样本 1：appdetails appids=570（Dota 2，免费游戏，已实测 ✅）

```json
{"570":{"success":true,"data":{"type":"game","name":"Dota 2","steam_appid":570,
"is_free":true, "...":"…（detailed_description 等长字段略）…",
"release_date":{"coming_soon":false,"date":"2013 年 7 月 9 日"}, "...":"…"}}}
```

- 确认：免费游戏 `is_free=true` 且**响应中无 `price_overview` 键**；`release_date.date` 为本地化字符串。

### 实测样本 2：appdetails appids=1086940（Baldur's Gate 3，付费，已实测 ✅）

```json
{"1086940":{"success":true,"data":{"type":"game","name":"博德之门3","steam_appid":1086940,
"is_free":false, "...":"…",
"price_overview":{"currency":"INR","initial":299900,"final":299900,
"discount_percent":0,"initial_formatted":"","final_formatted":"₹ 2,999"},
"...":"…","metacritic":{"score":96,"...":"…"},"...":"…"}}}
```

- 确认：`price_overview` 路径与预期一致；⚠️ 实测出口地区为印度，`currency` 返回 `INR`——**币种与请求出口地区相关**，本模块原样透传、不做换算，调用方如需固定币种应通过代理出口控制。
- `l=schinese` 生效：`name` 为 “博德之门3”，`release_date.date` 为 “2023 年 8 月 3 日” 样式的中文串。

### 预期样本 3：appreviews/{id}（未直连实测 ⚠️，结构引自官方文档）

```json
{
  "success": 1,
  "query_summary": {
    "num_reviews": 0,
    "review_score": 8,
    "review_score_desc": "特别好评",
    "total_positive": 0,
    "total_negative": 0,
    "total_reviews": 0
  },
  "reviews": [],
  "cursor": "*"
}
```

- 注意：文档字段名为 **`query_summary`**（不是任务简报缩写的 `query.summary`）；官方说明 `query_summary` 在第一次请求时返回，`num_per_page=0` 亦会携带。
- 上线前建议用真实网络复测一次该端点并回填样本（命令：`curl.exe "https://store.steampowered.com/appreviews/570?json=1&language=all&purchase_type=all&num_per_page=0"`）。

## 字段映射表

### appreviews → AppReviewsSnapshot

| 快照字段 | 响应路径 | 说明 |
| --- | --- | --- |
| `appId` | 入参 | 原样回填 |
| `totalReviews` | `query_summary.total_reviews` | 符合过滤条件的评论总数 |
| `totalPositive` | `query_summary.total_positive` | 好评总数 |
| `reviewScoreDesc` | `query_summary.review_score_desc` | 好评率描述（本地化文案） |
| `fetchedAt` | 本地生成 | `new Date().toISOString()` |

### appdetails → AppPriceSnapshot

| 快照字段 | 响应路径 | 缺失时的取值 |
| --- | --- | --- |
| `appId` | 入参 | — |
| `name` | `data.name` | 缺失即抛错 |
| `isFree` | `data.is_free === true` | 视为 false |
| `currency` | `data.price_overview.currency` | null（免费 / 未定价） |
| `initialPrice` | `data.price_overview.initial` | null（免费 / 未定价） |
| `finalPrice` | `data.price_overview.final` | null（免费 / 未定价） |
| `discountPercent` | `data.price_overview.discount_percent` | 0 |
| `releaseDate` | `data.release_date.date` | null（键缺失或空串；文案含 “即将推出” 原样透传） |
| `fetchedAt` | 本地生成 | `new Date().toISOString()` |

## 错误处理

两类请求共用同一套防御式解析，错误均为带可读 message 的 `Error`：

| 触发条件 | 错误 message 形态 |
| --- | --- |
| HTTP 非 2xx | `Steam API: appreviews/570 请求失败，HTTP 503`（优先于 JSON 解析，不读 body） |
| HTTP 2xx 但 body 非 JSON（如被回以 HTML） | `Steam API: … 返回了非 JSON 响应（HTTP 200）` |
| appreviews `success≠1` | `Steam API: appreviews/570 查询失败（success=0）` |
| appdetails `success≠true` | `Steam API: appdetails appids=999999 查询失败（success=false，appid 可能不存在或地区受限）` |
| 响应缺少请求的 appid 键 | `Steam API: … 响应缺少键 "570"（appid 可能不存在）` |
| 关键字段缺失 / 类型不符 | `Steam API: 响应缺少 query_summary` / `… query_summary.total_reviews 不是有效数字` 等 |
| 运行环境无全局 fetch 且未注入 | `Steam API: 当前运行环境无全局 fetch，请显式传入 fetchImpl` |

字段级校验用 `requireRecord` / `requireNumber` / `requireString` 逐层收窄，任何一层不符合预期都抛错而非返回部分数据。

## 合规与限速（红线）

- **调用方必须限速 ≥3 秒/请求**：两个端点均为 Steam 商店公开接口，无官方 QPS 承诺，高频请求会触发限流（HTTP 429/403）并可能封禁出口 IP；本模块内部不做休眠、不做重试，节流责任在调用方（建议串行队列 + 3s 间隔起步，遇 429 指数退避）。
- **只做只读拉取**：本模块只发 GET、不带凭据、不写任何 Steam 数据；不得用于抓取评论正文、不得绕过年龄门/地区限制。
- 条款依据：[Steam 订户协议](https://store.steampowered.com/legal/)、[Steamworks Web API 概览](https://partner.steamgames.com/doc/webapi_overview)。
- `fetchedAt` 一律取本地 UTC 时间（`new Date().toISOString()`），便于上游做快照去重与审计。

## 后续备用 Provider 备忘

当 Steam 直连不稳或需要更多维度数据时，可评估以下替代/补充数据源（均需自行核对条款与限速）：

- **SteamSpy**（公开 API，无需 key）：拥有者区间、玩家人数等估算数据。<https://steamspy.com/api.php>
- **CheapShark**（公开 API）：Steam 及多家商店的价格对比与折扣数据。<https://apidocs.cheapshark.com/>
- **Steamworks 官方 Web API**（需 publisher key，仅限自家 App）：`IStoreService/GetAppList`、`IUserReviewsService` 等官方结构化接口。<https://partner.steamgames.com/doc/webapi/IUserReviewsService>
- **SteamDB / SteamCharts**：仅网页展示且条款禁止抓取，不作为程序化数据源，只做人工核对参考。
- 任务简报中提到的 Asynchronous Ads：未检索到其公开数据 API（属广告投放服务），暂不列入候选。

> 备注：若后续接入上述 Provider，建议沿用本模块的 `FetchLike` 注入模式，保持测试无网络依赖。
