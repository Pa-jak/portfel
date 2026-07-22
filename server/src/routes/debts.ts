import type { FastifyInstance } from "fastify";
import { getDb, type DebtRow, type DebtDirection, type Currency } from "../db";

export default async function debtRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get("/api/debts", async () => {
    return db.prepare("SELECT * FROM debts ORDER BY created_at DESC").all() as DebtRow[];
  });

  app.post<{ Body: string }>("/api/debts", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const info = db
      .prepare(
        `INSERT INTO debts(direction, person, amount_minor, currency, note)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(b.direction, b.person, b.amount_minor ?? 0, b.currency, b.note ?? null);
    return reply
      .code(201)
      .send(db.prepare("SELECT * FROM debts WHERE id = ?").get(info.lastInsertRowid) as DebtRow);
  });

  app.put<{ Params: { id: string }; Body: string }>("/api/debts/:id", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const info = db
      .prepare(
        `UPDATE debts SET direction=?, person=?, amount_minor=?, currency=?, note=?, settled=?
         WHERE id=?`
      )
      .run(
        b.direction,
        b.person,
        b.amount_minor ?? 0,
        b.currency,
        b.note ?? null,
        b.settled ?? 0,
        req.params.id
      );
    if (info.changes === 0) return reply.code(404).send({ error: "not found" });
    return db.prepare("SELECT * FROM debts WHERE id = ?").get(req.params.id) as DebtRow;
  });

  app.delete<{ Params: { id: string } }>("/api/debts/:id", async (req) => {
    db.prepare("DELETE FROM debts WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}

interface DebtBody {
  direction: DebtDirection;
  person: string;
  amount_minor?: number;
  currency: Currency;
  note?: string | null;
  settled?: number;
}

function parseBody(raw: unknown): DebtBody | null {
  try {
    const b = typeof raw === "string" ? (JSON.parse(raw) as DebtBody) : (raw as DebtBody);
    if (b.direction !== "owed_to_me" && b.direction !== "i_owe") return null;
    if (typeof b.person !== "string" || b.person.length === 0) return null;
    if (!["PLN", "USD", "EUR", "NOK"].includes(b.currency)) return null;
    if (b.amount_minor != null && typeof b.amount_minor !== "number") return null;
    if (b.settled != null && b.settled !== 0 && b.settled !== 1) return null;
    return b;
  } catch {
    return null;
  }
}