import type { FastifyInstance } from "fastify";
import { getDb, type Currency, type FxRateRow } from "../db";
import { fetchFrankfurter, cacheFxRates, refreshAllLatest } from "../fx";

const ALL: Currency[] = ["PLN", "USD", "EUR", "NOK"];

/**
 * Build a full cross-rate matrix `base -> { quote: rate }` for the supported
 * currencies, using the latest cached fx_rates rows. Missing pairs are filled
 * via reverse-rate lookups or, if no cache at all exists, by refreshing.
 */
async function buildLatestCrossRates(): Promise<Record<string, Record<string, number>>> {
  const db = getDb();
  const rows = db
    .prepare("SELECT base, quote, rate, date FROM fx_rates ORDER BY date DESC")
    .all() as FxRateRow[];

  // For each (base, quote) pick the latest row.
  const latest = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.base}->${r.quote}`;
    if (!latest.has(key)) latest.set(key, r.rate);
  }

  if (latest.size === 0) {
    // Cache empty: refresh from Frankfurter and recurse-like re-read.
    await refreshAllLatest();
    return buildLatestCrossRates();
  }

  function rateOf(from: Currency, to: Currency): number | null {
    if (from === to) return 1;
    const direct = latest.get(`${from}->${to}`);
    if (direct != null) return direct;
    const reverse = latest.get(`${to}->${from}`);
    if (reverse != null) return 1 / reverse;
    return null;
  }

  // Ensure at least one base is fully populated; if gaps remain, refresh that base.
  for (const base of ALL) {
    for (const quote of ALL) {
      if (base === quote) continue;
      if (rateOf(base, quote) == null) {
        try {
          const { date, rates } = await fetchFrankfurter(base);
          cacheFxRates(date, base, rates);
          for (const [q, r] of Object.entries(rates)) latest.set(`${base}->${q}`, r);
        } catch {
          // ignore network failure — keep best-effort matrix
        }
      }
    }
  }

  const out: Record<string, Record<string, number>> = {};
  for (const base of ALL) {
    out[base] = {};
    for (const quote of ALL) {
      const r = rateOf(base, quote);
      out[base][quote] = r != null ? r : 1;
    }
  }
  return out;
}

export default async function fxRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/fx/refresh", async (_req, reply) => {
    try {
      await refreshAllLatest();
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
    return { ok: true };
  });

  // Latest cached cross-rate matrix among PLN/USD/EUR/NOK.
  // Lets the client convert hidden amount (kept only in the encrypted vault)
  // to PLN/USD without ever revealing them to the server.
  app.get("/api/fx/rates", async () => {
    const rates = await buildLatestCrossRates();
    return { rates };
  });
}