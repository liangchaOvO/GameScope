/**
 * Steam Web API 客户端 —— 仅封装两个官方公开、无需凭据的只读端点。
 *
 * ⚠️ 合规红线：调用方必须限速（≥3 秒/请求），且只做只读拉取。
 * 不得并发轰炸、不得抓取评论正文、不得绕过 Steam 服务条款。
 */

/** 可注入的 fetch 实现（测试 / 代理场景用），签名与全局 fetch 一致。 */
export interface FetchLike {
  (url: string, init?: RequestInit): Promise<Response>;
}

/** 评论汇总快照：某 App 的总评论数、好评数与好评率描述。 */
export interface AppReviewsSnapshot {
  appId: number;
  /** 总评论数（受 language=all / purchase_type=all 过滤口径影响）。 */
  totalReviews: number;
  /** 好评总数。 */
  totalPositive: number;
  /** Steam 好评率描述（如 “褒贬不一”），语言随请求端点固定为商店默认。 */
  reviewScoreDesc: string;
  /** 抓取时间（ISO 8601，UTC）。 */
  fetchedAt: string;
}

/** 价格快照：某 App 的名称、是否免费、原价 / 现价（分为单位）与折扣。 */
export interface AppPriceSnapshot {
  appId: number;
  /** 商品名（l=schinese 时为简体中文名）。 */
  name: string;
  isFree: boolean;
  /** 币种代码（如 CNY / INR，随请求出口地区变化）；无价格数据时为 null。 */
  currency: string | null;
  /** 原价，最小货币单位（分）；免费或无价格数据时为 null。 */
  initialPrice: number | null;
  /** 现价，最小货币单位（分）；免费或无价格数据时为 null。 */
  finalPrice: number | null;
  /** 折扣百分比（0-100）；无价格数据时为 0。 */
  discountPercent: number;
  /** 发行日期（本地化字符串，如 “2023 年 8 月 3 日” / “即将推出”）；缺失时为 null。 */
  releaseDate: string | null;
  /** 抓取时间（ISO 8601，UTC）。 */
  fetchedAt: string;
}

/** 评论端点：num_per_page=0 只取 query_summary 汇总，不拉评论列表。 */
function appReviewsUrl(appId: number): string {
  return `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`;
}

/** 详情端点：l=schinese 使 name / release_date 返回简体中文。 */
function appDetailsUrl(appId: number): string {
  return `https://store.steampowered.com/api/appdetails?appids=${appId}&l=schinese`;
}

/** 兜底 fetch：绑定全局 fetch，避免运行时 this 丢失。 */
function defaultFetch(): FetchLike {
  const f = globalThis.fetch;
  if (typeof f !== "function") {
    throw new Error("Steam API: 当前运行环境无全局 fetch，请显式传入 fetchImpl");
  }
  return f.bind(globalThis);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requireRecord(v: unknown, what: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`Steam API: 响应缺少 ${what}`);
  return v;
}

function requireNumber(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`Steam API: 响应字段 ${what} 不是有效数字`);
  }
  return v;
}

function requireString(v: unknown, what: string): string {
  if (typeof v !== "string") throw new Error(`Steam API: 响应字段 ${what} 不是字符串`);
  return v;
}

/** HTTP 非 2xx 直接抛错（带状态码），不再尝试解析 body。 */
function assertHttpOk(res: Response, context: string): void {
  if (!res.ok) throw new Error(`Steam API: ${context} 请求失败，HTTP ${res.status}`);
}

/** 解析 JSON body；非 JSON（如被 CDN 回以 HTML）抛可读错误。 */
async function parseJsonResponse(res: Response, context: string): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`Steam API: ${context} 返回了非 JSON 响应（HTTP ${res.status}）`);
  }
  return payload;
}

/**
 * 拉取某 App 的评论汇总（总评论数 / 好评数 / 好评率描述）。
 *
 * 端点：GET store.steampowered.com/appreviews/{id}?json=1&language=all&purchase_type=all&num_per_page=0
 * 成功响应取 query_summary.total_reviews / total_positive / review_score_desc。
 *
 * ⚠️ 调用方必须限速 ≥3 秒/请求（Steam 服务条款合规红线）；本函数只做只读 GET。
 *
 * @param appId Steam AppID，如 570（Dota 2）
 * @param fetchImpl 可注入的 fetch 实现（测试用），缺省用全局 fetch
 * @throws Error 当 HTTP 非 2xx、响应非 JSON、success≠1 或字段缺失 / 类型不符时
 */
export async function fetchAppReviews(
  appId: number,
  fetchImpl?: FetchLike
): Promise<AppReviewsSnapshot> {
  const doFetch = fetchImpl ?? defaultFetch();
  const url = appReviewsUrl(appId);
  const context = `appreviews/${appId}`;
  const res = await doFetch(url);
  assertHttpOk(res, context);
  const payload = await parseJsonResponse(res, context);
  const root = requireRecord(payload, `${context} JSON 对象`);
  if (root.success !== 1) {
    throw new Error(`Steam API: ${context} 查询失败（success=${String(root.success)}）`);
  }
  // 官方文档：query_summary 仅在（第一次）请求时返回；num_per_page=0 也会带上。
  const summary = requireRecord(root.query_summary, "query_summary");
  const totalReviews = requireNumber(summary.total_reviews, "query_summary.total_reviews");
  const totalPositive = requireNumber(summary.total_positive, "query_summary.total_positive");
  const reviewScoreDesc = requireString(
    summary.review_score_desc,
    "query_summary.review_score_desc"
  );
  return { appId, totalReviews, totalPositive, reviewScoreDesc, fetchedAt: new Date().toISOString() };
}

/**
 * 拉取某 App 的商店详情（名称 / 是否免费 / 价格 / 折扣 / 发行日期）。
 *
 * 端点：GET store.steampowered.com/api/appdetails?appids={id}&l=schinese
 * 成功响应形如 { "{appid}": { success: true, data: { ... } } }，价格取
 * data.price_overview.initial / final / discount_percent（单位：分）。
 *
 * ⚠️ 调用方必须限速 ≥3 秒/请求（Steam 服务条款合规红线）；本函数只做只读 GET。
 *
 * @param appId Steam AppID，如 1086940（Baldur's Gate 3）
 * @param fetchImpl 可注入的 fetch 实现（测试用），缺省用全局 fetch
 * @throws Error 当 HTTP 非 2xx、响应非 JSON、success≠true 或字段缺失 / 类型不符时
 */
export async function fetchAppDetails(
  appId: number,
  fetchImpl?: FetchLike
): Promise<AppPriceSnapshot> {
  const doFetch = fetchImpl ?? defaultFetch();
  const url = appDetailsUrl(appId);
  const context = `appdetails appids=${appId}`;
  const res = await doFetch(url);
  assertHttpOk(res, context);
  const payload = await parseJsonResponse(res, context);
  const root = requireRecord(payload, `${context} JSON 对象`);
  // 响应以 appid 字符串为键；键缺失视为 appid 无效或被过滤。
  const entry = root[String(appId)];
  if (entry === undefined) {
    throw new Error(`Steam API: ${context} 响应缺少键 "${appId}"（appid 可能不存在）`);
  }
  const entryRec = requireRecord(entry, `appdetails["${appId}"]`);
  if (entryRec.success !== true) {
    throw new Error(
      `Steam API: ${context} 查询失败（success=${String(entryRec.success)}，appid 可能不存在或地区受限）`
    );
  }
  const data = requireRecord(entryRec.data, `appdetails["${appId}"].data`);
  const name = requireString(data.name, "data.name");
  const isFree = data.is_free === true;
  const releaseRaw = isRecord(data.release_date) ? data.release_date.date : undefined;
  const releaseDate =
    typeof releaseRaw === "string" && releaseRaw.length > 0 ? releaseRaw : null;
  const fetchedAt = new Date().toISOString();

  // 免费游戏没有 price_overview；价格字段按 null / 0 归零处理。
  if (isFree || data.price_overview === undefined || data.price_overview === null) {
    return {
      appId,
      name,
      isFree,
      currency: null,
      initialPrice: null,
      finalPrice: null,
      discountPercent: 0,
      releaseDate,
      fetchedAt,
    };
  }
  const price = requireRecord(data.price_overview, "data.price_overview");
  const currency = requireString(price.currency, "price_overview.currency");
  const initialPrice = requireNumber(price.initial, "price_overview.initial");
  const finalPrice = requireNumber(price.final, "price_overview.final");
  const discountPercent = requireNumber(price.discount_percent, "price_overview.discount_percent");
  return {
    appId,
    name,
    isFree,
    currency,
    initialPrice,
    finalPrice,
    discountPercent,
    releaseDate,
    fetchedAt,
  };
}
