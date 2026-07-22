import type { FastifyInstance } from "fastify";
import { getDb, type Currency, type FixedCostCycle, type FixedCostRow } from "../db";

const CYCLES: FixedCostCycle[] = ["monthly", "yearly"];
const CURRENCIES: Currency[] = ["PLN", "USD", "EUR", "NOK"];

export default async function fixedCostRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get("/api/fixed-costs", async () => {
    return db
      .prepare("SELECT * FROM fixed_costs ORDER BY sort_order ASC, created_at DESC")
      .all() as FixedCostRow[];
  });

  app.post<{ Body: string }>("/api/fixed-costs", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const maxRow = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM fixed_costs")
      .get() as { m: number };
    const info = db
      .prepare(
        `INSERT INTO fixed_costs(name, amount_minor, currency, cycle, note, active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        b.name,
        b.amount_minor ?? 0,
        b.currency,
        b.cycle ?? "monthly",
        b.note ?? null,
        b.active == null ? 1 : b.active ? 1 : 0,
        maxRow.m + 1,
      );
    return reply
      .code(201)
      .send(db.prepare("SELECT * FROM fixed_costs WHERE id = ?").get(info.lastInsertRowid) as FixedCostRow);
  });

  app.put<{ Params: { id: string }; Body: string }>("/api/fixed-costs/:id", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const info = db
      .prepare(
        `UPDATE fixed_costs SET name=?, amount_minor=?, currency=?, cycle=?, note=?, active=?
         WHERE id=?`,
      )
      .run(
        b.name,
        b.amount_minor ?? 0,
        b.currency,
        b.cycle ?? "monthly",
        b.note ?? null,
        b.active == null ? 1 : b.active ? 1 : 0,
        req.params.id,
      );
    if (info.changes === 0) return reply.code(404).send({ error: "not found" });
    return db.prepare("SELECT * FROM fixed_costs WHERE id = ?").get(req.params.id) as FixedCostRow;
  });

  app.delete<{ Params: { id: string } }>("/api/fixed-costs/:id", async (req) => {
    db.prepare("DELETE FROM fixed_costs WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}

interface FixedCostBody {
  name: string;
  amount_minor?: number;
  currency: Currency;
  cycle?: FixedCostCycle;
  note?: string | null;
  active?: number | boolean;
}

function parseBody(raw: unknown): FixedCostBody | null {
  try {
    const b = typeof raw === "string" ? (JSON.parse(raw) as FixedCostBody) : (raw as FixedCostBody);
    if (typeof b.name !== "string" || b.name.trim().length === 0) return null;
    if (!CURRENCIES.includes(b.currency)) return null;
    if (b.cycle != null && !CYCLES.includes(b.cycle)) return null;
    if (b.amount_minor != null && typeof b.amount_minor !== "number") return null;
    if (b.active != null && b.active !== 0 && b.active !== 1 && b.active !== true && b.active !== false) return null;
    return b;
  } catch {
    return null;
  }
}