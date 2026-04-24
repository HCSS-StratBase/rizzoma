# VPS Deployment — Rizzoma on 138.201.62.161

**Last updated**: 2026-04-23 23:55 CEST (toolbar-inline smoke repaired after prod cutover)

## Server details

| Field | Value |
|---|---|
| **IP** | `138.201.62.161` |
| **Dev port** | `8200` (UI; `rizzoma-app` dev target → container `:3000`) |
| **Prod port** | `8201` (UI; `rizzoma-app-prod` production target → container `:8788`) — green since 2026-04-22 |
| **URL (HTTPS)** | `https://138-201-62-161.nip.io/` — Let's Encrypt cert + nginx proxy → `localhost:8201` (`rizzoma-app-prod`, cut over 2026-04-23 23:24 CEST) |
| **URL (HTTP, legacy)** | `http://138.201.62.161:8200/` (dev, direct Docker port-mapped) |
| **SSH** | `root@138.201.62.161` (key auth) |
| **Operator** | Hryhorii (first deployed 2026-04-17; co-owned with Stephan) |
| **Deployment path** | `/data/large-projects/stephan/rizzoma` |
| **Process** | Docker Compose (`rizzoma-app` runs `npm run dev`; `rizzoma-app-prod` runs `node dist/server/server/app.js`) |
| **Persistent volumes** | `/data/volumes/stephan-rizzoma/{app,redis,couchdb,rabbitmq,sphinx,minio}` |
| **Auth account** | `hp@rizzoma.com` / `stratbase2026` |
| **Repo** | `HCSS-StratBase/rizzoma` on GitHub |
| **Current documented source** | local `master`, refreshed 2026-04-23 22:55 CEST |
| **Last verified VPS code baseline** | VPS working copy `40cfb0e2` plus VPS-local compose overrides and mirrored docs; public HTTPS now targets prod `:8201` |

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

`app-prod` is now the public HTTPS target. It runs the production bundle (built with `FEAT_ALL=1` so feature flags ship enabled) and the `node` user can write `/app/logs` (winston) + `/app/data/uploads` (uploads route) — both pre-created + chowned in the Dockerfile production stage.

## Public prod cutover (2026-04-23 23:24 CEST)

Nginx was changed from `proxy_pass http://127.0.0.1:8200;` to `proxy_pass http://127.0.0.1:8201;` in `/etc/nginx/sites-available/rizzoma.conf`, validated with `nginx -t`, and reloaded. A server backup exists at `/etc/nginx/sites-available/rizzoma.conf.bak-20260423-prod-cutover`.

Post-cutover smoke exposed a stale running `app-prod` env: `CLIENT_URL` / `ALLOWED_ORIGINS` still pointed at the direct `:8200` origin, causing authenticated public prod requests to fail CORS. The compose file already had the correct HTTPS env, so only the running service was stale. Recreated prod with:

```bash
cd /data/large-projects/stephan/rizzoma
docker compose up -d --no-deps app-prod
```

Verified after recreation:
- Public `https://138-201-62-161.nip.io/api/health` returns from prod.
- `docker exec rizzoma-app-prod env` shows `CLIENT_URL=https://138-201-62-161.nip.io`, `APP_BASE_URL=https://138-201-62-161.nip.io`, `APP_URL=https://138-201-62-161.nip.io`, and `ALLOWED_ORIGINS` includes the HTTPS origin.
- Google OAuth start redirects to Google with `redirect_uri=https%3A%2F%2F138-201-62-161.nip.io%2Fapi%2Fauth%2Fgoogle%2Fcallback`.
- Public prod `test:follow-green` passes desktop and mobile; artifacts live under `screenshots/260423-prod-cutover/follow-green/`.
- Public prod `test:toolbar-inline` still fails after scoped `Done`, waiting for the read toolbar to reappear. Direct dev `http://138.201.62.161:8200` fails the same way, so this is not a cutover regression, but it is now the top browser-smoke bug.

## Container env (verified 2026-04-23 after HTTPS/OAuth work)

Active env vars on both `rizzoma-app` and `rizzoma-app-prod` containers (same SHA256 hash for `SESSION_SECRET` — verified):

- `NODE_ENV=development` (dev) / `NODE_ENV=production` (prod)
- `FEAT_ALL=1` (closes the production-tree-shaking bug class — both #58 build-path and #43-companion dev-server path)
- `ALLOWED_ORIGINS` includes `https://138-201-62-161.nip.io` plus the local/direct service origins needed for debugging
- `APP_BASE_URL=https://138-201-62-161.nip.io`
- `APP_URL=https://138-201-62-161.nip.io`
- `CLIENT_URL=https://138-201-62-161.nip.io`
- `REDIS_URL=redis://redis:6379` (sessions persist across container restarts)
- `COUCHDB_URL=http://admin:password@couchdb:5984`
- `RABBITMQ_URL=amqp://rabbitmq:5672`
- `SESSION_SECRET=b2DPa6...m-59` (rotated 2026-04-22 from `dev-secret-change-me`)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — wired (sourced from `/mnt/c/Rizzoma/.env`)
- `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` — wired
- `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` + `MICROSOFT_TENANT` — wired
- `SMTP_HOST` + `SMTP_PORT` + `SMTP_USER` + `SMTP_PASS` + `SMTP_SECURE` — wired (Gmail SMTP for invite/notification emails)

OAuth status as of 2026-04-23:
- Google OAuth is verified end-to-end over HTTPS. Playwright sign-in returns to the app as `sdspieg@gmail.com` "Stephan De Spiegeleire" with the Google avatar, and `/api/auth/me` returns the authenticated user.
- HTTPS is live through nginx + Let's Encrypt at `https://138-201-62-161.nip.io/`; port 80 was opened in the Hetzner Robot host firewall for ACME.
- Container outbound now works after consolidating the Robot firewall `apps` rule (`8000-9999`) into `apps-and-ephemeral` (`8000-65535`) so MASQUERADE return traffic to ephemeral source ports is allowed.
- Facebook and Microsoft credentials are wired, but their provider-console callback URLs still need to be added when those sign-in buttons are needed.

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
| pending local | 2026-04-24 | visual coverage | Rebuilt `app-prod` with realtime cursor/typing fixes, production Vite feature-flag hardening, mobile topic-content capture support, local avatar fallbacks, compact mobile editor toolbar CSS, and coverage validation that verifies screenshot files exist. Public prod health passed at `https://138-201-62-161.nip.io/api/health`; latest evidence folder is `screenshots/260424-025320-feature-sweep/` with 42 screenshots, 0 screenshot gaps, and a 98 green / 63 orange / 0 red verdict. |
| `b99fa4bf` | 2026-04-22 | docs | Refresh after late-night prod-build + CI gate work |
| `907b1972` | 2026-04-23 | toolbar smoke | Scoped `Done` no longer re-enters edit mode; deployed to both `rizzoma-app-prod` and `rizzoma-app` on the VPS |
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
- [x] ~~HTTPS via Let's Encrypt~~ — DONE 2026-04-23 03:26 UTC. Live at `https://138-201-62-161.nip.io/`. Process: queried Hetzner Robot host firewall via `GET /firewall/<ip>` (turned out to be a whitelist-mode firewall missing port 80 — NOT a "Hetzner Cloud firewall" as previously assumed); added `http(80)` rule via `POST /firewall/<ip>` preserving the full ruleset; ran certbot webroot challenge against existing nginx; swapped nginx vhost to HTTPS proxy → `localhost:8200` with WebSocket support + 20M `client_max_body_size`; updated docker-compose env (`APP_URL`/`CLIENT_URL`/`APP_BASE_URL`/`ALLOWED_ORIGINS`) to use the HTTPS URL. Verified end-to-end: `curl /api/health` → 200, SPA loads, `/api/auth/google` redirects to Google with the correct HTTPS callback.
- [x] ~~**USER ACTION**: add `https://138-201-62-161.nip.io/api/auth/google/callback` to Google Cloud Console~~ — DONE 2026-04-23 by SDS. Plus the same fix unblocked OAuth end-to-end (verified Playwright sign-in: `sdspieg@gmail.com` "Stephan De Spiegeleire" with avatar). Required ALSO consolidating the Hetzner Robot host firewall `apps` rule (8000-9999) into `apps-and-ephemeral` (8000-65535) to allow return traffic from MASQUERADE'd outbound connections — without that, container couldn't reach `oauth2.googleapis.com/token` to exchange the auth code. Robot API has a hard limit of 10 input rules; consolidating apps was the way to fit ephemeral coverage in.
- [ ] **USER ACTION (Facebook / Microsoft)**: add the same callback paths for Facebook (`/api/auth/facebook/callback`) and Microsoft (`/api/auth/microsoft/callback`) in their respective developer consoles when those providers are needed.
- [x] ~~Cut over public traffic from `:8200` (dev container) to `:8201` (prod container)~~ — DONE 2026-04-23 23:24 CEST. One nginx `proxy_pass` line changed and reloaded; stale prod CORS/app URL env fixed by recreating `app-prod`; health/OAuth-start/follow-green verified. Residual: toolbar-inline smoke fails after scoped `Done` on both prod and direct dev.
- [x] ~~Repair `test:toolbar-inline` after cutover~~ — DONE 2026-04-23 23:55 CEST. Root cause: `Done` exited edit mode on `mousedown`, then the same click sequence could hit the newly rendered read-mode `Edit` button and immediately re-enter edit mode. Fix: suppress `mousedown` but finish on `click`; smoke selectors now scope all toolbar interactions to the created blip. Rebuilt both `app-prod` and `app`; public prod + direct dev toolbar smokes pass.
- [x] ~~Enable Hetzner Robot webservice~~ — turns out it was always enabled; the `HETZNER_ROBOT_PASS` value in `.env` was wrong (actually a stale root SSH password). Working creds in the [Hetzner SSH saga doc](https://drive.google.com/file/d/10OIjlF0oE8s9Xa-jr5-WHhdqPHXGhtEJ/view?usp=drivesdk): user `#ws+MMV3d9rH`, password `5Js4m@rMKuEAWG7`.
