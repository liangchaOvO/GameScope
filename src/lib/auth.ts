import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  createSession,
  deleteSession,
  getSessionUserId,
  getUserById,
  getOrCreateProject,
  type Project,
  type UserRow,
} from "./db/store";

/**
 * F6 认证：邮箱 + 密码（scrypt 哈希），httpOnly Cookie 会话。
 * 数据按账号隔离：所有业务数据挂在 project_id 下（每账号 1 个项目，D5）。
 */

const SESSION_COOKIE = "gs_session";
const SESSION_TTL_DAYS = 30;

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

/** Resolve the current session from the request cookie; null when signed out. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = getSessionUserId(token);
  if (userId == null) return null;
  const user = getUserById(userId);
  if (!user) return null;
  const project = getOrCreateProject(userId);
  return { user: { id: user.id, email: user.email }, project };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
