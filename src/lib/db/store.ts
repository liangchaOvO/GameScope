import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  DatasetKind,
  DatasetMeta,
  SalesDayRow,
  SanityWarning,
  TrafficSourceRow,
  WishDayRow,
} from "../types";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "gamescope.db");

declare global {
  // eslint-disable-next-line no-var
  var __gamescopeDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (!globalThis.__gamescopeDb) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS datasets (
        kind TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        date_min TEXT,
        date_max TEXT,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        uploaded_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wishlist_rows (
        date TEXT PRIMARY KEY,
        adds REAL, deletes REAL, purchases REAL, gifts REAL, net REAL, total REAL
      );
      CREATE TABLE IF NOT EXISTS traffic_rows (
        date TEXT NOT NULL,
        source TEXT NOT NULL,
        visits REAL NOT NULL,
        units REAL NOT NULL,
        PRIMARY KEY (date, source)
      );
      CREATE TABLE IF NOT EXISTS sales_rows (
        date TEXT PRIMARY KEY,
        gross_units REAL NOT NULL,
        refund_units REAL NOT NULL
      );
    `);
    globalThis.__gamescopeDb = db;
  }
  return globalThis.__gamescopeDb;
}

function isoNow(): string {
  return new Date().toISOString();
}

interface ReplaceArgs {
  kind: DatasetKind;
  filename: string;
  warnings: SanityWarning[];
  insert: (tx: Database.Database) => number;
  dateMin: string | null;
  dateMax: string | null;
}

function replaceDataset({
  kind,
  filename,
  warnings,
  insert,
  dateMin,
  dateMax,
}: ReplaceArgs): { rowCount: number; dateMin: string | null; dateMax: string | null } {
  const db = getDb();
  const table =
    kind === "wishlist" ? "wishlist_rows" : kind === "traffic" ? "traffic_rows" : "sales_rows";
  const rowCount = db.transaction(() => {
    db.prepare(`DELETE FROM datasets WHERE kind = ?`).run(kind);
    db.prepare(`DELETE FROM ${table}`).run();
    const n = insert(db);
    db.prepare(
      `INSERT INTO datasets (kind, filename, row_count, date_min, date_max, warnings_json, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(kind, filename, n, dateMin, dateMax, JSON.stringify(warnings), isoNow());
    return n;
  })();
  return { rowCount, dateMin, dateMax };
}

export function replaceWishlist(
  filename: string,
  rows: WishDayRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO wishlist_rows (date, adds, deletes, purchases, gifts, net, total) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    kind: "wishlist",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(r.date, r.adds, r.deletes, r.purchases, r.gifts, r.net, r.total);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function replaceTraffic(
  filename: string,
  rows: TrafficSourceRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO traffic_rows (date, source, visits, units) VALUES (?, ?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    kind: "traffic",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(r.date, r.source, r.visits, r.units);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function replaceSales(
  filename: string,
  rows: SalesDayRow[],
  warnings: SanityWarning[]
) {
  const stmt = `INSERT OR REPLACE INTO sales_rows (date, gross_units, refund_units) VALUES (?, ?, ?)`;
  const dates = rows.map((r) => r.date).sort();
  return replaceDataset({
    kind: "sales",
    filename,
    warnings,
    insert: (db) => {
      const ps = db.prepare(stmt);
      for (const r of rows) {
        ps.run(r.date, r.grossUnits, r.refundUnits);
      }
      return rows.length;
    },
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
  });
}

export function getDatasets(): DatasetMeta[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT kind, filename, row_count, date_min, date_max, warnings_json, uploaded_at FROM datasets ORDER BY kind`)
    .all() as {
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

export function getWishlistRows(): WishDayRow[] {
  const db = getDb();
  return (db
    .prepare(`SELECT date, adds, deletes, purchases, gifts, net, total FROM wishlist_rows ORDER BY date`)
    .all() as {
    date: string;
    adds: number | null;
    deletes: number | null;
    purchases: number | null;
    gifts: number | null;
    net: number | null;
    total: number | null;
  }[]).map((r) => ({ ...r }));
}

export function getTrafficDaily(): TrafficSourceRow[] {
  const db = getDb();
  return (db
    .prepare(`SELECT date, source, visits, units FROM traffic_rows ORDER BY date, source`)
    .all() as { date: string; source: string; visits: number; units: number }[]).map(
    (r) => ({ ...r })
  );
}

export function getSalesRows(): SalesDayRow[] {
  const db = getDb();
  return (db
    .prepare(`SELECT date, gross_units, refund_units FROM sales_rows ORDER BY date`)
    .all() as { date: string; gross_units: number; refund_units: number }[]).map((r) => ({
    date: r.date,
    grossUnits: r.gross_units,
    refundUnits: r.refund_units,
  }));
}

export function clearAll(): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM datasets`).run();
    db.prepare(`DELETE FROM wishlist_rows`).run();
    db.prepare(`DELETE FROM traffic_rows`).run();
    db.prepare(`DELETE FROM sales_rows`).run();
  })();
}
