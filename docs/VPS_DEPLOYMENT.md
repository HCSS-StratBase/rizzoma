# VPS Deployment — Rizzoma on 138.201.62.161

**Last updated**: 2026-04-22 (post BUG #43 fix + VPS rebuild)

## Server details

| Field | Value |
|---|---|
| **IP** | `138.201.62.161` |
| **Port** | `8200` (public UI, Docker-mapped to container's `:3000`) |
| **URL** | `http://138.201.62.161:8200/` |
| **SSH** | `root@138.201.62.161` (key auth) |
| **Operator** | Hryhorii (first deployed 2026-04-17; co-owned with Stephan) |
| **Deployment path** | `/data/large-projects/stephan/rizzoma` |
| **Process** | Docker Compose (`rizzoma-app` container runs `npm run dev`) |
| **Persistent volumes** | `/data/volumes/stephan-rizzoma/{app,redis,couchdb,rabbitmq,sphinx,minio}` |
| **Auth account** | `hp@rizzoma.com` / `stratbase2026` |
| **Repo** | `HCSS-StratBase/rizzoma` on GitHub |
| **Current HEAD** | `c4844c73` (BUG #43 fix, deployed 2026-04-21 23:53 UTC) |

## What's running (as of 2026-04-22)

Docker-Compose stack:

| Container | Image | Port(s) |
|---|---|---|
| `rizzoma-app` | `rizzoma-app` (local build, dev target) | `8200:3000` |
| `rizzoma-couchdb` | `couchdb:3` | `5984:5984` |
| `rizzoma-redis` | `redis:7-alpine` | `6379:6379` |
| `rizzoma-rabbitmq` | `rabbitmq:3-management-alpine` | `5672:5672`, `15672:15672` |
| `rizzoma-minio` | `minio/minio:latest` | `9000:9000`, `9001:9001` |
| `rizzoma-mailhog` | `mailhog/mailhog:latest` | `1025:1025`, `8025:8025` |
| `rizzoma-clamav` | `clamav/clamav:latest` | `3310:3310` |

Sphinx is **not** running — it lives behind the `search` profile and is no longer a hard dependency (issue #42 fix, 2026-04-21).

## Container env (verified 2026-04-22)

Active env vars on the `rizzoma-app` container:

- `NODE_ENV=development`
- `FEAT_ALL=1` (BUG-discovered-on-VPS 2026-04-21, ships in c4844c73)
- `ALLOWED_ORIGINS=http://138.201.62.161:8200,http://localhost:8200,http://127.0.0.1:8200`
- `APP_BASE_URL=http://138.201.62.161:8200`
- `APP_URL=http://138.201.62.161:8200`
- `REDIS_URL=redis://redis:6379`
- `COUCHDB_URL=http://admin:password@couchdb:5984`
- `RABBITMQ_URL=amqp://rabbitmq:5672`
- `SESSION_SECRET=dev-secret-change-me` ← **TODO**: rotate for real deployment

OAuth providers **not configured** — no `GOOGLE_CLIENT_ID` / `FACEBOOK_APP_ID` / `MS_CLIENT_ID` in env. Sign-in buttons render disabled on the login page. Email sign-in (`hp@rizzoma.com` / `stratbase2026`) works. Wiring OAuth is a deployment-config task; see `ENV_VARIABLES.md` for the full set.

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
| `c4844c73` | 2026-04-21 | #43 | linksRouter route shadow fixed (gear-menu Delete blip works again). Also sphinx→profile (#42), FEAT_ALL=1. |
| `22e90c01` | 2026-04-18 | #41 | CSS gap — nested reply blips stripped of card styling |
| `5bb75bb6` | 2026-04-18 | #41 | "" (final CSS fix) |
| `222efc97` | 2026-04-17 | #40 | SOCKET_COOLDOWN_MS fix — grandchild creation now refreshes the topic |

All four commits are LIVE on the VPS container as of 2026-04-21 23:53 UTC.

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
- [x] ~~Confirm CouchDB + Redis are running and accessible~~ — all 7 containers healthy
- [ ] Rotate `SESSION_SECRET` from `dev-secret-change-me` before any non-team traffic
- [ ] Wire OAuth creds (Google at minimum) so team members can sign in without a shared local password
- [ ] Set up a simple deploy script (currently it's manual `git pull && docker compose up -d --build`)
- [ ] Decide on nginx/caddy + HTTPS before exposing beyond the HCSS team
