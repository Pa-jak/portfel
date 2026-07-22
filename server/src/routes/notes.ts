import type { FastifyInstance } from "fastify";
import { getDb } from "../db";

export default async function notesRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // `notes` is a singleton row (id = 1) kept OUT of /api/settings. It holds the
  // dev notepad only — never enumerated by the generic settings endpoint.
  app.get("/api/notes", async () => {
    const row = db
      .prepare("SELECT text FROM notes WHERE id = 1")
      .get() as { text: string } | undefined;
    return { text: row?.text ?? "" };
  });

  app.put<{ Body: string }>("/api/notes", async (req) => {
    const text = parseText(req.body);
    db.prepare(
      "INSERT INTO notes(id, text) VALUES (1, ?) " +
        "ON CONFLICT(id) DO UPDATE SET text = excluded.text",
    ).run(text);
    return { ok: true };
  });
}

function parseText(raw: unknown): string {
  if (raw == null) return "";
  try {
    if (typeof raw === "string") {
      const j = JSON.parse(raw);
      if (typeof j === "object" && j !== null && "text" in j) {
        return String((j as { text: unknown }).text ?? "");
      }
      return String(j);
    }
    if (typeof raw === "object" && raw !== null && "text" in raw) {
      return String((raw as { text: unknown }).text ?? "");
    }
    return String(raw);
  } catch {
    return String(raw);
  }
}