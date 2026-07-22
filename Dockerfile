# syntax=docker/dockerfile:1

####################################################################
# Stage 1: web-build — build the React/Vite PWA frontend -> web/dist
####################################################################
FROM --platform=linux/amd64 node:22-bookworm-slim AS web-build

WORKDIR /app

# Root package.json is read by web/vite.config.ts (-> ../package.json) to define
# __APP_VERSION__, so it must exist before the vite build.
COPY package.json ./package.json

# Install web deps
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

# Copy the rest of the web source and build (vite build -> /app/web/dist)
COPY web/ ./web/
RUN cd web && npx vite build


####################################################################
# Stage 2: server-build — compile TS + install prod node_modules
#          (build tools needed so better-sqlite3 builds native bindings)
####################################################################
FROM --platform=linux/amd64 node:22-bookworm-slim AS server-build

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL deps first (so devDeps like typescript are available for the build)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Compile TS -> /app/server/dist
COPY server/ ./server/
RUN cd server && npx tsc

# Now produce a clean production node_modules (better-sqlite3 built for linux)
RUN cd server && npm ci --omit=dev


####################################################################
# Stage 3: run — minimal runtime image
####################################################################
FROM --platform=linux/amd64 node:22-bookworm-slim AS run

# curl is used by the HEALTHCHECK
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Preserve the repo layout so the server's path resolution works unchanged:
#   /app/package.json          (root — read by /api/version)
#   /app/server/dist           (compiled server)
#   /app/server/node_modules   (production deps, better-sqlite3 built for linux)
#   /app/web/dist              (built frontend served by @fastify/static)
# The compiled server (__dirname = /app/server/dist) resolves:
#   web/dist  -> /app/server/dist/../../web/dist   = /app/web/dist  ✓
#   data dir  -> /app/server/dist/../../data       = /app/data      ✓
#   root pkg  -> /app/server/dist/../../package.json = /app/package.json ✓
# So no env overrides are required; default paths already match this layout.
COPY package.json ./package.json
COPY server/package.json ./server/package.json
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=web-build /app/web/dist ./web/dist

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

EXPOSE 3000

# Runtime volume: SQLite db + backups live here and survive container restarts.
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server/dist/index.js"]