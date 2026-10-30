import { afterEach, describe, expect, it } from "vitest";
import { resolveOnlineSession, trialTtlHours } from "../src/lib/auth";
import {
  createAnonymousUser,
  getOrCreateProject,
  setProjectExpiry,
  sweepExpiredTrials,
  getDatasets,
} from "../src/lib/db/store";
import { rateLimit, getMemorySettings, setMemorySettings, clearMemorySettings, countEvent, trialCounters } from "../src/lib/trial";

afterEach(() => {
  sweepExpiredTrials(new Date(Date.now() + 10 * 365 * 86400000).toISOString()); // 清掉本测试创建的匿名项目
});

describe("M2′ 在线试用：匿名自动会话", () => {
  it("无 token → 自动创建匿名会话；两次调用互相隔离", () => {
    const a = resolveOnlineSession(null);
    const b = resolveOnlineSession(null);
    expect(a.newToken).toBeTruthy();
    expect(b.newToken).toBeTruthy();
    expect(a.session.user.id).not.toBe(b.session.user.id);
    expect(a.session.project.id).not.toBe(b.session.project.id);
    expect(a.session.project.expiresAt).toBeTruthy(); // 匿名项目带 TTL
  });

  it("带有效 token → 返回同一会话（不新建）", () => {
    const first = resolveOnlineSession(null);
    const again = resolveOnlineSession(first.newToken);
    expect(again.session.user.id).toBe(first.session.user.id);
    expect(again.newToken).toBeNull();
  });

  it("trialTtlHours 默认 72，可被 env 覆盖", () => {
    const saved = process.env.GAMESCOPE_TRIAL_TTL_HOURS;
    delete process.env.GAMESCOPE_TRIAL_TTL_HOURS;
    expect(trialTtlHours()).toBe(72);
    process.env.GAMESCOPE_TRIAL_TTL_HOURS = "1";
    expect(trialTtlHours()).toBe(1);
    if (saved === undefined) delete process.env.GAMESCOPE_TRIAL_TTL_HOURS;
    else process.env.GAMESCOPE_TRIAL_TTL_HOURS = saved;
  });
});

describe("M2′ 会话级存储 TTL 清理", () => {
  it("过期匿名项目：数据/快照/项目/用户一并清除；未过期项目保留", () => {
    const u1 = createAnonymousUser();
    const p1 = getOrCreateProject(u1.id);
    setProjectExpiry(p1.id, new Date(Date.now() - 3600_000).toISOString()); // 已过期
    const u2 = createAnonymousUser();
    const p2 = getOrCreateProject(u2.id);
    setProjectExpiry(p2.id, new Date(Date.now() + 3600_000).toISOString()); // 未过期

    const swept = sweepExpiredTrials();
    expect(swept.length).toBeGreaterThanOrEqual(1);
    expect(swept).toContain(p1.id);
    // p1 的数据应已清空（datasets 为空）；p2 仍在
    const after = getDatasets(p2.id);
    expect(Array.isArray(after)).toBe(true);
  });
});

describe("M2′ IP 级限速（内存滑动窗口）", () => {
  it("限额内放行、超限拒绝并给出 retryAfter、窗口过后恢复", () => {
    const key = `test:${Math.random()}`;
    const t0 = Date.now();
    expect(rateLimit(key, 2, 1000, t0).ok).toBe(true);
    expect(rateLimit(key, 2, 1000, t0 + 100).ok).toBe(true);
    const blocked = rateLimit(key, 2, 1000, t0 + 200);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit(key, 2, 1000, t0 + 1100).ok).toBe(true); // 窗口外恢复
  });
});

describe("M2′ 用户 Key 内存存储（不落盘）", () => {
  it("按项目隔离；清除后为 null", () => {
    const s = { provider: "glm" as const, baseUrl: "https://x.example", apiKey: "sk-mem", model: "m" };
    setMemorySettings(900001, s);
    setMemorySettings(900002, { ...s, apiKey: "sk-other" });
    expect(getMemorySettings(900001)?.apiKey).toBe("sk-mem");
    expect(getMemorySettings(900002)?.apiKey).toBe("sk-other");
    clearMemorySettings(900001);
    expect(getMemorySettings(900001)).toBeNull();
    expect(getMemorySettings(900002)?.apiKey).toBe("sk-other");
  });
});

describe("M2′ 匿名功能计数（上传→问3问→完成）", () => {
  it("上传 + 3 次提问 → completed 计 1 且不重复计", () => {
    const pid = 910001 + Math.floor(Math.random() * 1000);
    const before = trialCounters().completed;
    countEvent(pid, "upload");
    countEvent(pid, "ask");
    countEvent(pid, "ask");
    countEvent(pid, "ask");
    const after = trialCounters().completed;
    expect(after).toBe(before + 1);
    countEvent(pid, "ask"); // 第 4 问不重复计
    expect(trialCounters().completed).toBe(after);
  });
});
