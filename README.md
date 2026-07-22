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

## Wdrożenie (Docker)

Aplikacja działa w jednym kontenerze —Fastify serwuje API i zbudowany frontend
PWA na tym samym porcie `3000`. Wymagania: zainstalowane `docker` + `docker compose`.

```bash
# 1. Pobierz repozytorium na serwer domowy
git clone <adres-repo> portfel
cd portfel

# 2. Zbuduj i uruchom kontener w tle
docker compose up -d --build

# 3. Otwórz w przeglądarce (zamiast SERVER_IP wstaw IP serwera w sieci LAN)
#    http://SERVER_IP:3000
```

### Aktualizacja

```bash
git pull
docker compose up -d --build
```

Nowa wersja aplikacji zostanie pobrana po odświeżeniu strony (PWA sam
sprawdza aktualizacje w sekcji **Ustawienia → Sprawdź aktualizacje**).

### Dane i kopie zapasowe

Baza SQLite i backupy żyją w wolumenie `./data` (bind-mount do `/app/data` w
kontenerze). Pojedynczy plik bazy to:

```
data/sqlite.db
```

Kopia zapasowa = skopiowanie tego pliku (najlepiej po zatrzymaniu kontenera):

```bash
docker compose stop
cp data/sqlite.db data/sqlite.db.bak
docker compose start
```

### Uwaga o HTTPS i PWA

Sama aplikacja (w tym ukrywanie kategorii przez frazę `Alohomora`/`Obliviate`)
poprawnie działa przez zwykłe `http://SERVER_IP:3000`. Natomiast **instalacja
PWA** na urządzeniach mobilnych z ekranu domowego wymaga bezpiecznego kontekstu
(HTTPS lub `localhost`). Aby możliwa była instalacja PWA przez LAN, postaw
aplikację za reverse proxy z TLS (np. Caddy/Nginx + certyfikat) wystawiającym
HTTPS na domenę/URL, który wskazuje na `http://SERVER_IP:3000`.

## Stage status

- **Stage 1 — backend scaffold, DB, FX, REST routes:** DONE.
- **Stage 2 — frontend PWA:** TODO.
- **Stage 3 — Dockerfile, compose, deploy docs:** DONE.