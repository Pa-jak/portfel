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

export interface CategoryInput {
  name: string;
  type: CategoryType;
  currency: Currency;
  sort_order?: number;
  hidden?: number;
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
  hidden?: number;
}

function withIncludeHidden(includeHidden: boolean | undefined): string {
  return includeHidden ? "?includeHidden=1" : "";
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
  listCategories: (opts?: { includeHidden?: boolean }) =>
    req<Category[]>("GET", `/api/categories${withIncludeHidden(opts?.includeHidden)}`),
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
  listDebts: (opts?: { includeHidden?: boolean }) =>
    req<Debt[]>("GET", `/api/debts${withIncludeHidden(opts?.includeHidden)}`),
  createDebt: (b: DebtInput) => req<Debt>("POST", "/api/debts", b),
  updateDebt: (id: number, b: DebtInput) => req<Debt>("PUT", `/api/debts/${id}`, b),
  deleteDebt: (id: number) => req<{ ok: boolean }>("DELETE", `/api/debts/${id}`),

  // settings
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (b: Settings) => req<{ ok: boolean }>("PUT", "/api/settings", b),

  // net worth
  getNetWorth: (opts?: { snapshot?: number; includeHidden?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.snapshot != null) params.set("snapshot", String(opts.snapshot));
    if (opts?.includeHidden) params.set("includeHidden", "1");
    const qs = params.toString();
    return req<NetWorthResult>("GET", `/api/networth${qs ? `?${qs}` : ""}`);
  },
  getNetWorthLive: (opts?: { includeHidden?: boolean }) =>
    req<NetWorthResult>("GET", `/api/networth/live${withIncludeHidden(opts?.includeHidden)}`),
  getNetWorthHistory: (opts?: { includeHidden?: boolean }) =>
    req<HistoryPoint[]>("GET", `/api/networth/history${withIncludeHidden(opts?.includeHidden)}`),

  // fx
  refreshFx: () => req<{ ok: boolean }>("POST", "/api/fx/refresh"),

  // health
  health: () => req<{ ok: boolean; ts: string }>("GET", "/api/health"),

  // version
  getVersion: () => req<{ version: string }>("GET", "/api/version"),

  // search (reveal/hide trigger — server compares the typed text to the env-configured phrases)
  search: (q: string) => req<{ action: "reveal" | "hide" | "none" }>("POST", "/api/search", { q }),
};