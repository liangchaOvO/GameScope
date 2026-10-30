import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  createSession,
  deleteSession,
  getSessionUserId,
  getUserById,
  getUserByEmail,
  createUser,
  createAnonymousUser,
  setProjectExpiry,
  getOrCreateProject,
  type Project,
  type UserRow,
} from "./db/store";

/**
 * 认证层（F6）。两种运行模式：
 * - 本地模式（GAMESCOPE_LOCAL_MODE，默认开启）：跳过登录，懒创建唯一的本地用户与项目，
 *   数据存本机 SQLite；auth 代码保留，在线试用站将以匿名自动会话模式复用。
 * - 在线模式（GAMESCOPE_LOCAL_MODE=off）：邮箱 + 密码（scrypt），httpOnly Cookie 会话。
 */

const SESSION_COOKIE = "gs_session";
const SESSION_TTL_DAYS = 30;
const LOCAL_USER_EMAIL = "local@gamescope.local";
/** 匿名试用会话 TTL（小时，env GAMESCOPE_TRIAL_TTL_HOURS 可调，默认 72h）。 */
export function trialTtlHours(): number {
  const v = Number(process.env.GAMESCOPE_TRIAL_TTL_HOURS);
  return Number.isFinite(v) && v > 0 ? v : 72;
}

export function isLocalMode(): boolean {
  return (process.env.GAMESCOPE_LOCAL_MODE ?? "on").toLowerCase() !== "off";
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "密码至少 8 位。";
  if (password.length > 128) return "密码过长。";
  return null;
}

export async function startSession(userId: number): Promise<void> {
  const { token } = createSession(userId, SESSION_TTL_DAYS);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  store.delete(SESSION_COOKIE);
}

export interface Session {
  user: Pick<UserRow, "id" | "email">;
  project: Project;
}

declare global {
  // eslint-disable-next-line no-var
  var __gamescopeLocalUserId: number | undefined;
}

/** 本地模式唯一用户（懒创建；复用 users/projects 表，隔离语义与在线模式一致）。 */
export function ensureLocalSession(): Session {
  if (globalThis.__gamescopeLocalUserId == null) {
    const existing = getUserByEmail(LOCAL_USER_EMAIL);
    const user =
      existing ??
      createUser(LOCAL_USER_EMAIL, hashPassword(crypto.randomBytes(24).toString("hex")));
    getOrCreateProject(user.id);
    globalThis.__gamescopeLocalUserId = user.id;
  }
  const user = getUserById(globalThis.__gamescopeLocalUserId)!;
  const project = getOrCreateProject(user.id);
  return { user: { id: user.id, email: user.email }, project };
}

/** 解析在线模式会话：有效 Cookie → 原会话；否则自动创建匿名试用会话（返回需种下的新 token）。 */
export function resolveOnlineSession(token: string | null): {
  session: Session;
  newToken: string | null;
  ttlHours: number;
} {
  if (token) {
    const userId = getSessionUserId(token);
    if (userId != null) {
      const user = getUserById(userId);
      if (user) {
        return {
          session: { user: { id: user.id, email: user.email }, project: getOrCreateProject(userId) },
          newToken: null,
          ttlHours: trialTtlHours(),
        };
      }
    }
  }
  // 匿名自动会话：不注册、不收邮箱；项目带 TTL，由 sweepExpiredTrials 定期清理
  const user = createAnonymousUser();
  const ttlHours = trialTtlHours();
  const project = getOrCreateProject(user.id);
  setProjectExpiry(project.id, new Date(Date.now() + ttlHours * 3600_000).toISOString());
  const { token: newToken } = createSession(user.id, Math.max(1, Math.ceil(ttlHours / 24)));
  return {
    session: { user: { id: user.id, email: user.email }, project: getOrCreateProject(user.id) },
    newToken,
    ttlHours,
  };
}

/** 解析当前会话：本地模式直接返回本地会话；在线模式匿名自动会话/注册会话。 */
export async function getSession(): Promise<Session | null> {
  if (isLocalMode()) return ensureLocalSession();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const { session, newToken } = resolveOnlineSession(token);
  if (newToken) {
    store.set(SESSION_COOKIE, newToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: trialTtlHours() * 3600,
    });
  }
  return session;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
