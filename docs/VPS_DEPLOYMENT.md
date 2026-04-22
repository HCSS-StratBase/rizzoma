# VPS Deployment — Rizzoma on 138.201.62.161

**Last updated**: 2026-04-23 (after late-night prod-build + CI gate work)

## Server details

| Field | Value |
|---|---|
| **IP** | `138.201.62.161` |
| **Dev port** | `8200` (UI; `rizzoma-app` dev target → container `:3000`) |
| **Prod port** | `8201` (UI; `rizzoma-app-prod` production target → container `:8788`) — green since 2026-04-22 |
| **URL** | `http://138.201.62.161:8200/` (dev) — HTTPS still blocked on Hetzner Cloud firewall |
| **SSH** | `root@138.201.62.161` (key auth) |
| **Operator** | Hryhorii (first deployed 2026-04-17; co-owned with Stephan) |
| **Deployment path** | `/data/large-projects/stephan/rizzoma` |
| **Process** | Docker Compose (`rizzoma-app` runs `npm run dev`; `rizzoma-app-prod` runs `node dist/server/server/app.js`) |
| **Persistent volumes** | `/data/volumes/stephan-rizzoma/{app,redis,couchdb,rabbitmq,sphinx,minio}` |
| **Auth account** | `hp@rizzoma.com` / `stratbase2026` |
| **Repo** | `HCSS-StratBase/rizzoma` on GitHub |
| **Current HEAD** | `b99fa4bf` (late-night prod-build path green + CI gates tightened, 2026-04-22) |

## What's running (as of 2026-04-23)

Docker-Compose stack:

| Container | Image | Port(s) | Notes |
|---|---|---|---|
| `rizzoma-app` | `rizzoma-app` (local build, **dev** target) | `8200:3000` | Vite + Express (`npm run dev`) |
| `rizzoma-app-prod` | `rizzoma-app` (local build, **production** target) | `8201:8788` | `node dist/server/server/app.js`, USER `node`, healthy since 2026-04-22 late-night |
| `rizzoma-couchdb` | `couchdb:3` | `5984:5984` | |
| `rizzoma-redis` | `redis:7-alpine` | `6379:6379` | Session store (Redis-backed via `connect-redis`) |
| `rizzoma-rabbitmq` | `rabbitmq:3-management-alpine` | `5672:5672`, `15672:15672` | |
| `rizzoma-minio` | `minio/minio:latest` | `9000:9000`, `9001:9001` | |
| `rizzoma-mailhog` | `mailhog/mailhog:latest` | `1025:1025`, `8025:8025` | |
| `rizzoma-clamav` | `clamav/clamav:latest` | `3310:3310` | |

Sphinx is **not** running — it lives behind the `search` profile and is no longer a hard dependency (issue #42 fix, 2026-04-21).

`app-prod` is the future cutover target. It runs the production bundle (built with `FEAT_ALL=1` so feature flags ship enabled) and the `node` user can write `/app/logs` (winston) + `/app/data/uploads` (uploads route) — both pre-created + chowned in the Dockerfile production stage.

## Container env (verified 2026-04-22 late-night, both `app` and `app-prod`)

Active env vars on both `rizzoma-app` and `rizzoma-app-prod` containers (same SHA256 hash for `SESSION_SECRET` — verified):

- `NODE_ENV=development` (dev) / `NODE_ENV=production` (prod)
- `FEAT_ALL=1` (closes the production-tree-shaking bug class — both #58 build-path and #43-companion dev-server path)
- `ALLOWED_ORIGINS=http://138.201.62.161:8200,http://138.201.62.161:8201,http://localhost:8200,http://127.0.0.1:8200`
- `APP_BASE_URL=http://138.201.62.161:8200`
- `APP_URL=http://138.201.62.161:8200`
- `REDIS_URL=redis://redis:6379` (sessions persist across container restarts)
- `COUCHDB_URL=http://admin:password@couchdb:5984`
- `RABBITMQ_URL=amqp://rabbitmq:5672`
- `SESSION_SECRET=b2DPa6...m-59` (rotated 2026-04-22 from `dev-secret-change-me`)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — wired (sourced from `/mnt/c/Rizzoma/.env`)
- `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` — wired
- `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` + `MICROSOFT_TENANT` — wired
- `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` + `SMTP_SECURE` — wired (Gmail SMTP for invite/notification emails)

OAuth sign-in buttons render and POST to `/api/auth/{google,facebook,microsoft}/start` correctly, but the OAuth provider redirects back to `https://138-201-62-161.nip.io/...` which **requires HTTPS** — currently 404 because Caddy/Let's Encrypt is blocked on the Hetzner Cloud firewall (port 80 inbound denied → ACME webroot challenge times out). HTTP-only OAuth is rejected by all three providers in 2026.

## How to update (verified procedure, 2026-04-21)

Hryhorii's local docker-compose.yml has VPS-specific overrides (ports, persistent volumes, `ALLOWED_ORIGINS` for the public IP). The stock upstream docker-compose matches on sphinx + FEAT_ALL but differs on these. When pulling:

```bash
ssh root@138.201.62.161
cd /data/large-projects/stephan/rizzoma

# Stash VPS-specific overrides before pull to avoid "your local changes
# would be overwritten" — the overrides are port mappings (8200:3000),
# persistent volume paths, and ALLOWED_ORIGINS. They're legitimate and
# should survive the pull.
git stash push docker-compose.yml -m "vps-overrides-$(date +%y%m%d)"
git pull --ff-only origin master
git stash pop

# If stash pop reports conflicts in docker-compose.yml, hand-merge:
# keep BOTH the upstream additions (FEAT_ALL, sphinx profile) AND the VPS
# overrides (8200:3000 port, ${RIZZOMA_VOLUMES_ROOT}/... volumes,
# 138.201.62.161-based ALLOWED_ORIGINS/APP_BASE_URL/APP_URL).

# Rebuild + restart
docker compose up -d --build app

# Verify
sleep 20
curl -s http://localhost:8200/api/health  # expect {"status":"ok", ...}
```

The `rizzoma-app` container picks up the current HEAD on rebuild. The
source code inside the image comes from `COPY . .` in `Dockerfile`'s
development stage — no bind mount of `src/`, so every source change
requires a rebuild.

## Recent fixes landed on VPS

| Commit | Date | Bug | What |
|---|---|---|---|
| `b99fa4bf` | 2026-04-22 | docs | Refresh after late-night prod-build + CI gate work |
| `87c5e988` | 2026-04-22 | #147 | CI typecheck + vitest hardened to true blocking gates |
| `40cfb0e2` | 2026-04-22 | prod-build | `/app/data/uploads` writable in production stage |
| `b6f8793d` | 2026-04-22 | prod-build | `/app/logs` writable in production stage (winston EACCES) |
| `b0ed1a15` | 2026-04-22 | prod-build | `parse5` promoted to direct dep (was transitive dev-only) |
| `aa63d4c5` | 2026-04-22 | prod-build | Production CMD path → `dist/server/server/app.js` |
| `c4844c73` | 2026-04-21 | #43 | linksRouter route shadow fixed (gear-menu Delete blip works again). Also sphinx→profile (#42), FEAT_ALL=1. |
| `22e90c01` | 2026-04-18 | #41 | CSS gap — nested reply blips stripped of card styling |
| `5bb75bb6` | 2026-04-18 | #41 | "" (final CSS fix) |
| `222efc97` | 2026-04-17 | #40 | SOCKET_COOLDOWN_MS fix — grandchild creation now refreshes the topic |

All commits live on VPS as of 2026-04-22 late-night. Both `rizzoma-app` (dev) and `rizzoma-app-prod` (production) rebuilt from the latest source.

## Known non-bug gotchas

1. **Port 8200 is direct Docker-mapped**, no reverse proxy (nginx) in front. If you ever need HTTPS / a real hostname, add caddy or nginx.
2. **CouchDB and Redis** are in the same compose network; the app reaches them by service name (`couchdb:5984`, `redis:6379`). `curl http://localhost:5984/` from the host works because the host port is mapped, but this is for admin/debug only — the app doesn't use the host-mapped ports.
3. **Docker-compose customizations are uncommitted on the VPS** by design — keep it that way unless you want to fork the VPS config to a separate file (e.g. `docker-compose.vps.yml`).

## Relationship to other environments

| Environment | URL | Purpose |
|---|---|---|
| **Localhost (dev)** | `http://localhost:3000` (UI), `:8788` (API) | Development + testing (Stephan's WSL) |
| **VPS** | `http://138.201.62.161:8200` | Shared team instance (Hryhorii, Liliia) |
| **Original Rizzoma** | `https://rizzoma.com` | Legacy platform (still running, read-only reference) |
| **Tailscale tunnel** | `tail4ee..ts.net` | Hryhorii's earlier tunnel — deprecated now that VPS is public |

## Action items

- [x] ~~Confirm exact deployment path on VPS~~ — `/data/large-projects/stephan/rizzoma`
- [x] ~~Pull latest code including BUG #40 fix~~ — done; #40, #41, #42, #43 all live
- [x] ~~Verify nested blips work on the VPS after pull~~ — verified 2026-04-21
- [x] ~~Confirm CouchDB + Redis are running and accessible~~ — all 8 containers healthy (incl. app-prod)
- [x] ~~Rotate `SESSION_SECRET` from `dev-secret-change-me`~~ — rotated 2026-04-22 to `b2DPa6...m-59`
- [x] ~~Wire OAuth creds~~ — Google + Facebook + Microsoft + SMTP all wired into both `app` and `app-prod` services 2026-04-22
- [x] ~~Set up a simple deploy script~~ — `scripts/deploy-vps.sh` (handles stash + pull + restore + rebuild + health check; supports `--profile prod`)
- [x] ~~Switch to production build target~~ — `app-prod` healthy on `:8201` since 2026-04-22 late-night
- [ ] HTTPS via Caddy + Let's Encrypt — **BLOCKED** on Hetzner Cloud firewall denying inbound :80 (ACME webroot challenge times out). Open port 80 in Hetzner Cloud Console → re-run `setup-caddy.sh` on VPS. Until then, OAuth callbacks fail and the site is HTTP-only.
- [ ] Cut over public traffic from `:8200` (dev) to `:8201` (prod) once HTTPS lands
- [ ] Enable Hetzner Robot webservice (currently 401 — needs activation in Robot panel) as an alternative firewall-management path
