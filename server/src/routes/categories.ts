import type { FastifyInstance } from "fastify";
import { getDb, type CategoryRow, type CategoryType, type Currency } from "../db";

export default async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get("/api/categories", async () => {
    return db.prepare("SELECT * FROM categories ORDER BY sort_order, id").all() as CategoryRow[];
  });

  app.get<{ Params: { id: string } }>("/api/categories/:id", async (req, reply) => {
    const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id) as
      | CategoryRow
      | undefined;
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post<{ Body: string }>("/api/categories", async (req, reply) => {
    const b = safeParse(req.body);
    if (!validBody(b)) return reply.code(400).send({ error: "invalid body" });
    const info = db
      .prepare(
        "INSERT INTO categories(name, type, currency, sort_order) VALUES (?, ?, ?, ?)"
      )
      .run(b.name, b.type, b.currency, b.sort_order ?? 0);
    return reply
      .code(201)
      .send(db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid) as CategoryRow);
  });

  app.put<{ Params: { id: string }; Body: string }>("/api/categories/:id", async (req, reply) => {
    const b = safeParse(req.body);
    if (!validBody(b)) return reply.code(400).send({ error: "invalid body" });
    const info = db
      .prepare(
        "UPDATE categories SET name=?, type=?, currency=?, sort_order=? WHERE id=?"
      )
      .run(b.name, b.type, b.currency, b.sort_order ?? 0, req.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: "not found" });
    return db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id) as CategoryRow;
  });

  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (req) => {
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}

interface CategoryBody {
  name: string;
  type: CategoryType;
  currency: Currency;
  sort_order?: number;
}

function safeParse(raw: unknown): CategoryBody | null {
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as CategoryBody) : (raw as CategoryBody);
  } catch {
    return null;
  }
}

function validBody(b: CategoryBody | null): b is CategoryBody {
  if (!b) return false;
  if (typeof b.name !== "string" || b.name.length === 0) return false;
  if (b.type !== "asset" && b.type !== "liability") return false;
  if (!["PLN", "USD", "EUR", "NOK"].includes(b.currency)) return false;
  if (b.sort_order != null && typeof b.sort_order !== "number") return false;
  return true;
}