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
rates (or latest cached rates for the live/current view). When the vault is **locked**, hidden
categories/debts are excluded entirely (plausible deniability). When unlocked, the frontend adds
them locally to the displayed totals.

## Secret vault (plausible deniability) — critical feature

Threat model: the DB and the running app must give NO hint that hidden data exists. Achieve this by
storing hidden data ONLY as an opaque encrypted blob and by NEVER storing the magic phrase anywhere.

- The app has NO login. A top-of-dashboard input labeled like a normal **"Szukaj / dodaj"** field is
  the trigger. It behaves as a real search box for normal input; the vault reaction is a side effect.
- **Unlock = successful decryption (no stored phrase).** When the user submits text in that field,
  the frontend fetches `secret_blob` (salt, iv, ciphertext), derives an AES-GCM key with **PBKDF2**
  (Web Crypto `crypto.subtle`) from `typedText + salt`, and TRIES to decrypt. If the GCM tag verifies,
  it was the right phrase → unlock: hold the decrypted hidden categories/values/debts **in memory only**
  and add them to the displayed totals. If it fails, do nothing special (just normal search) — so a
  wrong word is indistinguishable from an ordinary search. The user's chosen passphrase (default the
  user sets is `Alohomora`) is therefore never stored — only its ability to decrypt proves it.
- **Lock:** typing the lock phrase `Obliviate` (a client-side constant, not a secret) wipes the
  decrypted data from memory and recomputes totals without it. Also auto-lock on page reload/unload.
- **Do NOT store `vault_unlock_phrase` / `vault_lock_phrase` in the `settings` table** — that would leak
  the magic word to anyone reading the DB. Remove them from the db seed. `Obliviate` may be a frontend const.
- **Hidden items live ONLY inside the encrypted blob.** Never write hidden categories/debts/values into
  the plain `categories` / `snapshot_values` / `debts` tables. (The `hidden` columns that already exist in
  the schema must stay `0`/unused for real data; do not rely on them for hiding.) The blob is a JSON doc:
  `{ version, categories:[{tempId,name,type,currency,values:{'YYYY-MM':amount_minor}}], debts:[...] }`.
- Server sees only ciphertext (base64) via the opaque `/api/secret-blob` GET/PUT/DELETE. It never decrypts.
- Never persist the derived key or passphrase to localStorage/sessionStorage.
- Note in README: Web Crypto `subtle` and PWA install require a **secure context** (HTTPS or
  `localhost`); over plain `http://<lan-ip>` browsers may block them — document the HTTPS/reverse-proxy option.

## Trend / history endpoint

Add `GET /api/networth/history` to the backend: returns an array (oldest→newest) of
`{ month, income_minor, income_currency, PLN, USD }` computed per snapshot from stamped snapshot FX,
excluding hidden (there are none in plain tables). The Dashboard charts this; when the vault is
unlocked the frontend adds each hidden category's per-month value on top, locally.

## Screens (frontend)

1. **Dashboard** — net worth in PLN & USD, month-over-month trend chart (Recharts), income vs
   net-worth growth; the top "Szukaj / dodaj" input (vault trigger).
2. **Snapshot edit** — pick a month, enter/update each category value + monthly income.
3. **Categories** — CRUD, asset/liability, currency, ordering.
4. **Debts** — two sections (owed to me / I owe), CRUD, mark settled.
5. **Settings** — vault phrases, base/helper currencies, manual FX refresh.

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
