import { getDb, type Currency } from "./db";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const ALL_CURRENCIES: Currency[] = ["PLN", "USD", "EUR", "NOK"];

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/** Fetch `base -> quote` rates from Frankfurter for a given date (or latest). */
export async function fetchFrankfurter(
  base: Currency,
  date?: string
): Promise<{ date: string; rates: Record<string, number> }> {
  const segment = date ? `/${date}` : "/latest";
  const symbols = ALL_CURRENCIES.filter((c) => c !== base).join(",");
  const url = `${FRANKFURTER_BASE}${segment}?base=${base}&symbols=${symbols}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Frankfurter ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as FrankfurterResponse;
  return { date: json.date, rates: json.rates };
}

/** Cache rates for a given date into the global fx_rates table. */
export function cacheFxRates(
  date: string,
  base: Currency,
  rates: Record<string, number>
): void {
  const db = getDb();
  const ins = db.prepare(
    "INSERT OR REPLACE INTO fx_rates(date, base, quote, rate) VALUES (?, ?, ?, ?)"
  );
  for (const [quote, rate] of Object.entries(rates)) {
    ins.run(date, base, quote, rate);
  }
}

/** Stamp a snapshot with the given base->quote rates (snapshot_fx table). */
export function stampSnapshotFx(
  snapshotId: number,
  rates: Array<{ base: string; quote: string; rate: number }>
): void {
  const db = getDb();
  const del = db.prepare("DELETE FROM snapshot_fx WHERE snapshot_id = ?");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO snapshot_fx(snapshot_id, base, quote, rate) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    del.run(snapshotId);
    for (const r of rates) ins.run(snapshotId, r.base, r.quote, r.rate);
  });
  tx();
}

/** Look up a rate from the snapshot_fx table (for historical totals). */
export function getSnapshotRate(
  snapshotId: number,
  from: Currency,
  to: Currency
): number {
  if (from === to) return 1;
  const db = getDb();
  const row = db
    .prepare("SELECT rate FROM snapshot_fx WHERE snapshot_id = ? AND base = ? AND quote = ?")
    .get(snapshotId, from, to) as { rate: number } | undefined;
  if (row) return row.rate;
  // Fallback to direct reverse lookup if present.
  const rev = db
    .prepare("SELECT rate FROM snapshot_fx WHERE snapshot_id = ? AND base = ? AND quote = ?")
    .get(snapshotId, to, from) as { rate: number } | undefined;
  if (rev) return 1 / rev.rate;
  throw new Error(`No snapshot FX rate for ${from}->${to} (snapshot ${snapshotId})`);
}

/**
 * Get the latest cached `from -> to` rate; if missing, fetch from Frankfurter
 * and cache it under today's date.
 */
export async function getLatestRate(from: Currency, to: Currency): Promise<number> {
  if (from === to) return 1;
  const db = getDb();
  const cached = db
    .prepare(
      "SELECT rate, date FROM fx_rates WHERE base = ? AND quote = ? ORDER BY date DESC LIMIT 1"
    )
    .get(from, to) as { rate: number; date: string } | undefined;
  if (cached) return cached.rate;

  // Try reverse-rate cache.
  const rev = db
    .prepare(
      "SELECT rate, date FROM fx_rates WHERE base = ? AND quote = ? ORDER BY date DESC LIMIT 1"
    )
    .get(to, from) as { rate: number; date: string } | undefined;
  if (rev) return 1 / rev.rate;

  const { date, rates } = await fetchFrankfurter(from);
  cacheFxRates(date, from, rates);
  if (rates[to] != null) return rates[to];
  throw new Error(`No FX rate available for ${from}->${to}`);
}

/** Refresh and cache latest rates for all `base` currencies. */
export async function refreshAllLatest(): Promise<void> {
  for (const base of ALL_CURRENCIES) {
    const { date, rates } = await fetchFrankfurter(base);
    cacheFxRates(date, base, rates);
  }
}

/** Fetch + return all base->target rates needed to stamp a snapshot. */
export async function fetchSnapshotRates(date: string): Promise<
  Array<{ base: string; quote: string; rate: number }>
> {
  const out: Array<{ base: string; quote: string; rate: number }> = [];
  for (const base of ALL_CURRENCIES) {
    const res = await fetchFrankfurter(base, date);
    for (const [quote, rate] of Object.entries(res.rates)) {
      out.push({ base, quote, rate });
    }
  }
  return out;
}