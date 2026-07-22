// Client-side currency conversion for hidden (in-memory) vault items.
// Uses GET /api/fx/rates latest cross-rate matrix. Money stays minor units.

import type { Currency } from "./api";
import { api } from "./api";
import type { VaultCategory, VaultDebt } from "./vault";

export type RateMap = Record<string, Record<string, number>>;

export async function loadRates(): Promise<RateMap> {
  const r = await api.getFxRates();
  return r.rates;
}

export function convertMinor(amount_minor: number, from: Currency, to: Currency, rates: RateMap): number {
  if (from === to) return amount_minor;
  const row = rates[from];
  const r = row ? row[to] : null;
  if (r == null) return amount_minor; // fallback: no rate — keep as-is
  return Math.round(amount_minor * r);
}

/**
 * Sum hidden categories (asset - liability) for a given month,
 * converted to the target currency.
 */
export function sumHiddenCategoriesForMonth(
  categories: VaultCategory[],
  month: string,
  to: Currency,
  rates: RateMap,
): number {
  let net = 0;
  for (const c of categories) {
    const v = c.values[month] ?? 0;
    if (!v) continue;
    const inTo = convertMinor(v, c.currency, to, rates);
    net += c.type === "asset" ? inTo : -inTo;
  }
  return net;
}

/** Sum hidden active (unsettled) debts: +owed_to_me, -i_owe, converted to `to`. */
export function sumHiddenDebts(debts: VaultDebt[], to: Currency, rates: RateMap): number {
  let net = 0;
  for (const d of debts) {
    if (d.settled) continue;
    const inTo = convertMinor(d.amount_minor, d.currency, to, rates);
    net += d.direction === "owed_to_me" ? inTo : -inTo;
  }
  return net;
}