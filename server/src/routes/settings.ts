import type { FastifyInstance } from "fastify";
import { getDb, type SettingsRow } from "../db";

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // Keys that must NEVER be exposed to the client or modified via the API — the
  // reveal/hide phrases are server-side env configuration only.
  const FORBIDDEN = new Set(["reveal_phrase", "hide_phrase"]);

  app.get("/api/settings", async () => {
    const rows = db.prepare("SELECT key, value FROM settings ORDER BY key").all() as SettingsRow[];
    const out: Record<string, string> = {};
    for (const r of rows) {
      if (FORBIDDEN.has(r.key)) continue;
      out[r.key] = r.value;
    }
    return out;
  });

  app.put<{ Body: string }>("/api/settings", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    for (const k of Object.keys(b)) {
      if (FORBIDDEN.has(k)) return reply.code(400).send({ error: "key not allowed" });
    }
    const ins = db.prepare(
      "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    );
    const tx = db.transaction(() => {
      for (const [k, v] of Object.entries(b)) ins.run(k, String(v));
    });
    tx();
    return { ok: true };
  });

  app.put<{ Params: { key: string }; Body: string }>("/api/settings/:key", async (req, reply) => {
    if (FORBIDDEN.has(req.params.key)) {
      return reply.code(400).send({ error: "key not allowed" });
    }
    const value = parseValue(req.body);
    db.prepare(
      "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).run(req.params.key, value);
    return { ok: true };
  });
}

function parseBody(raw: unknown): Record<string, unknown> | null {
  try {
    const b =
      typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
    if (b === null || typeof b !== "object") return null;
    return b as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseValue(raw: unknown): string {
  try {
    if (typeof raw === "string") {
      const j = JSON.parse(raw);
      if (typeof j === "object" && j !== null && "value" in j) return String((j as { value: unknown }).value);
      return j as unknown as string;
    }
    if (typeof raw === "object" && raw !== null && "value" in raw) {
      return String((raw as { value: unknown }).value);
    }
    return String(raw);
  } catch {
    return String(raw);
  }
}