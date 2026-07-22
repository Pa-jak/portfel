import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export type CategoryType = "asset" | "liability";
export type Currency = "PLN" | "USD" | "EUR" | "NOK";
export type DebtDirection = "owed_to_me" | "i_owe";

export const SUPPORTED_CURRENCIES: Currency[] = ["PLN", "USD", "EUR", "NOK"];
export const BASE_CURRENCIES: Currency[] = ["PLN", "USD"];

const DB_DIR = process.env.PORTFEL_DB_DIR ?? path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DB_DIR, "sqlite.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      type          TEXT    NOT NULL CHECK(type IN ('asset','liability')),
      currency      TEXT    NOT NULL CHECK(currency IN ('PLN','USD','EUR','NOK')),
      sort_order     INTEGER NOT NULL DEFAULT 0,
      hidden        INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      month           TEXT    NOT NULL UNIQUE,             -- 'YYYY-MM'
      income_minor    INTEGER NOT NULL DEFAULT 0,
      income_currency TEXT    NOT NULL DEFAULT 'PLN' CHECK(income_currency IN ('PLN','USD','EUR','NOK')),
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshot_values (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id   INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      amount_minor  INTEGER NOT NULL DEFAULT 0,
      currency      TEXT    NOT NULL CHECK(currency IN ('PLN','USD','EUR','NOK')),
      UNIQUE(snapshot_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS debts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      direction     TEXT    NOT NULL CHECK(direction IN ('owed_to_me','i_owe')),
      person        TEXT    NOT NULL,
      amount_minor  INTEGER NOT NULL DEFAULT 0,
      currency      TEXT    NOT NULL CHECK(currency IN ('PLN','USD','EUR','NOK')),
      note          TEXT,
      hidden        INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
      settled       INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1)),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fx_rates (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      date  TEXT    NOT NULL,           -- ISO 'YYYY-MM-DD'
      base  TEXT    NOT NULL,
      quote TEXT    NOT NULL,
      rate  REAL    NOT NULL,
      UNIQUE(date, base, quote)
    );

    CREATE TABLE IF NOT EXISTS snapshot_fx (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      base        TEXT    NOT NULL,
      quote       TEXT    NOT NULL,
      rate        REAL    NOT NULL,
      UNIQUE(snapshot_id, base, quote)
    );

    CREATE TABLE IF NOT EXISTS secret_blob (
      id         INTEGER PRIMARY KEY CHECK(id=1),
      salt       BLOB,
      iv         BLOB,
      ciphertext BLOB,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedSettings(db);
}

function seedSettings(db: Database.Database): void {
  const defaults: Record<string, string> = {
    base_currencies: "PLN,USD",
    account_currencies: "PLN,USD,EUR,NOK",
  };
  const ins = db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
}

// ---- typed row helpers -------------------------------------------------

export interface CategoryRow {
  id: number;
  name: string;
  type: CategoryType;
  currency: Currency;
  sort_order: number;
  hidden: number;
  created_at: string;
}
export interface SnapshotRow {
  id: number;
  month: string;
  income_minor: number;
  income_currency: Currency;
  notes: string | null;
  created_at: string;
}
export interface SnapshotValueRow {
  id: number;
  snapshot_id: number;
  category_id: number;
  amount_minor: number;
  currency: Currency;
}
export interface DebtRow {
  id: number;
  direction: DebtDirection;
  person: string;
  amount_minor: number;
  currency: Currency;
  note: string | null;
  hidden: number;
  settled: number;
  created_at: string;
}
export interface FxRateRow {
  id: number;
  date: string;
  base: string;
  quote: string;
  rate: number;
}
export interface SnapshotFxRow {
  id: number;
  snapshot_id: number;
  base: string;
  quote: string;
  rate: number;
}
export interface SecretBlobRow {
  id: number;
  salt: Buffer | null;
  iv: Buffer | null;
  ciphertext: Buffer | null;
  updated_at: string;
}
export interface SettingsRow {
  key: string;
  value: string;
}