# Changelog

All notable changes to **portfel** are documented here. Versions follow
[Semantic Versioning](https://semver.org/) and the single source of truth is the
`version` field in the root `package.json`. Newest entries first.

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