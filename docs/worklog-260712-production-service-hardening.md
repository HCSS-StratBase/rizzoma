# Production service hardening worklog (2026-07-12)

## Scope

Move the accepted React/TipTap parity release from an unmanaged Vite/tsx pair
to a compiled, supervised, reversible production service without losing Redis
sessions or dirty Yjs collaboration state.

## Measured starting state

- Public nginx targeted Vite `:3100`, which proxied to the tsx API on `:8100`.
- Both active processes were root-owned, bare processes with no systemd unit.
- The rollback Vite/API lane remained on `:3000`/`:8788`.
- Redis and CouchDB containers were healthy but had Docker restart policy `no`.
- The public API had 51 Redis session keys, but no explicit
  `SESSION_SECRET`; it therefore used the known development fallback.
- Yjs dirty documents were persisted every 30 seconds with no signal-time
  flush. An ordinary process stop could lose the final edit interval.
- The public client used the working parity renderer. The native renderer was
  confirmed to be an opt-in, read-only prototype with lossy rich-content
  parsing; it was deliberately kept disabled.

## Implementation

- Added production loopback binding through `HOST`, defaulting to
  `127.0.0.1` in production and preserving LAN-friendly development binding.
- Added strict production session-secret validation and no-logout rotation via
  `SESSION_SECRET_PREVIOUS`.
- Extended `/api/health` so Redis-backed session persistence is a readiness
  dependency alongside CouchDB.
- Added Socket.IO shutdown, Redis client shutdown, and a signal handler that
  drains HTTP/WebSocket connections and flushes Yjs state before exit.
- Made Yjs persistence single-flight and version-aware, so an update arriving
  during a snapshot write cannot be incorrectly marked clean.
- Added three-attempt shutdown flushing; remaining dirty documents make the
  shutdown fail loudly instead of being discarded silently.
- Added an immutable blue/green systemd topology under `deploy/systemd/`, a
  one-time installer, and a candidate-only deployment helper. The helper
  intentionally cannot change public nginx.
- Replaced the obsolete Docker-era `scripts/deploy-vps.sh` behavior with exact
  SHA releases, compiled assets, lane ports `8101`/`8102`, and health/static
  gates.
- Removed a March planner-debug append from the live topic PATCH route. It was
  writing every production edit into a tracked screenshot artifact, dirtied
  every full test run, and conflicted with immutable release permissions.

## Verification before deployment

- `npm run typecheck`: passed.
- Focused readiness/session/Yjs tests: 27/27 passed.
- Full Vitest: 62 files, 292 passed, 3 skipped, 0 failed.
- Production build: passed; 3,298 modules transformed.
- Compiled lifecycle probe: built client returned HTTP 200 on loopback, then a
  real `SIGTERM` completed the graceful path and exited 0. Evidence:
  `screenshots/260712-1152-production-service-candidate/`.
- Shell syntax checks for both deployment scripts: passed.
- `git diff --check`: passed.
- Repository-wide lint remained 0 errors with 6,365 warnings; the warning
  backlog predates this batch and lint remains non-blocking in CI.
- An independent second-pass production review initially rejected the deploy
  path for unbounded dependency probes, active-lane restart risk, partial-build
  poisoning, weak SHA provenance, and underspecified session continuity. All
  five were corrected. The reviewer reran 27/27 focused tests, typecheck, shell
  syntax and diff checks and issued a final **GO** for commit/CI/canary.

## Immediate database exposure closure

The production audit found Docker publishing CouchDB `5984` and Redis `6379`
on all interfaces. The Hetzner Robot whitelist's accepted `5432-6543` range
also covered both ports. External tests confirmed CouchDB HTTP 200 and an
unauthenticated Redis `PONG`.

A persistent host `DOCKER-USER` rule now drops only TCP `5984,6379` arriving on
the public interface. Host-local CouchDB/Redis and public app health remained
green. External retest returned CouchDB HTTP 000 and Redis closed while public
`/api/health` returned 200. Evidence:
`screenshots/260712-1203-database-exposure-closure/`.

The follow-on audit confirmed active compromise: the attacker key, 1,257
`CONFIG SET` calls, 578 `SLAVEOF` calls, and repeated full RDB synchronization.
Root-only evidence was preserved, all 54 untrusted keys were flushed, Redis was
recreated clean, and both dependency ports plus all Rizzoma internal ports,
including the separately discovered legacy API at `8000`, were closed on the
public interface for IPv4 and IPv6. Old sessions are intentionally
invalid; the managed cutover uses a new secret with no previous verifier.
Evidence: `screenshots/260712-1218-redis-incident-response/`.

No Hetzner Robot firewall write occurred. The repository Compose declaration
now binds every published application and dependency port to loopback, while
the persisted host rules protect the still-running pre-change containers until
they are safely recreated from that declaration. The one-time systemd installer
applies the same controls idempotently so they are reproducible rather than
one-off shell fixes.

## Boundary

At this checkpoint the code and service design are locally verified but not
yet merged or deployed. Public traffic still targets the existing
`:3100`/`:8100` lane. HTTPS canary, exact-SHA deployment, graceful-restart
evidence, public Playwright acceptance, and nginx cutover remain mandatory
before the service can be called productionized.
