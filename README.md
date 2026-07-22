# portfel — self-hosted monthly net-worth tracker

A single-user, self-hosted monthly net-worth tracking PWA that runs on a home server
(Docker) and is accessed on the same WiFi via the browser. No login / no auth for the
app itself; the only protected data is the optional "secret vault" — encrypted
client-side, never decryptable by the server.

## Stack (fixed)

- **Backend:** Node.js + TypeScript + **Fastify** + **better-sqlite3** (serves the built
  frontend statics in production — single container).
- **Frontend:** React + TypeScript + Vite + `vite-plugin-pwa` + Recharts +
  `@tanstack/react-query`. *(Stage 2 — not yet built.)*
- **Database:** SQLite, money stored as INTEGER minor units (grosze/cents).
- **FX source:** https://api.frankfurter.dev/v1 (free, no key). Cached in DB and stamped
  per monthly snapshot so historical totals never shift.

## Currencies

- Base display currencies: **PLN and USD** (net worth shown in both).
- Account/debt currencies: **PLN, USD, EUR, NOK**.

## Layout

```
portfel/
  Dockerfile          (Stage 3)
  docker-compose.yml  (Stage 3)
  README.md
  server/            (Fastify + better-sqlite3; serves web build in prod)
  web/               (React + Vite PWA — Stage 2)
  data/              (runtime volume: sqlite.db + backups; gitignored)
```

## Local development

From the repo root:

```bash
npm install           # installs root + server + web deps
npm run server        # backend on http://localhost:3000 (dev)
npm run web           # Vite dev (Stage 2)
# or both together:
npm run dev
```

## Secure context note (vault / PWA)

Web Crypto `subtle` and PWA install require a **secure context** (HTTPS or `localhost`).
Over plain `http://<lan-ip>` browsers may block both. For LAN access, run the app behind a
reverse proxy with TLS — see Stage 3 docs.

## Verification (Stage 1)

- Server compiles with `tsc` with zero errors: `npm run server:build`.
- `npm run server:start` serves the API on `http://localhost:3000` and the built
  frontend at `../web/dist` (once the frontend exists).

## Stage status

- **Stage 1 — backend scaffold, DB, FX, REST routes:** DONE.
- **Stage 2 — frontend PWA:** TODO.
- **Stage 3 — Dockerfile, compose, deploy docs:** TODO.