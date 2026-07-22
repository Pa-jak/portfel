import type { FastifyInstance } from "fastify";
import { getDb, type SecretBlobRow } from "../db";

/** The server treats this as an opaque blob. It NEVER decrypts it. */
export default async function secretBlobRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  app.get("/api/secret-blob", async () => {
    const row = db.prepare("SELECT * FROM secret_blob WHERE id = 1").get() as
      | SecretBlobRow
      | undefined;
    if (!row || !row.ciphertext) return { exists: false };
    return {
      exists: true,
      salt: row.salt ? Buffer.from(row.salt).toString("base64") : null,
      iv: row.iv ? Buffer.from(row.iv).toString("base64") : null,
      ciphertext: row.ciphertext ? Buffer.from(row.ciphertext).toString("base64") : null,
      updated_at: row.updated_at,
    };
  });

  app.put<{ Body: string }>("/api/secret-blob", async (req, reply) => {
    const b = parseBody(req.body);
    if (!b) return reply.code(400).send({ error: "invalid body" });
    const salt = b.salt ? Buffer.from(b.salt, "base64") : null;
    const iv = b.iv ? Buffer.from(b.iv, "base64") : null;
    const ciphertext = b.ciphertext ? Buffer.from(b.ciphertext, "base64") : null;

    db.prepare(
      `INSERT INTO secret_blob(id, salt, iv, ciphertext, updated_at) VALUES (1, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET salt=excluded.salt, iv=excluded.iv, ciphertext=excluded.ciphertext, updated_at=datetime('now')`
    ).run(salt, iv, ciphertext);

    return { ok: true };
  });

  app.delete("/api/secret-blob", async () => {
    db.prepare("DELETE FROM secret_blob WHERE id = 1").run();
    return { ok: true };
  });
}

interface BlobBody {
  salt: string | null;
  iv: string | null;
  ciphertext: string | null;
}

function parseBody(raw: unknown): BlobBody | null {
  try {
    const b = typeof raw === "string" ? (JSON.parse(raw) as BlobBody) : (raw as BlobBody);
    if (typeof b !== "object" || b === null) return null;
    if (b.salt != null && typeof b.salt !== "string") return null;
    if (b.iv != null && typeof b.iv !== "string") return null;
    if (b.ciphertext != null && typeof b.ciphertext !== "string") return null;
    return b;
  } catch {
    return null;
  }
}