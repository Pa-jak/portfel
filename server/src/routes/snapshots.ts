import type { FastifyInstance } from "fastify";
import { getDb, type SnapshotRow, type SnapshotValueRow, type Currency } from "../db";
import { fetchSnapshotRates, stampSnapshotFx } from "../fx";

export default async function snapshotRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get("/api/snapshots", async () => {
    return db.prepare("SELECT * FROM snapshots ORDER BY month DESC").all() as SnapshotRow[];
  });

  app.get<{ Params: { id: string } }>("/api/snapshots/:id", async (req, reply) => {
    const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get(req.params.id) as
      | SnapshotRow
      | undefined;
    if (!row) return reply.code(404).send({ error: "not found" });
    const values = db
      .prepare("SELECT * FROM snapshot_values WHERE snapshot_id = ?")
      .all(req.params.id) as SnapshotValueRow[];
    return { ...row, values };
  });

  app.post<{ Body: string }>("/api/snapshots", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    if (!/^\d{4}-\d{2}$/.test(b.month)) {
      return reply.code(400).send({ error: "month must be YYYY-MM" });
    }
    const exists = db.prepare("SELECT id FROM snapshots WHERE month = ?").get(b.month) as
      | { id: number }
      | undefined;
    if (exists) return reply.code(409).send({ error: "snapshot for month already exists" });

    let snapshotId: number;
    const stampDate = `${b.month}-01`;
    try {
      const rates = await fetchSnapshotRates(stampDate);
      const tx = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO snapshots(month, income_minor, income_currency, notes)
             VALUES (?, ?, ?, ?)`
          )
          .run(b.month, b.income_minor ?? 0, b.income_currency ?? "PLN", b.notes ?? null);
        snapshotId = Number(info.lastInsertRowid);
        stampSnapshotFx(snapshotId, rates);
        for (const v of b.values ?? []) {
          db.prepare(
            `INSERT INTO snapshot_values(snapshot_id, category_id, amount_minor, currency)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(snapshot_id, category_id) DO UPDATE SET amount_minor=excluded.amount_minor, currency=excluded.currency`
          ).run(snapshotId, v.category_id, v.amount_minor, v.currency);
        }
      });
      tx();
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
    return reply
      .code(201)
      .send(db.prepare("SELECT * FROM snapshots WHERE id = ?").get(snapshotId!) as SnapshotRow);
  });

  app.put<{ Params: { id: string }; Body: string }>("/api/snapshots/:id", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const existing = db.prepare("SELECT id FROM snapshots WHERE id = ?").get(req.params.id) as
      | { id: number }
      | undefined;
    if (!existing) return reply.code(404).send({ error: "not found" });

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE snapshots SET income_minor=?, income_currency=?, notes=? WHERE id=?`
      ).run(b.income_minor ?? 0, b.income_currency ?? "PLN", b.notes ?? null, req.params.id);
      if (Array.isArray(b.values)) {
        db.prepare("DELETE FROM snapshot_values WHERE snapshot_id = ?").run(req.params.id);
        for (const v of b.values) {
          db.prepare(
            `INSERT INTO snapshot_values(snapshot_id, category_id, amount_minor, currency)
             VALUES (?, ?, ?, ?)`
          ).run(req.params.id, v.category_id, v.amount_minor, v.currency);
        }
      }
    });
    tx();
    return db.prepare("SELECT * FROM snapshots WHERE id = ?").get(req.params.id) as SnapshotRow;
  });

  app.delete<{ Params: { id: string } }>("/api/snapshots/:id", async (req) => {
    db.prepare("DELETE FROM snapshots WHERE id = ?").run(req.params.id);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/snapshots/:id/values", async (req, reply) => {
    const row = db.prepare("SELECT id FROM snapshots WHERE id = ?").get(req.params.id);
    if (!row) return reply.code(404).send({ error: "not found" });
    return db
      .prepare("SELECT * FROM snapshot_values WHERE snapshot_id = ?")
      .all(req.params.id) as SnapshotValueRow[];
  });
}

interface SnapshotValueInput {
  category_id: number;
  amount_minor: number;
  currency: Currency;
}
interface SnapshotBody {
  month: string;
  income_minor?: number;
  income_currency?: Currency;
  notes?: string | null;
  values?: SnapshotValueInput[];
}

function parseBody(raw: unknown): SnapshotBody | null {
  try {
    const b =
      typeof raw === "string" ? (JSON.parse(raw) as SnapshotBody) : (raw as SnapshotBody);
    if (typeof b?.month !== "string") return null;
    if (b.income_minor != null && typeof b.income_minor !== "number") return null;
    if (
      b.income_currency != null &&
      !["PLN", "USD", "EUR", "NOK"].includes(b.income_currency)
    )
      return null;
    if (b.values != null) {
      if (!Array.isArray(b.values)) return null;
      for (const v of b.values) {
        if (
          typeof v?.category_id !== "number" ||
          typeof v?.amount_minor !== "number" ||
          !["PLN", "USD", "EUR", "NOK"].includes(v.currency)
        )
          return null;
      }
    }
    return b;
  } catch {
    return null;
  }
}