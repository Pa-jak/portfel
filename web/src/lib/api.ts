// Typed fetch wrapper for the portfel backend API.
// Money amounts are always integers in minor units.

export type CategoryType = "asset" | "liability";
export type Currency = "PLN" | "USD" | "EUR" | "NOK";
export type DebtDirection = "owed_to_me" | "i_owe";

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  currency: Currency;
  sort_order: number;
  hidden: number;
  created_at: string;
}

export interface Snapshot {
  id: number;
  month: string;
  income_minor: number;
  income_currency: Currency;
  notes: string | null;
  created_at: string;
}

export interface SnapshotValue {
  id: number;
  snapshot_id: number;
  category_id: number;
  amount_minor: number;
  currency: Currency;
}

export interface SnapshotWithValues extends Snapshot {
  values: SnapshotValue[];
}

export interface Debt {
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

export type Settings = Record<string, string>;

export interface NetWorthResult {
  snapshot_id: number | null;
  month: string | null;
  base: { PLN: number; USD: number };
  assets: { PLN: number; USD: number };
  liabilities: { PLN: number; USD: number };
  debts_owed_to_me: { PLN: number; USD: number };
  i_owe: { PLN: number; USD: number };
  fx_sources: { snapshot: boolean; rates_at: string | null };
}

export interface HistoryPoint {
  month: string;
  income_minor: number;
  income_currency: Currency;
  PLN: number;
  USD: number;
}

export interface SecretBlob {
  exists: boolean;
  salt: string | null;
  iv: string | null;
  ciphertext: string | null;
  updated_at: string | null;
}

export interface CategoryInput {
  name: string;
  type: CategoryType;
  currency: Currency;
  sort_order?: number;
}

export interface SnapshotValueInput {
  category_id: number;
  amount_minor: number;
  currency: Currency;
}

export interface SnapshotInput {
  month: string;
  income_minor?: number;
  income_currency?: Currency;
  notes?: string | null;
  values?: SnapshotValueInput[];
}

export interface DebtInput {
  direction: DebtDirection;
  person: string;
  amount_minor?: number;
  currency: Currency;
  note?: string | null;
  settled?: number;
}

export interface SecretBlobInput {
  salt: string | null;
  iv: string | null;
  ciphertext: string | null;
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      msg = await res.text().catch(() => msg);
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  // categories
  listCategories: () => req<Category[]>("GET", "/api/categories"),
  getCategory: (id: number) => req<Category>("GET", `/api/categories/${id}`),
  createCategory: (b: CategoryInput) => req<Category>("POST", "/api/categories", b),
  updateCategory: (id: number, b: CategoryInput) =>
    req<Category>("PUT", `/api/categories/${id}`, b),
  deleteCategory: (id: number) => req<{ ok: boolean }>("DELETE", `/api/categories/${id}`),

  // snapshots
  listSnapshots: () => req<Snapshot[]>("GET", "/api/snapshots"),
  getSnapshot: (id: number) => req<SnapshotWithValues>("GET", `/api/snapshots/${id}`),
  createSnapshot: (b: SnapshotInput) => req<Snapshot>("POST", "/api/snapshots", b),
  updateSnapshot: (id: number, b: SnapshotInput) =>
    req<Snapshot>("PUT", `/api/snapshots/${id}`, b),
  deleteSnapshot: (id: number) => req<{ ok: boolean }>("DELETE", `/api/snapshots/${id}`),

  // debts
  listDebts: () => req<Debt[]>("GET", "/api/debts"),
  createDebt: (b: DebtInput) => req<Debt>("POST", "/api/debts", b),
  updateDebt: (id: number, b: DebtInput) => req<Debt>("PUT", `/api/debts/${id}`, b),
  deleteDebt: (id: number) => req<{ ok: boolean }>("DELETE", `/api/debts/${id}`),

  // settings
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (b: Settings) => req<{ ok: boolean }>("PUT", "/api/settings", b),

  // net worth
  getNetWorth: (snapshot?: number) =>
    req<NetWorthResult>("GET", `/api/networth${snapshot != null ? `?snapshot=${snapshot}` : ""}`),
  getNetWorthLive: () => req<NetWorthResult>("GET", "/api/networth/live"),
  getNetWorthHistory: () => req<HistoryPoint[]>("GET", "/api/networth/history"),

  // fx
  refreshFx: () => req<{ ok: boolean }>("POST", "/api/fx/refresh"),
  getFxRates: () =>
    req<{ rates: Record<string, Record<string, number>> }>("GET", "/api/fx/rates"),

  // secret blob (opaque; server never decrypts)
  getSecretBlob: () => req<SecretBlob>("GET", "/api/secret-blob"),
  putSecretBlob: (b: SecretBlobInput) => req<{ ok: boolean }>("PUT", "/api/secret-blob", b),
  deleteSecretBlob: () => req<{ ok: boolean }>("DELETE", "/api/secret-blob"),

  // health
  health: () => req<{ ok: boolean; ts: string }>("GET", "/api/health"),

  // version
  getVersion: () => req<{ version: string }>("GET", "/api/version"),
};