import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { getDb, closeDb } from "./db";
import categoryRoutes from "./routes/categories";
import snapshotRoutes from "./routes/snapshots";
import debtRoutes from "./routes/debts";
import settingsRoutes from "./routes/settings";
import netWorthRoutes from "./routes/networth";
import fxRoutes from "./routes/fx";
import versionRoutes from "./routes/version";
import searchRoutes from "./routes/search";
import notesRoutes from "./routes/notes";
import fixedCostRoutes from "./routes/fixedCosts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const WEB_DIST = path.join(__dirname, "..", "..", "web", "dist");

async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  // initialize DB on boot
  getDb();

  await app.register(categoryRoutes, { prefix: "" });
  await app.register(snapshotRoutes, { prefix: "" });
  await app.register(debtRoutes, { prefix: "" });
  await app.register(settingsRoutes, { prefix: "" });
  await app.register(netWorthRoutes, { prefix: "" });
  await app.register(fxRoutes, { prefix: "" });
  await app.register(versionRoutes, { prefix: "" });
  await app.register(searchRoutes, { prefix: "" });
  await app.register(notesRoutes, { prefix: "" });
  await app.register(fixedCostRoutes, { prefix: "" });

  app.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  // Serve the built frontend statics in production (Stage 2 produces web/dist).
  if (fs.existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: "/",
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.code(200).type("text/plain").send("portfel backend ready. Frontend not built yet.");
    });
  }

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`portfel server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = (sig: string): void => {
    app.log.info(`${sig} received, shutting down`);
    closeDb();
    void app.close().then(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main();