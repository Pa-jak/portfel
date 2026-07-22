# Changelog

All notable changes to **portfel** are documented here. Versions follow
[Semantic Versioning](https://semver.org/) and the single source of truth is the
`version` field in the root `package.json`. Newest entries first.

## 0.2.1 — 2026-07-22

Docker deployment tooling — single self-contained container that builds the
frontend, compiles the server, and runs the Fastify process serving the built
PWA statics + the API over the same port.

### Added
- Root **`Dockerfile`** (multi-stage, `linux/amd64`):
  - `web-build` stage (`node:22-bookworm-slim`): `npm ci` in `web/`, then
    `npx vite build` -> `web/dist`.
  - `server-build` stage (`node:22-bookworm-slim` + `python3 make g++`):
    `npm ci` in `server/` (so TS compiles), `npx tsc` -> `server/dist`, then a
    second `npm ci --omit=dev` to get a clean production `node_modules` with a
    Linux-built `better-sqlite3` native binding.
  - `run` stage (`node:22-bookworm-slim`): preserves the repo layout under
    `/app` — `/app/package.json`, `/app/server/dist`, `/app/server/node_modules`,
    `/app/web/dist`. `NODE_ENV=production`, `PORT=3000`, `EXPOSE 3000`, declares
    `/app/data` as a `VOLUME`, `HEALTHCHECK` curl against `http://127.0.0.1:3000/api/health`,
    and `CMD ["node","server/dist/index.js"]` run from `/app`. The compiled
    server's default path resolution (`__dirname=/app/server/dist` -> `../../web/dist`,
    `../../data`, `../../package.json`) already matches this layout, so no env
    overrides are required.
- Root **`docker-compose.yml`**: one `portfel` service building the Dockerfile,
  `ports: 3000:3000`, `volumes: ./data:/app/data`, `restart: unless-stopped`,
  and a matching `healthcheck`.
- Root **`.dockerignore`**: excludes `node_modules/`, `dist/`, `data/`, `.git/`,
  logs, and `.env` from the build context.
- README: Polish **"Wdrożenie (Docker)"** section (clone, build, access via
  `http://SERVER_IP:3000`, update flow, data location & backup, HTTPS-for-PWA
  note).

### Notes
- No source files changed — the server's path resolution and the default
  `PORTFEL_DB_DIR` already work correctly when the repo layout is preserved at
  `/app`, so the container runs out of the box.
- `docker` is not required for development; the existing local
  `npm run dev` / `npm run build` / `npm run start` workflow is unchanged.

## 0.2.0 — 2026-07-22

Breaking simplification of the hiding feature, replacing the encrypted Web Crypto
vault with simple view-only hiding over plain HTTP.

### Breaking changes
- Removed the encrypted `secret_blob` mechanism entirely: deleted the
  `secret_blob` table, the `/api/secret-blob` route, and the client-side
  Web Crypto (PBKDF2/AES-GCM) helpers (`web/src/lib/crypto.ts`,
  `web/src/lib/fxConvert.ts`). The server no longer stores any ciphertext.
- The "Szukaj / dodaj" trigger no longer unlocks/locks an encrypted blob.
  Typing the reveal phrase sets a plain in-memory `revealed = true`; typing
  the hide phrase resets it to `false`. `revealed` lives only in React state
  and resets to false on reload.
- `categories` and `debts` already had a `hidden INTEGER (0/1)` column; this is
  now **the only hiding mechanism**. Hidden rows live in the plain tables,
  just flagged. Security is NOT a goal here — only visual hiding.

### Added
- `settings.seedSettings` defaults: `reveal_phrase = "Alohomora"` and
  `hide_phrase = "Obliviate"` (editable in Settings).
- `?includeHidden=1` query parameter on list and totals endpoints:
  - `GET /api/categories?includeHidden=1`
  - `GET /api/debts?includeHidden=1`
  - `GET /api/networth?includeHidden=1`
  - `GET /api/networth/live?includeHidden=1`
  - `GET /api/networth/history?includeHidden=1`
  By default hidden rows (categories, debts) are excluded from listings and
  their values/debts are excluded from PLN/USD totals; setting the flag
  includes them in both.
- `POST/PUT /api/categories` and `POST/PUT /api/debts` accept and persist a
  `hidden` (0/1) field. So hidden management happens through the normal API.
- Frontend `api.listCategories({ includeHidden })`, `api.listDebts({ includeHidden })`,
  `api.getNetWorth({ includeHidden })`, `api.getNetWorthLive({ includeHidden })`,
  `api.getNetWorthHistory({ includeHidden })` helpers.
- Thin `RevealProvider`/`useReveal()` context (replaces `VaultProvider`/`useVault`):
  fetches reveal/hide phrases from settings on mount, exposes `revealed`,
  `revealPhrase`, `hidePhrase`, and `submitPhrase(text)`.
- Dashboard, Categories, Debts and SnapshotEdit pages fetch with
  `includeHidden=1` only when `revealed`, marking hidden rows with an
  "ukryta" pill; the add/edit forms expose a `ukryna` checkbox (only when
  revealed) that sets the `hidden` flag through the normal create/update API.
- Settings page: editable `reveal_phrase` / `hide_phrase` fields persisted via
  the settings API; the old "Zmień hasło" passphrase block is gone. Existing
  base/helper currencies, manual FX refresh, and version + "Sprawdź
  aktualizacje" sections are unchanged.

### Removed
- Web Crypto (`crypto.subtle`) usage on the client — works fully over plain
  `http://<lan-ip>` now (PWA install still benefits from HTTPS).

## 0.1.0 — 2026-07-22

Initial release of the self-hosted monthly net-worth tracker.

### Backend (Fastify + better-sqlite3, TypeScript)
- SQLite schema with integer minor-unit money columns: `categories`,
  `snapshots`, `snapshot_values`, `debts`, `fx_rates`, `snapshot_fx`,
  `secret_blob`, `settings`. WAL mode + foreign keys on. DB persisted under
  `data/sqlite.db` (survives server restart).
- REST API under `/api`:
  - `GET/POST /api/categories`, `GET/PUT/DELETE /api/categories/:id` — CRUD
    (asset/liability, PLN/USD/EUR/NOK, sort order).
  - `GET/POST /api/snapshots`, `GET/PUT/DELETE /api/snapshots/:id` — monthly
    snapshot with values; creating/updating a snapshot stamps the FX rates used
    into `snapshot_fx` so historical totals never shift.
  - `GET/POST/PUT/DELETE /api/debts` — debts owed to me / I owe, mark settled.
  - `GET/PUT/DELETE /api/secret-blob` — opaque encrypted blob stored as
    ciphertext only; the server **never** decrypts it.
  - `GET/PUT /api/settings`, `PUT /api/settings/:key`.
  - `GET /api/networth` and `GET /api/networth/live` — net worth in PLN & USD
    across mixed currencies using snapshot-stamped or latest cached FX rates.
  - `GET /api/networth/history` — oldest→newest monthly history for charts.
  - `GET/POST /api/fx/refresh`, `GET /api/fx/rates` — FX cached from the free
    Frankfurter API (https://api.frankfurter.dev/v1), no API key.
  - `GET /api/health`, `GET /api/version`.
- Serves the built frontend statics in production (single container).

### Frontend (React + TypeScript + Vite PWA)
- PWA installable on desktop and mobile via `vite-plugin-pwa`.
- State with `@tanstack/react-query`; charts with Recharts; routing with
  react-router-dom.
- Screens:
  1. **Pulpit (Dashboard)** — net worth in PLN & USD, month-over-month trend
     chart, income vs net-worth growth; top **"Szukaj / dodaj"** input doubles as
     the vault unlock/lock trigger.
  2. **Snapshot** — pick a month, enter/update each category value + income.
  3. **Kategorie** — CRUD categories, asset/liability, currency, ordering.
  4. **Długi** — two sections (owed to me / I owe), CRUD, mark settled.
  5. **Ustawienia** — base/helper currencies, manual FX refresh, vault
     passphrase change, version info & update check.
- **Secret vault (plausible deniability):** hidden categories/values/debts live
  **only** inside the client-side AES-GCM encrypted blob. Unlock = successful
  decryption (PBKDF2 via Web Crypto `crypto.subtle`); the passphrase is never
  stored server-side. Typing `Alohomora` reveals hidden items in-memory; typing
  `Obliviate` (or reloading the page) locks and recomputes totals without them.
  The DB and running app give no hint that hidden data exists.

### Versioning & updates
- Single source of truth: root `package.json` `version` (SemVer).
- Backend `GET /api/version` returns `{ version }` read from the root
  `package.json` (path resolved robustly for dev and Docker prod layouts).
- Frontend version injected at build time via Vite `define`
  (`__APP_VERSION__`); shown in the app footer and on the Settings page.
- PWA update flow: service worker registered with `virtual:pwa-register`
  (`autoUpdate` for background updates) plus an explicit **"Sprawdź
  aktualizacje"** action in Settings that calls the SW registration `update()`
  and compares `__APP_VERSION__` with `GET /api/version`, showing "Masz
  najnowszą wersję" or "Dostępna nowa wersja — odśwież" with a reload button
  that activates the waiting service worker.

### Notes
- Money amounts are always integers in minor units (grosze/cents); no floats
  in storage or computation.
- Web Crypto `subtle` and PWA install require a **secure context** (HTTPS or
  `localhost`); over plain `http://<lan-ip>` browsers may block them — use a
  reverse proxy with HTTPS in that case.