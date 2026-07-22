import type { FastifyInstance } from "fastify";
import { getDb, type CategoryRow, type CategoryType, type Currency } from "../db";

export default async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get<{ Querystring: { includeHidden?: string } }>("/api/categories", async (req) => {
    const includeHidden = req.query.includeHidden === "1";
    const where = includeHidden ? "" : "WHERE hidden = 0";
    return db
      .prepare(`SELECT * FROM categories ${where} ORDER BY sort_order, id`)
      .all() as CategoryRow[];
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
    // Default new categories to the end of the list (max sort_order + 1).
    const max =
      (db.prepare("SELECT MAX(sort_order) AS m FROM categories").get() as { m: number | null } | undefined)
        ?.m ?? -1;
    const sortOrder = b.sort_order != null ? b.sort_order : max + 1;
    const info = db
      .prepare(
        "INSERT INTO categories(name, type, currency, sort_order, hidden) VALUES (?, ?, ?, ?, ?)"
      )
      .run(b.name, b.type, b.currency, sortOrder, b.hidden === 1 ? 1 : 0);
    return reply
      .code(201)
      .send(db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid) as CategoryRow);
  });

  app.put<{ Body: string }>("/api/categories/reorder", async (req, reply) => {
    const b = parseReorder(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const tx = db.transaction(() => {
      const upd = db.prepare("UPDATE categories SET sort_order = ? WHERE id = ?");
      b.ids.forEach((id, i) => upd.run(i, id));
    });
    tx();
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: string }>("/api/categories/:id", async (req, reply) => {
    const b = safeParse(req.body);
    if (!validBody(b)) return reply.code(400).send({ error: "invalid body" });
    const info = db
      .prepare(
        "UPDATE categories SET name=?, type=?, currency=?, sort_order=?, hidden=? WHERE id=?"
      )
      .run(b.name, b.type, b.currency, b.sort_order ?? 0, b.hidden === 1 ? 1 : 0, req.params.id);
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
  hidden?: number;
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
  if (b.hidden != null && b.hidden !== 0 && b.hidden !== 1) return false;
  return true;
}

interface ReorderBody {
  ids: number[];
}

function parseReorder(raw: unknown): ReorderBody | null {
  try {
    const b = typeof raw === "string" ? (JSON.parse(raw) as ReorderBody) : (raw as ReorderBody);
    if (b === null || typeof b !== "object") return null;
    if (!Array.isArray(b.ids)) return null;
    for (const id of b.ids) {
      if (typeof id !== "number" || !Number.isFinite(id)) return null;
    }
    return b;
  } catch {
    return null;
  }
}