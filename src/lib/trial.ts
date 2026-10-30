import fs from "node:fs";
import path from "node:path";
import type { LlmSettings } from "./llm/config";
import { listExpiredTrialProjects, sweepExpiredTrials } from "./db/store";

/**
 * M2′ 在线试用站支撑层（仅 GAMESCOPE_LOCAL_MODE=off 时启用）：
 * - IP 级限速（内存滑动窗口）；
 * - 用户 Key 仅内存存储（按项目），单次转发给 LLM，不落盘、不写日志；
 * - 匿名功能计数（次数，无内容）：sessions / uploads / asks / completed3asks，
 *   仅在线模式启用——本地模式保持零遥测（README 承诺不变）；
 * - 过期试用数据清理节流（实际清理在 store.sweepExpiredTrials）。
 */

interface CounterState {
  sessions: Set<number>;
  uploads: Set<number>;
  asks: Map<number, number>;
  completedMarked: Set<number>;
  completed: number;
}

const g = globalThis as unknown as {
  __gsRate?: Map<string, number[]>;
  __gsMemSettings?: Map<number, LlmSettings>;
  __gsCounters?: CounterState;
  __gsLastSweep?: number;
  __gsCountersPath?: string;
};

function rateMap(): Map<string, number[]> {
  g.__gsRate ??= new Map();
  return g.__gsRate;
}

/** 滑动窗口限速。超限返回 retryAfterSec。 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): { ok: boolean; retryAfterSec: number } {
  const map = rateMap();
  const arr = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
    map.set(key, arr);
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  map.set(key, arr);
  // 防膨胀：清理窗口外已空的 key
  if (map.size > 5000) {
    for (const [k, ts] of map) {
      const alive = ts.filter((t) => now - t < windowMs);
      if (alive.length === 0) map.delete(k);
      else map.set(k, alive);
    }
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// ---------------- 用户 Key：仅内存（按项目），不落盘不写日志 ----------------

function memSettings(): Map<number, LlmSettings> {
  g.__gsMemSettings ??= new Map();
  return g.__gsMemSettings;
}

export function getMemorySettings(projectId: number): LlmSettings | null {
  return memSettings().get(projectId) ?? null;
}

export function setMemorySettings(projectId: number, s: LlmSettings): void {
  memSettings().set(projectId, s);
}

export function clearMemorySettings(projectId: number): void {
  memSettings().delete(projectId);
}

// ---------------- 匿名功能计数（次数，无内容；仅在线模式） ----------------

function counters(): CounterState {
  g.__gsCounters ??= {
    sessions: new Set<number>(),
    uploads: new Set<number>(),
    asks: new Map<number, number>(),
    completedMarked: new Set<number>(),
    completed: 0,
  };
  return g.__gsCounters;
}

function countersFile(): string {
  g.__gsCountersPath ??= path.join(process.cwd(), "data", "trial-metrics.json");
  return g.__gsCountersPath;
}

function persistCounters(c: CounterState): void {
  try {
    fs.mkdirSync(path.dirname(countersFile()), { recursive: true });
    fs.writeFileSync(
      countersFile(),
      JSON.stringify(
        {
          sessions: c.sessions.size,
          uploads: c.uploads.size,
          asks: [...c.asks.values()].reduce((a, b) => a + b, 0),
          completed: c.completed,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    /* 计数持久化失败不影响主流程 */
  }
}

export function countEvent(projectId: number, event: "session" | "upload" | "ask"): void {
  const c = counters();
  if (event === "session") c.sessions.add(projectId);
  if (event === "upload") c.uploads.add(projectId);
  if (event === "ask") c.asks.set(projectId, (c.asks.get(projectId) ?? 0) + 1);
  // 成功指标口径：上传 → 问 3 问 → 看懂结论（匿名计数到会话级）
  if (c.uploads.has(projectId) && (c.asks.get(projectId) ?? 0) >= 3 && !c.completedMarked.has(projectId)) {
    c.completedMarked.add(projectId);
    c.completed += 1;
  }
  persistCounters(c);
}

/** 回收已过期项目的内存 Key 与计数状态（由 sweepIfNeeded 调用）。 */
export function purgeMemoryFor(projectIds: number[]): void {
  const mem = memSettings();
  const c = counters();
  for (const id of projectIds) {
    mem.delete(id);
    c.sessions.delete(id);
    c.uploads.delete(id);
    c.asks.delete(id);
    if (c.completedMarked.has(id)) {
      // 已完成会话被清理：从已完成集合移除，但累计完成数保留（历史事实）
      c.completedMarked.delete(id);
    }
  }
  persistCounters(c);
}

export function trialCounters(): { sessions: number; uploads: number; asks: number; completed: number } {
  const c = counters();
  return {
    sessions: c.sessions.size,
    uploads: c.uploads.size,
    asks: [...c.asks.values()].reduce((a, b) => a + b, 0),
    completed: c.completed,
  };
}

// ---------------- 清理节流 ----------------

/** 过期试用数据清理（每次至多 60s 一次；由 overview/ask 等热路径触发），并同步回收内存态。 */
export function sweepIfNeeded(force = false): number {
  const now = Date.now();
  if (!force && g.__gsLastSweep && now - g.__gsLastSweep < 60_000) return 0;
  g.__gsLastSweep = now;
  const ids = listExpiredTrialProjects();
  if (ids.length > 0) {
    purgeMemoryFor(ids);
    sweepExpiredTrials();
  }
  return ids.length;
}
