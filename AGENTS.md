# portfel — net worth tracker (project spec & conventions)

You are building a **self-hosted monthly net-worth tracking web app** for a single user,
run on a home server (Docker) and accessed by devices on the same WiFi via the browser.
Frontend is a PWA (installable on desktop and mobile). Read this whole file before coding.

## Golden rules

- **Stack is fixed** (do not swap): Node.js + TypeScript + **Fastify** + **better-sqlite3** on the
  backend; **React + TypeScript + Vite** + `vite-plugin-pwa` + **Recharts** + `@tanstack/react-query`
  on the frontend. Backend serves the built frontend statics in production (single container).
- **No user login / no auth** for the app itself. The only protected data is the "secret vault"
  (see below), protected by client-side encryption — never by a server-side password.
- Keep it simple and readable. No ORM heavier than plain `better-sqlite3` prepared statements.
- All money amounts stored as **integers in minor units** (grosze/cents) to avoid float errors.
- Do NOT commit secrets. Do NOT add analytics or external calls except the FX rate API.
- Work in small, coherent steps. Only build the stage you are asked for. Keep TypeScript strict.

## Currencies

- Base display currencies: **PLN and USD** (net worth shown in both).
- Supported currencies for accounts/debts: **PLN, USD, EUR, NOK**.
- FX source: **https://api.frankfurter.dev/v1** (free, no key). Cache rates in the DB.
  When a monthly snapshot is created, store the FX rates used so historical totals never shift.

## Data model (SQLite, integer minor units for money)

- `categories(id, name, type['asset'|'liability'], currency, sort_order, created_at)`
- `snapshots(id, month TEXT 'YYYY-MM' UNIQUE, income_minor, income_currency, notes, created_at)`
- `snapshot_values(id, snapshot_id, category_id, amount_minor, currency)`
- `debts(id, direction['owed_to_me'|'i_owe'], person, amount_minor, currency, note, settled INTEGER, created_at)`
- `fx_rates(id, date TEXT, base, quote, rate REAL)` — cache; also stamped per snapshot
- `secret_blob(id INTEGER PRIMARY KEY CHECK(id=1), salt, iv, ciphertext, updated_at)` — single opaque
  encrypted blob; the server stores ONLY ciphertext and never decrypts it.
- `settings(key, value)` — vault phrases, base currencies, etc.

## Net worth calculation

`net = sum(assets) - sum(liabilities) + sum(owed_to_me active debts) - sum(i_owe active debts)`,
each converted from its native currency to PLN and USD using the relevant snapshot's stored FX
rates (or latest cached rates for the live/current view). By default hidden categories/debts are
excluded from the totals; when the user has revealed them (see below), they are included.

## Hidden categories (view-only hiding — NOT encryption)

The requirement is simple **visual hiding**, not cryptographic security: some categories/debts are
hidden from the normal view and revealed by typing a phrase. No encryption, no Web Crypto — so it works
over plain HTTP. (This replaces the earlier encrypted-vault design; remove that crypto code.)

- Categories and debts have a `hidden` INTEGER (0/1) column (already in the schema) — this IS the hiding
  mechanism. Hidden rows are stored normally in the plain tables like any other row, just flagged.
- A top-of-dashboard input labeled **"Szukaj / dodaj"** is the trigger. On submit the frontend POSTs the
  text to **`POST /api/search`** `{ q }`; the server compares it to the phrases and returns
  `{ action: 'reveal' | 'hide' | 'none' }`. `reveal` sets client-side `revealed = true`, `hide` sets it
  `false`, `none` is a no-op (indistinguishable from an ordinary search). `revealed` is plain React state
  (resets to false on reload).
- **The phrases must leave NO trace in the app.** They are configured ONLY server-side via env vars
  `PORTFEL_REVEAL_PHRASE` (default `Alohomora`) and `PORTFEL_HIDE_PHRASE` (default `Obliviate`), read by
  the backend. They are NEVER stored in the `settings` table, NEVER returned by any API (not by
  `/api/settings`), NEVER sent to the client, and there is NO UI anywhere in the app to view or change
  them (no field, no hint, no explanatory text — not even in Settings). Changing a phrase is done only on
  the server (edit a gitignored `.env` and restart). Nothing in the locked app may reveal that a hiding
  feature exists.
- **Backend:** list endpoints exclude hidden rows by default and include them only with `?includeHidden=1`
  (`GET /api/categories?includeHidden=1`, `GET /api/debts?includeHidden=1`). `GET /api/networth`,
  `/api/networth/live`, and `/api/networth/history` likewise take `?includeHidden=1` to add hidden items
  to the totals. Create/update accept a `hidden` flag. So when NOT revealed, nothing hidden leaves the server.
- **Frontend:** when `revealed`, the app requests with `includeHidden=1`, shows hidden rows in the
  Categories/Debts/SnapshotEdit lists (subtly marked "ukryta"), the create/edit forms expose a `ukryta`
  checkbox that sets the `hidden` flag through the normal API, and the Dashboard totals/chart include them.
- **Remove entirely:** `web/src/lib/crypto.ts`, the encrypted-blob logic, the `secret_blob` table and its
  `/api/secret-blob` route, and any Web Crypto usage. The old `web/src/lib/vault.tsx` becomes a thin
  "reveal" context (plain boolean + phrase compare), or is replaced by one.
- PWA install still benefits from HTTPS, but the app (including hiding) works fully over plain HTTP.

## Trend / history endpoint

`GET /api/networth/history` returns an array (oldest→newest) of
`{ month, income_minor, income_currency, PLN, USD }` computed per snapshot from stamped snapshot FX,
excluding hidden by default and including hidden when `?includeHidden=1`. The Dashboard charts this.

## Screens (frontend)

1. **Dashboard** — net worth in PLN & USD, month-over-month trend chart (Recharts), income vs
   net-worth growth; the top "Szukaj / dodaj" input (reveal/hide trigger).
2. **Snapshot edit** — pick a month, enter/update each category value + monthly income.
3. **Categories** — CRUD, asset/liability, currency, ordering.
4. **Debts** — two sections (owed to me / I owe), CRUD, mark settled.
5. **Settings** — base/helper currencies, manual FX refresh, version & update check.
   (NO reveal/hide phrase UI — hiding must leave no trace in the app; phrases are server-side env only.)

## Layout

```
portfel/
  Dockerfile
  docker-compose.yml
  README.md
  server/   (Fastify + better-sqlite3; serves web build in prod)
  web/      (React + Vite PWA)
  data/     (runtime volume: sqlite.db + backups; gitignored)
```

## Versioning & releases (MANDATORY going forward)

- **Single source of truth:** the `version` field in the ROOT `package.json`, following **SemVer**
  (`MAJOR.MINOR.PATCH`). Current baseline: `0.1.0`.
- **Every change to the program bumps the version** — patch for fixes, minor for features, major for
  breaking changes — and adds an entry to `CHANGELOG.md` (newest first). Never ship code without bumping.
- The backend exposes **`GET /api/version`** → `{ version }` (read from the root `package.json`).
- The frontend shows the running version in the UI (footer + Settings), injected at build time from
  `package.json` via a Vite `define` (`__APP_VERSION__`).
- **PWA update check:** the app registers the service worker with update support and offers an explicit
  **"Sprawdź aktualizacje"** action that calls the SW registration `update()`, and — by comparing the
  built `__APP_VERSION__` with `GET /api/version` — tells the user whether a newer version is available
  and lets them reload to apply it. New SW versions also auto-update in the background.

## Deploy

- Multi-stage `Dockerfile`: build `web`, build `server`, final image runs server serving statics.
- `docker-compose.yml`: one service, port `3000:3000`, volume `./data:/app/data`. Access on LAN at
  `http://<server-ip>:3000`.
- Provide `npm` scripts to run locally without Docker (`server` on :3000, `web` dev on Vite proxy).

## Verification expectations

Code must build (`tsc` clean, `vite build` clean). Net worth must compute across mixed currencies.
Vault: typing `Alohomora` reveals hidden category and raises the total; `Obliviate` hides it and the
DB blob stays unreadable. Data must survive a server restart (SQLite file in `data/`).
