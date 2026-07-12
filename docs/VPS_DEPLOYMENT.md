# VPS Deployment — Rizzoma on 138.201.62.161

**Last updated**: 2026-07-13 (exact PR #72 blue deployment; BLB creation blocker open)

> **Current runtime truth:** exact merged master
> `5e1bc271e81613768e811cfc306c0c691e71d77b` is public through both nginx
> vhosts to compiled, systemd-managed blue `:8101`. Green `:8102` is
> stopped/disabled. Public health reports CouchDB, Redis, and ClamAV ready; the
> deployed client assets are `main-C53x9A2I.js` and `main-BNWeJdg2.css`.
> Root-only rollback capture: `/root/rizzoma-cutover-read-marker-20260713-010447`.
>
> PR #72 passed every required check and the public phase-2 acceptance matrix
> passed 49/49 with zero unexpected browser errors and Follow-the-Green
> 2 -> 1 -> 0. The final restart/reset/responsive phase produced no report and
> is not counted as accepted. SDS's first manual use then exposed a more basic
> release blocker: fresh content is not guaranteed to be a bullet list, so the
> recursive BLB label-to-`[+]` paradigm is not functional end to end. The
> service is healthy and the read-marker fix is live, but the product is
> **deployed, not accepted**.

> **Application merged, not yet public:** PR
> [#66](https://github.com/HCSS-StratBase/rizzoma/pull/66) merged as `bacb8a50`
> after all seven GitHub checks passed on source head `b8c9d110`; the underlying
> audited local run passed 107/107 test files (588 passed, 3 skipped),
> typecheck, full-source ESLint `--quiet`, a 3,314-module production build,
> responsive Playwright, and an independent GO audit. Public production remains
> on the earlier parity release. PR #67 merged, but its first private candidate
> revealed npm production dependency drift and was held before cutover. The
> required next operation is a corrected immutable exact-master deployment to the
> inactive managed lane, followed by the zero-overlap drain below and full
> public acceptance. Do not expose a candidate lane while the old process-local
> Yjs cache can still receive writes.

> **Managed-service candidate (not yet public):** branch
> `fix/lockfile-driven-production-install` replaces the obsolete Docker-era deploy
> helper with immutable exact-SHA releases and systemd blue/green lanes on
> loopback `:8101`/`:8102`. It also adds graceful Yjs/Socket.IO/Redis shutdown,
> production session-secret rotation, Redis/ClamAV readiness, fail-closed
> rollback, and a second lockfile-driven production-only install after build. The authoritative
> target procedure is the [managed VPS deployment guide](../deploy/systemd/README.md).
> Until merge, direct preflight, zero-overlap maintenance drain, and atomic
> both-vhost cutover are complete, the runtime
> truth immediately below remains authoritative.

> **Database exposure closed 2026-07-12 12:03 CEST:** Docker still declares
> CouchDB `5984` and Redis `6379` on all interfaces, and the Hetzner Robot
> `5432-6543` allow rule includes both. External probes had confirmed CouchDB
> HTTP 200 and unauthenticated Redis `PONG`. A persistent `DOCKER-USER` rule now
> drops only those two ports on public interface `enp0s31f6` for IPv4 and IPv6;
> a dual-stack INPUT rule also closes every internal Rizzoma port, including
> the previously missed legacy API at `8000`. The follow-on
> audit confirmed active Redis manipulation. Root-only evidence was preserved,
> 54 keys were flushed, and Redis was recreated clean. External dependencies
> and direct APIs are closed while public HTTPS health remains green. Evidence:
> `screenshots/260712-1218-redis-incident-response/`. Loopback-only Docker
> publication remains the cleaner future recreation target.

> **⚠️ CURRENT RUNTIME TRUTH — the Docker application topology below is
> historical.** Public nginx now targets Vite `:3100`, which proxies to API
> `:8100` from `/data/large-projects/stephan/rizzoma_merge` at exact merged
> commit `fe6988fb`. The checkout later advanced cleanly to docs/evidence commit
> `3a55155a`; running application code did not change. The API uses RedisStore
> and `NODE_ENV=production`.
> The former public lane remains healthy for immediate rollback: Vite `:3000`
> plus API `:8788` from `/data/large-projects/stephan/rizzoma_260612` at
> `daa3f2f3`. Nginx rollback backup:
> `/root/rizzoma.conf.pre-pr60-20260712-052206`.
>
> The public frontend is **Vite's development server**, serving source modules
> with `MODE=development`; it is not a compiled production frontend. Its live
> flags are `FEAT_ALL=1`, `FEAT_RIZZOMA_PARITY_RENDER=1`, and
> `FEAT_RIZZOMA_NATIVE_RENDER` unset. Production therefore uses the React/TipTap
> parity path. `NativeWaveView` is still read-only and is not publicly enabled.
>
> Both lanes are unmanaged bare Node/Vite processes. They share CouchDB
> database `project_rizzoma`; only the active lane is Redis-backed for sessions.
> The `dev.138-201-62-161.nip.io` vhost reaches the same `:3100` lane, which now
> intentionally uses the public OAuth callback environment. The legacy
> `:3001` Vite / `:8000` API pair was subsequently verified from process CWD
> and command lines as an obsolete Rizzoma lane; both are now blocked only on
> the public interface while remaining locally reachable. The old
> `scripts/deploy-vps.sh` and Docker instructions below do not describe the live
> deployment and must not be used until the service topology is rebuilt.

Production acceptance for PR [#60](https://github.com/HCSS-StratBase/rizzoma/pull/60)
is preserved under `screenshots/260712-0530-pr60-production-final/`: health and
OAuth passed, public collaboration passed 10/10, strict desktop/mobile unread
navigation persisted `2 → 1 → 0`, the API recorded zero 5xx responses, and the
required 1280/1366/1440/1600 visual sweep was inspected. A later 05:58 CEST
snapshot measured 395 requests / 0 5xx in the current API log after 2,279
seconds of uptime; treat that as a short post-cutover sample, not a soak.

## Current blue/green deployment and rollback

1. Fetch the desired `master` commit in the inactive checkout and verify its Git
   tree against the already accepted candidate. Require zero tracked changes;
   preserve all untracked runtime/backup files.
2. Check out the exact commit detached. Never deploy an unpinned branch name.
3. Restart only the inactive API/Vite lane with explicit `PORT`, `VITE_PORT`,
   `VITE_API_TARGET`, public `APP_URL`/`APP_BASE_URL`/`CLIENT_URL`, allowed
   origins, `FEAT_ALL=1`, `FEAT_RIZZOMA_PARITY_RENDER=1`, and the verified Redis
   URL. Load secrets from the preserved live environment file without printing
   it.
4. Before exposure, verify only direct candidate health, Redis readiness,
   compiled assets, old-cookie rejection, and journal cleanliness. Never point
   dev at the candidate while the old lane can still receive writes.
5. Start a brief maintenance drain: back up both vhosts and the exact old
   process recipe, stop old Vite to sever WebSockets, leave the isolated old API
   up for at least 35 seconds, verify zero connections/no snapshot errors, then
   stop it.
6. Point both public and dev vhosts at the managed lane, validate nginx, reload,
   and only then run full HTTPS acceptance: fresh login/restart continuity,
   immediate-pre-restart edit persistence, OAuth, two-browser collaboration,
   Follow-the-Green `2 → 1 → 0`, and inspected viewport PNGs.
7. Never keep both lanes write-capable. Rollback means draining/stopping the
   managed lane before restarting the exact former recipe and restoring nginx.

## Historical Docker-era server details (do not use for current deployment)

| Field | Value |
|---|---|
| **IP** | `138.201.62.161` |
| **Dev port** | `8200` (UI; `rizzoma-app` dev target → container `:3000`) |
| **Prod port** | `8201` (UI; `rizzoma-app-prod` production target → container `:8788`) — green since 2026-04-22 |
| **URL (HTTPS)** | `https://138-201-62-161.nip.io/` — Let's Encrypt cert + nginx proxy → `localhost:8200` (live since 2026-04-23 03:26 UTC) |
| **URL (HTTP, legacy)** | `http://138.201.62.161:8200/` (dev, direct Docker port-mapped) |
| **SSH** | `root@138.201.62.161` (key auth) |
| **Operator** | Hryhorii (first deployed 2026-04-17; co-owned with Stephan) |
| **Deployment path** | `/data/large-projects/stephan/rizzoma` |
| **Process** | Docker Compose (`rizzoma-app` runs `npm run dev`; `rizzoma-app-prod` runs `node dist/server/server/app.js`) |
| **Persistent volumes** | `/data/volumes/stephan-rizzoma/{app,redis,couchdb,rabbitmq,sphinx,minio}` |
| **Auth account** | `hp@rizzoma.com` / `stratbase2026` |
| **Repo** | `HCSS-StratBase/rizzoma` on GitHub |
| **Current HEAD** | `b99fa4bf` (late-night prod-build path green + CI gates tightened, 2026-04-22) |

## Historical Docker stack (as of 2026-04-23; no longer serving public traffic)

Docker-Compose stack:

| Container | Image | Port(s) | Notes |
|---|---|---|---|
| `rizzoma-app` | `rizzoma-app` (local build, **dev** target) | `8200:3000` | Vite + Express (`npm run dev`) |
| `rizzoma-app-prod` | `rizzoma-app` (local build, **production** target) | `8201:8788` | `node dist/server/server/app.js`, USER `node`, healthy since 2026-04-22 late-night |
| `rizzoma-couchdb` | `couchdb:3` | `127.0.0.1:5984:5984` | |
| `rizzoma-redis` | `redis:7-alpine` | `127.0.0.1:6379:6379` | Session store (Redis-backed via `connect-redis`) |
| `rizzoma-rabbitmq` | `rabbitmq:3-management-alpine` | `127.0.0.1:5672:5672`, `127.0.0.1:15672:15672` | |
| `rizzoma-minio` | `minio/minio:latest` | `127.0.0.1:9000:9000`, `127.0.0.1:9001:9001` | |
| `rizzoma-mailhog` | `mailhog/mailhog:latest` | `127.0.0.1:1025:1025`, `127.0.0.1:8025:8025` | |
| `rizzoma-clamav` | `clamav/clamav:latest` | `127.0.0.1:3310:3310` | |

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

## Historical Docker update procedure (2026-04-21; do not use)

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
- [x] ~~HTTPS via Let's Encrypt~~ — DONE 2026-04-23 03:26 UTC. Live at `https://138-201-62-161.nip.io/`. Process: queried Hetzner Robot host firewall via `GET /firewall/<ip>` (turned out to be a whitelist-mode firewall missing port 80 — NOT a "Hetzner Cloud firewall" as previously assumed); added `http(80)` rule via `POST /firewall/<ip>` preserving the full ruleset; ran certbot webroot challenge against existing nginx; swapped nginx vhost to HTTPS proxy → `localhost:8200` with WebSocket support + 20M `client_max_body_size`; updated docker-compose env (`APP_URL`/`CLIENT_URL`/`APP_BASE_URL`/`ALLOWED_ORIGINS`) to use the HTTPS URL. Verified end-to-end: `curl /api/health` → 200, SPA loads, `/api/auth/google` redirects to Google with the correct HTTPS callback.
- [x] ~~**USER ACTION**: add `https://138-201-62-161.nip.io/api/auth/google/callback` to Google Cloud Console~~ — DONE 2026-04-23 by SDS. Plus the same fix unblocked OAuth end-to-end (verified Playwright sign-in: `sdspieg@gmail.com` "Stephan De Spiegeleire" with avatar). Required ALSO consolidating the Hetzner Robot host firewall `apps` rule (8000-9999) into `apps-and-ephemeral` (8000-65535) to allow return traffic from MASQUERADE'd outbound connections — without that, container couldn't reach `oauth2.googleapis.com/token` to exchange the auth code. Robot API has a hard limit of 10 input rules; consolidating apps was the way to fit ephemeral coverage in.
- [ ] **USER ACTION (Facebook / Microsoft)**: add the same callback paths for Facebook (`/api/auth/facebook/callback`) and Microsoft (`/api/auth/microsoft/callback`) in their respective developer consoles when those providers are needed.
- [ ] Cut over public traffic from `:8200` (dev container, current HTTPS proxy target) to `:8201` (prod container) — change one `proxy_pass` line in `/etc/nginx/sites-available/rizzoma.conf` and reload nginx.
- [x] ~~Enable Hetzner Robot webservice~~ — turns out it was always enabled; the `HETZNER_ROBOT_PASS` value in `.env` was wrong (actually a stale root SSH password). Working creds in the [Hetzner SSH saga doc](https://drive.google.com/file/d/10OIjlF0oE8s9Xa-jr5-WHhdqPHXGhtEJ/view?usp=drivesdk): user `#ws+MMV3d9rH`, password `5Js4m@rMKuEAWG7`.
