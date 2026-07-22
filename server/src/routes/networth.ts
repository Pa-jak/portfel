import type { FastifyInstance } from "fastify";
import { getDb, type Currency } from "../db";
import { getSnapshotRate, getLatestRate } from "../fx";

interface HistoryPoint {
  month: string;
  income_minor: number;
  income_currency: Currency;
  PLN: number;
  USD: number;
}

interface NetResult {
  snapshot_id: number | null;
  month: string | null;
  base: { PLN: number; USD: number };
  assets: { PLN: number; USD: number };
  liabilities: { PLN: number; USD: number };
  debts_owed_to_me: { PLN: number; USD: number };
  i_owe: { PLN: number; USD: number };
  fx_sources: { snapshot: boolean; rates_at: string | null };
}

export default async function netWorthRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get<{ Querystring: { snapshot?: string; includeHidden?: string } }>("/api/networth", async (req) => {
    const includeHidden = req.query.includeHidden === "1";
    const hiddenFilter = includeHidden ? "" : "AND c.hidden = 0";
    const debtHiddenFilter = includeHidden ? "" : "AND hidden = 0";
    let snapshotId: number | null;
    if (req.query.snapshot) {
      const id = Number(req.query.snapshot);
      snapshotId = Number.isNaN(id) ? null : id;
    } else {
      const row = db
        .prepare("SELECT id FROM snapshots ORDER BY month DESC LIMIT 1")
        .get() as { id: number } | undefined;
      snapshotId = row?.id ?? null;
    }

    if (snapshotId == null) {
      return emptyResult();
    }
    const snap = db.prepare("SELECT id, month FROM snapshots WHERE id = ?").get(snapshotId) as
      | { id: number; month: string }
      | undefined;
    if (!snap) return emptyResult();

    const values = db
      .prepare(
        `SELECT sv.amount_minor, sv.currency, c.type
         FROM snapshot_values sv JOIN categories c ON c.id = sv.category_id
         WHERE sv.snapshot_id = ? ${hiddenFilter}`
      )
      .all(snapshotId) as { amount_minor: number; currency: Currency; type: "asset" | "liability" }[];

    const debts = db
      .prepare(`SELECT direction, amount_minor, currency FROM debts WHERE settled = 0 ${debtHiddenFilter}`)
      .all() as { direction: "owed_to_me" | "i_owe"; amount_minor: number; currency: Currency }[];

    let hasSnapshotFx = true;
    const toBase = (from: Currency, to: Currency): number => {
      try {
        return getSnapshotRate(snapshotId, from, to);
      } catch {
        hasSnapshotFx = false;
        return 0;
      }
    };

    let assetsPLN = 0, assetsUSD = 0, liabsPLN = 0, liabsUSD = 0;
    for (const v of values) {
      if (v.type === "asset") {
        assetsPLN += v.amount_minor * toBase(v.currency, "PLN");
        assetsUSD += v.amount_minor * toBase(v.currency, "USD");
      } else {
        liabsPLN += v.amount_minor * toBase(v.currency, "PLN");
        liabsUSD += v.amount_minor * toBase(v.currency, "USD");
      }
    }

    let owedPLN = 0, owedUSD = 0, owePLN = 0, oweUSD = 0;
    for (const d of debts) {
      if (d.direction === "owed_to_me") {
        owedPLN += d.amount_minor * toBase(d.currency, "PLN");
        owedUSD += d.amount_minor * toBase(d.currency, "USD");
      } else {
        owePLN += d.amount_minor * toBase(d.currency, "PLN");
        oweUSD += d.amount_minor * toBase(d.currency, "USD");
      }
    }

    const netPLN = assetsPLN - liabsPLN + owedPLN - owePLN;
    const netUSD = assetsUSD - liabsUSD + owedUSD - oweUSD;

    return {
      snapshot_id: snapshotId,
      month: snap.month,
      base: { PLN: netPLN, USD: netUSD },
      assets: { PLN: assetsPLN, USD: assetsUSD },
      liabilities: { PLN: liabsPLN, USD: liabsUSD },
      debts_owed_to_me: { PLN: owedPLN, USD: owedUSD },
      i_owe: { PLN: owePLN, USD: oweUSD },
      fx_sources: { snapshot: hasSnapshotFx, rates_at: snap.month },
    } satisfies NetResult;
  });

  app.get<{ Querystring: { includeHidden?: string } }>("/api/networth/history", async (req) => {
    const includeHidden = req.query.includeHidden === "1";
    const hiddenFilter = includeHidden ? "" : "AND c.hidden = 0";
    const debtHiddenFilter = includeHidden ? "" : "AND hidden = 0";
    const snaps = db
      .prepare("SELECT id, month, income_minor, income_currency FROM snapshots ORDER BY month ASC")
      .all() as { id: number; month: string; income_minor: number; income_currency: Currency }[];

    const debts = db
      .prepare(`SELECT direction, amount_minor, currency FROM debts WHERE settled = 0 ${debtHiddenFilter}`)
      .all() as { direction: "owed_to_me" | "i_owe"; amount_minor: number; currency: Currency }[];

    const out: HistoryPoint[] = [];
    for (const snap of snaps) {
      const hasFx = snapshotHasFx(db, snap.id);
      const values = db
        .prepare(
          `SELECT sv.amount_minor, sv.currency, c.type
           FROM snapshot_values sv JOIN categories c ON c.id = sv.category_id
           WHERE sv.snapshot_id = ? ${hiddenFilter}`
        )
        .all(snap.id) as { amount_minor: number; currency: Currency; type: "asset" | "liability" }[];

      let assetsPLN = 0, assetsUSD = 0, liabsPLN = 0, liabsUSD = 0;
      for (const v of values) {
        if (v.type === "asset") {
          assetsPLN += v.amount_minor * (hasFx ? getSnapshotRate(snap.id, v.currency, "PLN") : 0);
          assetsUSD += v.amount_minor * (hasFx ? getSnapshotRate(snap.id, v.currency, "USD") : 0);
        } else {
          liabsPLN += v.amount_minor * (hasFx ? getSnapshotRate(snap.id, v.currency, "PLN") : 0);
          liabsUSD += v.amount_minor * (hasFx ? getSnapshotRate(snap.id, v.currency, "USD") : 0);
        }
      }

      let owedPLN = 0, owedUSD = 0, owePLN = 0, oweUSD = 0;
      for (const d of debts) {
        if (d.direction === "owed_to_me") {
          owedPLN += d.amount_minor * (hasFx ? getSnapshotRate(snap.id, d.currency, "PLN") : 0);
          owedUSD += d.amount_minor * (hasFx ? getSnapshotRate(snap.id, d.currency, "USD") : 0);
        } else {
          owePLN += d.amount_minor * (hasFx ? getSnapshotRate(snap.id, d.currency, "PLN") : 0);
          oweUSD += d.amount_minor * (hasFx ? getSnapshotRate(snap.id, d.currency, "USD") : 0);
        }
      }

      out.push({
        month: snap.month,
        income_minor: snap.income_minor,
        income_currency: snap.income_currency,
        PLN: assetsPLN - liabsPLN + owedPLN - owePLN,
        USD: assetsUSD - liabsUSD + owedUSD - oweUSD,
      });
    }
    return out;
  });

  app.get<{ Querystring: { includeHidden?: string } }>("/api/networth/live", async (req) => {
    const includeHidden = req.query.includeHidden === "1";
    const catHidden = includeHidden ? "1=1" : "c.hidden = 0";
    const debtHiddenFilter = includeHidden ? "" : "AND hidden = 0";
    const values = db
      .prepare(
        `SELECT sv.amount_minor, sv.currency, c.type, s.id AS snapshot_id, s.month
         FROM snapshot_values sv
         JOIN categories c ON c.id = sv.category_id
         JOIN snapshots s ON s.id = sv.snapshot_id
         WHERE ${catHidden}
           AND sv.snapshot_id = (SELECT id FROM snapshots ORDER BY month DESC LIMIT 1)`
      )
      .all() as { amount_minor: number; currency: Currency; type: "asset" | "liability"; snapshot_id: number; month: string }[];

    let snapId: number | null = null;
    let snapMonth: string | null = null;
    await Promise.all(
      Array.from(new Set(values.map((v) => v.currency)))
        .filter((c) => c !== "PLN" && c !== "USD")
        .map((c) => Promise.all([getLatestRate(c, "PLN"), getLatestRate(c, "USD")]))
    );
    const debts = db
      .prepare(`SELECT direction, amount_minor, currency FROM debts WHERE settled = 0 ${debtHiddenFilter}`)
      .all() as { direction: "owed_to_me" | "i_owe"; amount_minor: number; currency: Currency }[];

    const toBaseAsync = async (from: Currency, to: Currency): Promise<number> => {
      if (from === to) return 1;
      return getLatestRate(from, to);
    };

    let assetsPLN = 0, assetsUSD = 0, liabsPLN = 0, liabsUSD = 0;
    for (const v of values) {
      const p = await toBaseAsync(v.currency, "PLN");
      const u = await toBaseAsync(v.currency, "USD");
      snapId = v.snapshot_id;
      snapMonth = v.month;
      const val = v.amount_minor;
      if (v.type === "asset") {
        assetsPLN += val * p;
        assetsUSD += val * u;
      } else {
        liabsPLN += val * p;
        liabsUSD += val * u;
      }
    }

    let owedPLN = 0, owedUSD = 0, owePLN = 0, oweUSD = 0;
    for (const d of debts) {
      const p = await toBaseAsync(d.currency, "PLN");
      const u = await toBaseAsync(d.currency, "USD");
      if (d.direction === "owed_to_me") {
        owedPLN += d.amount_minor * p;
        owedUSD += d.amount_minor * u;
      } else {
        owePLN += d.amount_minor * p;
        oweUSD += d.amount_minor * u;
      }
    }

    return {
      snapshot_id: snapId,
      month: snapMonth,
      base: { PLN: assetsPLN - liabsPLN + owedPLN - owePLN, USD: assetsUSD - liabsUSD + owedUSD - oweUSD },
      assets: { PLN: assetsPLN, USD: assetsUSD },
      liabilities: { PLN: liabsPLN, USD: liabsUSD },
      debts_owed_to_me: { PLN: owedPLN, USD: owedUSD },
      i_owe: { PLN: owePLN, USD: oweUSD },
      fx_sources: { snapshot: false, rates_at: null },
    } satisfies NetResult;
  });
}

function snapshotHasFx(db: ReturnType<typeof getDb>, snapshotId: number): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM snapshot_fx WHERE snapshot_id = ?")
    .get(snapshotId) as { n: number };
  return row.n > 0;
}

function emptyResult(): NetResult {
  return {
    snapshot_id: null,
    month: null,
    base: { PLN: 0, USD: 0 },
    assets: { PLN: 0, USD: 0 },
    liabilities: { PLN: 0, USD: 0 },
    debts_owed_to_me: { PLN: 0, USD: 0 },
    i_owe: { PLN: 0, USD: 0 },
    fx_sources: { snapshot: false, rates_at: null },
  };
}