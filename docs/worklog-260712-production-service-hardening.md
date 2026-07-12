# Production service hardening worklog (2026-07-12)

## Scope

Move the accepted React/TipTap parity release from an unmanaged Vite/tsx pair
to a compiled, supervised, reversible production service. Preserve dirty Yjs
collaboration state while intentionally invalidating the exposed Redis sessions.

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
- Focused shutdown/readiness/session/Yjs tests: 31/31 passed.
- Full Vitest: 63 files, 299 passed, 3 skipped, 0 failed.
- Production build: passed; 3,298 modules transformed.
- Compiled lifecycle probe: built client returned HTTP 200 on loopback, then a
  real `SIGTERM` completed the graceful path and exited 0. Evidence:
  `screenshots/260712-1152-production-service-candidate/`.
- Shell syntax checks for both deployment scripts: passed.
- `git diff --check`: passed.
- Repository-wide lint remained 0 errors with 6,365 warnings; the warning
  backlog predates this batch and lint remains non-blocking in CI.
- Independent production review repeatedly held the deploy at **NO-GO** until
  dependency retries, active-lane refusal, partial-build cleanup, SHA
  provenance, session invalidation, dirty-document retention, shutdown order,
  Docker binding, weak-secret rejection, upload continuity, and split-brain
  draining were explicit and tested. Final review remains a gate before merge.

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

Process CWD and command-line inspection corrected an older deployment note:
`:3001` is a Rizzoma Vite process and `:8000` is its Rizzoma tsx API, both from
`/data/large-projects/stephan/rizzoma_260612`. They are obsolete internal
listeners, not unrelated services, so public-interface containment does not
break another application contract.

The final review also closed four durability gaps before merge: dirty Yjs
documents are never TTL-evicted until CouchDB persistence succeeds; Yjs
snapshot requests use bounded three-second calls and independent blips persist
concurrently; HTTP requests and collaborative state fully drain before Redis
sessions close; and production rejects placeholder, short, or weak previous
session secrets. Docker's production profile now listens on its container
interface behind a loopback-only host mapping and requires an explicit strong
secret.

Cold-boot supervision now starts all Docker dependencies and retries their
real Redis/CouchDB/ClamAV readiness for up to 180 seconds inside one systemd start,
instead of consuming the five-start rate limit during a slow Couch recovery.

The cutover procedure now forbids any live dual-writer overlap, including the
usual dev-vhost canary. Because Socket.IO rooms and Yjs caches are process-local,
old Vite/WebSockets stop first, the isolated old API receives a 35-second
snapshot window, and reaches zero connections before both vhosts switch to the
candidate. Full HTTPS write acceptance runs only after that atomic transition.
Rollback retains exact artifacts and commands, not live clients.

Upload continuity was measured before cutover: both legacy checkout upload
directories and `/var/lib/rizzoma/uploads` contain exactly **0 files / 0
bytes**, so no payload migration is required for this cutover.

No Hetzner Robot firewall write occurred. The repository Compose declaration
now binds every published application and dependency port to loopback, while
the persisted host rules protect the still-running pre-change containers until
they are safely recreated from that declaration. The one-time systemd installer
applies the same controls idempotently so they are reproducible rather than
one-off shell fixes.

## Boundary

PR #64 has since merged and its exact SHA is running as the private blue
candidate. Public traffic still targets the existing `:3100`/`:8100` lane.
Zero-overlap maintenance drain, both-vhost cutover, exact edit/session restart
evidence, and public Playwright acceptance remain mandatory before the service
can be called productionized.

## Merged candidate deployment

PR #64 merged as `2595d2de`. Both dependency containers now publish only on
host loopback. The immutable blue candidate is active under systemd and passed
compiled-asset, old-cookie-rejection, health, and real cold-dependency restart
checks; stopped Redis/CouchDB reached candidate readiness in 5,197 ms with no
service retry or shutdown error. Evidence:
`screenshots/260712-1300-managed-production-candidate/`.

The first deploy attempt safely stopped at a source-repository guard because
the VPS source is a linked worktree (`.git` file). The helper now validates via
`git rev-parse --git-dir`, accepting both ordinary repositories and linked
worktrees. Public nginx remains unchanged pending the zero-overlap final
cutover and browser acceptance.

A later immutable-release preflight reproduced a second deterministic stop:
with Node 20.19.0 and npm 10.8.2, `npm prune --omit=dev` removed the intended
development packages but also rewrote 59 tracked `package-lock.json` lines
(41 additions and 18 deletions). The helper now passes
`--package-lock=false` only to the post-build prune. A clean disposable
worktree confirmed that development tools such as ESLint, TypeScript, Vite,
and Vitest were removed, the production dependency tree remained valid, and
the tracked tree stayed byte-clean for immutable validation.

## ClamAV as a managed readiness dependency

- Extended the topology so malware scanning is not an ad-hoc sidecar: the installer creates or adopts `rizzoma-clamav` with a persistent signature volume, 4 GiB memory ceiling, restart policy, and loopback-only `127.0.0.1:3310` publication.
- The systemd lane starts Redis, CouchDB, and ClamAV together and waits up to 180 seconds for all three; ClamAV must report Docker health `healthy` before the app starts. The wider start timeout covers cold signature initialization without consuming the restart burst.
- Added `UPLOADS_STORAGE=local`, `CLAMAV_HOST=127.0.0.1`, and `CLAMAV_PORT=3310` to the non-secret environment template, plus a defense-in-depth public-interface drop for port 3310.
- Candidate/public acceptance now requires ClamAV readiness and a real clean-versus-EICAR upload result through the ACL-backed route. Shell syntax and `git diff --check` passed; local `systemd-analyze verify` reached the expected WSL-only missing `docker.service` and `/usr/bin/node` dependencies, so the installed VPS unit remains the authoritative runtime verification surface.

The independent deploy review then found seven determinism gaps and held this
follow-up at **NO-GO**: a drifted pre-existing scanner could be blindly adopted;
port 3310 was defended in the wrong firewall chain; only one direct nginx file
was checked for the active lane; rollback restarted lanes that had previously
been stopped; production environment ownership and required local values were
not fully asserted; deployment weakened the private upload-directory mode; and
candidate health did not explicitly require the ClamAV check. The deploy helper
also accepted a stale globally installed systemd unit.

The corrected implementation now recreates a scanner on any image, binding, or
mount drift; protects 3310 in `DOCKER-USER`; scans all effective nginx config
twice; preserves target, active state, and enabled state on rollback; enforces
root ownership plus exact non-secret environment invariants; retains
`rizzoma:rizzoma` mode `0750` uploads; byte-compares the candidate unit; and
parses readiness JSON for CouchDB, sessions, and ClamAV. Deployment is serialized
with a host lock, staging and probe paths are unpredictable, and lane symlinks
are published atomically.

A second adversarial review still held the helper at **NO-GO**: Bash disables
`errexit` inside functions invoked by `if !`, so a failed rollback symlink move
could fall through to a successful assignment; service restoration swallowed
every systemd error while claiming success; Docker-DNATed application ports
were protected only in `INPUT`; and an effective systemd drop-in could override
the byte-matched main unit. The final correction gives every transactional link
step an explicit failure return, verifies restored enabled/active state, stops
the lane and preserves candidate artifacts when restoration cannot be proven,
mirrors all application-port drops into `DOCKER-USER`, and refuses any effective
drop-in. Reused releases now also require the exact Git HEAD, clean tracked tree,
root ownership, read-only files/directories, and the exact persistent-upload
symlink before a restart is allowed. Bash syntax, ShellCheck, branch-context,
and diff checks pass; faithful function harnesses now prove both atomic-link
success and propagation of injected link-move and systemd-restart failures.

During review, invoking the installer with `--help` exposed that it silently
ignored arguments and ran its idempotent bootstrap. That accidental invocation
did not restart Rizzoma or change nginx. An immediate read-only production
recheck measured public health HTTP 200, nginx active with a valid configuration,
the existing blue candidate active and green inactive, the old public listener
set unchanged, `production.env` still `root:root` mode `0600`, and ClamAV healthy
on loopback with its persistent volume. The installer now has a harmless help
path and rejects every unexpected argument before any network action.
