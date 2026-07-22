import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";

export default async function versionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/version", async () => ({ version: readRootVersion() }));
}

function readRootVersion(): string {
  // Resolve the ROOT package.json robustly across dev (server/dist -> ../../package.json)
  // and prod Docker layouts (the root package.json is copied to /app/package.json while
  // the compiled server lives in /app/server/dist, so ../../package.json works there too).
  const candidates = [
    path.join(__dirname, "..", "..", "package.json"),
    path.join(__dirname, "..", "..", "..", "package.json"),
    path.join(process.cwd(), "package.json"),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const pkg = JSON.parse(fs.readFileSync(p, "utf8")) as { version?: unknown };
      if (typeof pkg.version === "string" && pkg.version.length > 0) return pkg.version;
    } catch {
      // try next candidate
    }
  }
  return "0.0.0";
}