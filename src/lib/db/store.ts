import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  DatasetKind,
  DatasetMeta,
  SalesDayRow,
  SanityWarning,
  TrafficSourceRow,
  WishDayRow,
  RegionalRow,
} from "../types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "gamescope.db");

declare global {
  // eslint-disable-next-line no-var
  var __gamescopeDb: Database.Database | undefined;
}

const SCHEMA_VERSION = "2"; // v2: multi-user (users/sessions/projects + project scoping)

interface RegionalRowSql {
  date: string;
  country: string;
  units: number;
  refunds: number;
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      name TEXT NOT NULL,
      app_id INTEGER,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS datasets (
      project_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      date_min TEXT,
      date_max TEXT,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      uploaded_at TEXT NOT NULL,
      PRIMARY KEY (project_id, kind)
    );
    CREATE TABLE IF NOT EXISTS wishlist_rows (
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      adds REAL, deletes REAL, purchases REAL, gifts REAL, net REAL, total REAL,
      PRIMARY KEY (project_id, date)
    );
    CREATE TABLE IF NOT EXISTS traffic_rows (
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      visits REAL NOT NULL,
      units REAL NOT NULL,
      PRIMARY KEY (project_id, date, source)
    );
    CREATE TABLE IF NOT EXISTS sales_rows (
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      gross_units REAL NOT NULL,
      refund_units REAL NOT NULL,
      PRIMARY KEY (project_id, date)
    );
    CREATE TABLE IF NOT EXISTS regional_rows (
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      country TEXT NOT NULL,
      units REAL NOT NULL,
      refunds REAL NOT NULL,
      PRIMARY KEY (project_id, date, country)
    );
    CREATE TABLE IF NOT EXISTS app_snapshots (
      project_id INTEGER PRIMARY KEY,
      reviews_json TEXT,
      price_json TEXT,
      fetched_at TEXT NOT NULL
    );
  `);
}

function getDb(): Database.Database {
  if (!globalThis.__gamescopeDb) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    // --- schema migration: v1 had no project scoping; recreate (dev-stage data is disposable) ---
    const datasetsInfo = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='datasets'`)
      .get();
    let needsRecreate = false;
    if (datasetsInfo) {
      const cols = (
        db.prepare(`PRAGMA table_info(datasets)`).all() as { name: string }[]
      ).map((c) => c.name);
      if (!cols.includes("project_id")) needsRecreate = true;
    }
    if (needsRecreate) {
      db.exec(`
        DROP TABLE IF EXISTS datasets;
        DROP TABLE IF EXISTS wishlist_rows;
        DROP TABLE IF EXISTS traffic_rows;
        DROP TABLE IF EXISTS sales_rows;
        DROP TABLE IF EXISTS regional_rows;
        DROP TABLE IF EXISTS app_snapshots;
      `);
    }
    createSchema(db);
    // 增量迁移：projects.expires_at（M2′ 在线试用 TTL）
    const projCols = (
      db.prepare(`PRAGMA table_info(projects)`).all() as { name: string }[]
    ).map((c) => c.name);
    if (!projCols.includes("expires_at")) {
      db.exec(`ALTER TABLE projects ADD COLUMN expires_at TEXT`);
    }
    db.prepare(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(SCHEMA_VERSION);
    globalThis.__gamescopeDb = db;
  }
  return globalThis.__gamescopeDb;
}

function isoNow(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------- users

export interface UserRow {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export function createUser(email: string, passwordHash: string): UserRow {
  const db = getDb();
  const info = db
    .prepare(`INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)`)
    .run(email.toLowerCase(), passwordHash, isoNow());
  return {
    id: Number(info.lastInsertRowid),
    email: email.toLowerCase(),
    passwordHash,
    createdAt: isoNow(),
  };
}

export function getUserByEmail(email: string): UserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, email, password_hash, created_at FROM users WHERE email = ?`)
    .get(email.toLowerCase()) as
    | { id: number; email: string; password_hash: string; created_at: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

export function getUserById(id: number): UserRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT id, email, password_hash, created_at FROM users WHERE id = ?`)
    .get(id) as
    | { id: number; email: string; password_hash: string; created_at: string }
    | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, passwordHash: row.password_hash, createdAt: row.created_at };
}

// ---------------------------------------------------------------- sessions

export function createSession(userId: number, ttlDays = 30): { token: string; expiresAt: string } {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlDays * 86400000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

export function getSessionUserId(token: string): number | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT user_id, expires_at FROM sessions WHERE token = ?`)
    .get(token) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  return row.user_id;
}

export function deleteSession(token: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

// ---------------------------------------------------------------- projects (1 per user, D5/v2)

export interface Project {
  id: number;
  userId: number;
  name: string;
  appId: number | null;
  /** 匿名试用项目的过期时间（本地/注册用户为 null） */
  expiresAt: string | null;
}

export function getOrCreateProject(userId: number): Project {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id, user_id, name, app_id, expires_at FROM projects WHERE user_id = ?`)
    .get(userId) as {
    id: number;
    user_id: number;
    name: string;
    app_id: number | null;
    expires_at: string | null;
  } | undefined;
  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      name: existing.name,
      appId: existing.app_id,
      expiresAt: existing.expires_at,
    };
  }
  const info = db
    .prepare(`INSERT INTO projects (user_id, name, created_at) VALUES (?, ?, ?)`)
    .run(userId, "我的游戏", isoNow());
  return {
    id: Number(info.lastInsertRowid),
    userId,
    name: "我的游戏",
    appId: null,
    expiresAt: null,
  };
}

/** 匿名试用用户（M2′ 在线试用站；邮箱仅作内部标记，登录流不使用）。 */
export function createAnonymousUser(): UserRow {
  return createUser(
    `anon-${crypto.randomUUID()}@trial.local`,
    crypto.randomBytes(24).toString("hex")
  );
}

export function setProjectExpiry(projectId: number, expiresAt: string | null): void {
  getDb().prepare(`UPDATE projects SET expires_at = ? WHERE id = ?`).run(expiresAt, projectId);
}

/** 清理过期匿名试用数据（数据/快照/会话/用户/项目一并删除），返回被清理的项目 id 列表。 */
export function sweepExpiredTrials(now = new Date().toISOString()): number[] {
  const db = getDb();
  const expired = db
    .prepare(`SELECT id, user_id FROM projects WHERE expires_at IS NOT NULL AND expires_at < ?`)
    .all(now) as { id: number; user_id: number }[];
  for (const p of expired) {
    db.transaction(() => {
      db.prepare(`DELETE FROM datasets WHERE project_id = ?`).run(p.id);
      db.prepare(`DELETE FROM wishlist_rows WHERE project_id = ?`).run(p.id);
      db.prepare(`DELETE FROM traffic_rows WHERE project_id = ?`).run(p.id);
      db.prepare(`DELETE FROM sales_rows WHERE project_id = ?`).run(p.id);
      db.prepare(`DELETE FROM regional_rows WHERE project_id = ?`).run(p.id);
      db.prepare(`DELETE FROM app_snapshots WHERE project_id = ?`).run(p.id);
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(p.user_id);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(p.id);
      db.prepare(`DELETE FROM users WHERE id = ? AND email LIKE 'anon-%@trial.local'`).run(p.user_id);
    })();
  }
  return expired.map((p) => p.id);
}

/** 列出当前已过期但尚未清理的匿名试用项目 id（供内存态同步回收）。 */
export function listExpiredTrialProjects(now = new Date().toISOString()): number[] {
  const db = getDb();
  return (
    db
      .prepare(`SELECT id FROM projects WHERE expires_at IS NOT NULL AND expires_at < ?`)
      .all(now) as { id: number }[]
  ).map((r) => r.id);
}

export function updateProject(
  projectId: number,
  patch: { name?: string; appId?: number | null }
): void {
  const db = getDb();
  if (patch.name !== undefined) {
    db.prepare(`UPDATE projects SET name = ? WHERE id = ?`).run(patch.name, projectId);
  }
  if (patch.appId !== undefined) {
    db.prepare(`UPDATE projects SET app_id = ? WHERE id = ?`).run(patch.appId, projectId);
  }
}

// ---------------------------------------------------------------- datasets (project scoped)

interface ReplaceArgs {
  projectId: number;
  kind: DatasetKind;
  filename: string;
  warnings: SanityWarning[];
  insert: (tx: Database.Database) => number;
  dateMin: string | null;
  dateMax: string | null;
}

function replaceDataset({
  projectId,
  kind,
  filename,
  warnings,
  insert,
  dateMin,
  dateMax,
}: ReplaceArgs): { rowCount: number; dateMin: string | null; dateMax: string | null } {
  const db = getDb();
  const table =
    kind === "wishlist"
      ? "wishlist_rows"
      : kind === "traffic"
        ? "traffic_rows"
        : kind === "sales"
          ? "sales_rows"
          : "regional_rows";
  const rowCount = db.transaction(() => {
    db.prepare(`DELETE FROM datasets WHERE project_id = ? AND kind = ?`).run(projectId, kind);
    db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(projectId);
    const n = insert(db);
    db.prepare(
      `INSERT INTO datasets (project_id, kind, filename, row_count, date_min, date_max, warnings_json, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(projectId, kind, filename, n, dateMin, dateMax, JSON.stringify(warnings), isoNow());
    return n;
  })();
  return { rowCount, dateMin, dateMax };
}

export function replaceWishlist(
  projectId: number,
  filename: string,
  rows: WishDayRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO wishlist_rows (project_id, date, adds, deletes, purchases, gifts, net, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    projectId,
    kind: "wishlist",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(projectId, r.date, r.adds, r.deletes, r.purchases, r.gifts, r.net, r.total);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function replaceTraffic(
  projectId: number,
  filename: string,
  rows: TrafficSourceRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO traffic_rows (project_id, date, source, visits, units) VALUES (?, ?, ?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    projectId,
    kind: "traffic",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(projectId, r.date, r.source, r.visits, r.units);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function replaceSales(
  projectId: number,
  filename: string,
  rows: SalesDayRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO sales_rows (project_id, date, gross_units, refund_units) VALUES (?, ?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    projectId,
    kind: "sales",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(projectId, r.date, r.grossUnits, r.refundUnits);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function replaceRegional(
  projectId: number,
  filename: string,
  rows: RegionalRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO regional_rows (project_id, date, country, units, refunds) VALUES (?, ?, ?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    projectId,
    kind: "regional",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(projectId, r.date, r.country, r.units, r.refunds);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function getDatasets(projectId: number): DatasetMeta[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT kind, filename, row_count, date_min, date_max, warnings_json, uploaded_at
       FROM datasets WHERE project_id = ? ORDER BY kind`
    )
    .all(projectId) as {
    kind: DatasetKind;
    filename: string;
    row_count: number;
    date_min: string | null;
    date_max: string | null;
    warnings_json: string;
    uploaded_at: string;
  }[];
  return rows.map((r) => ({
    kind: r.kind,
    filename: r.filename,
    rowCount: r.row_count,
    dateMin: r.date_min,
    dateMax: r.date_max,
    uploadedAt: r.uploaded_at,
    warnings: JSON.parse(r.warnings_json) as SanityWarning[],
  }));
}

export function getWishlistRows(projectId: number): WishDayRow[] {
  const db = getDb();
  return (db
    .prepare(
      `SELECT date, adds, deletes, purchases, gifts, net, total FROM wishlist_rows WHERE project_id = ? ORDER BY date`
    )
    .all(projectId) as {
    date: string;
    adds: number | null;
    deletes: number | null;
    purchases: number | null;
    gifts: number | null;
    net: number | null;
    total: number | null;
  }[]).map((r) => ({ ...r }));
}

export function getTrafficSourceRows(projectId: number): TrafficSourceRow[] {
  const db = getDb();
  return (db
    .prepare(
      `SELECT date, source, visits, units FROM traffic_rows WHERE project_id = ? ORDER BY date, source`
    )
    .all(projectId) as { date: string; source: string; visits: number; units: number }[]).map(
    (r) => ({ ...r })
  );
}

export function getSalesRows(projectId: number): SalesDayRow[] {
  const db = getDb();
  return (db
    .prepare(
      `SELECT date, gross_units, refund_units FROM sales_rows WHERE project_id = ? ORDER BY date`
    )
    .all(projectId) as { date: string; gross_units: number; refund_units: number }[]).map((r) => ({
    date: r.date,
    grossUnits: r.gross_units,
    refundUnits: r.refund_units,
  }));
}

export function getRegionalRows(projectId: number): RegionalRow[] {
  const db = getDb();
  return (db
    .prepare(
      `SELECT date, country, units, refunds FROM regional_rows WHERE project_id = ? ORDER BY date, country`
    )
    .all(projectId) as RegionalRowSql[]).map((r) => ({
    date: r.date,
    country: r.country,
    units: r.units,
    refunds: r.refunds,
  }));
}

// ---------------------------------------------------------------- app snapshots (Steam Web API)

export interface StoredSnapshots {
  reviews: {
    appId: number;
    totalReviews: number;
    totalPositive: number;
    reviewScoreDesc: string;
  } | null;
  price: {
    appId: number;
    name: string;
    isFree: boolean;
    currency: string | null;
    initialPrice: number | null;
    finalPrice: number | null;
    discountPercent: number;
    releaseDate: string | null;
  } | null;
  fetchedAt: string | null;
}

export function getAppSnapshots(projectId: number): StoredSnapshots {
  const db = getDb();
  const row = db
    .prepare(`SELECT reviews_json, price_json, fetched_at FROM app_snapshots WHERE project_id = ?`)
    .get(projectId) as
    | { reviews_json: string | null; price_json: string | null; fetched_at: string }
    | undefined;
  if (!row) return { reviews: null, price: null, fetchedAt: null };
  return {
    reviews: row.reviews_json ? JSON.parse(row.reviews_json) : null,
    price: row.price_json ? JSON.parse(row.price_json) : null,
    fetchedAt: row.fetched_at,
  };
}

export function saveAppSnapshots(
  projectId: number,
  snapshots: { reviews: unknown; price: unknown }
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO app_snapshots (project_id, reviews_json, price_json, fetched_at)
     VALUES (?, ?, ?, ?)`
  ).run(
    projectId,
    JSON.stringify(snapshots.reviews),
    JSON.stringify(snapshots.price),
    isoNow()
  );
}

// ---------------------------------------------------------------- clear

export function clearProjectData(projectId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM datasets WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM wishlist_rows WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM traffic_rows WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM sales_rows WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM regional_rows WHERE project_id = ?`).run(projectId);
    db.prepare(`DELETE FROM app_snapshots WHERE project_id = ?`).run(projectId);
  })();
}
