import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";

export default async function versionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/version", async () => ({ version: readRootVersion() }));
}

function readRootVersion(): string {
  // Compiled file lives at server/dist/routes/version.js, so:
  //   ../../..           -> repo/app ROOT (name "portfel")   [dev AND Docker]
  //   ../..              -> server/    (name "portfel-server")
  // We must return the ROOT version, so prefer the package.json whose name is the
  // root project ("portfel"); fall back to the first readable version if none match.
  const candidates = [
    path.join(__dirname, "..", "..", "..", "package.json"),
    path.join(process.cwd(), "package.json"),
    path.join(__dirname, "..", "..", "package.json"),
  ];
  let fallback: string | null = null;
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const pkg = JSON.parse(fs.readFileSync(p, "utf8")) as { name?: unknown; version?: unknown };
      if (typeof pkg.version !== "string" || pkg.version.length === 0) continue;
      if (pkg.name === "portfel") return pkg.version; // the root package
      if (fallback === null) fallback = pkg.version;
    } catch {
      // try next candidate
    }
  }
  return fallback ?? "0.0.0";
}