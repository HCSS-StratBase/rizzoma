# Managed VPS deployment

This is the authoritative target production topology for Rizzoma. A compiled
client and server run together from an immutable release under a systemd
blue/green lane. Nginx is the only intended public application listener.
CouchDB, Redis, and the loopback-only ClamAV scanner remain Docker services.
Docker still declares the database host ports on all interfaces, but persistent
`DOCKER-USER` rules drop public-interface traffic to `5984`, `6379`, defensively
`3310`, and every Docker-published Rizzoma application port; matching `INPUT`
rules protect bare host listeners. External database closure and local health
were verified on July 12. Eventual loopback-only Docker publication remains the
cleaner target when those database containers are recreated.

The active layout is:

- `/srv/rizzoma/releases/<full-sha>/`: immutable built releases
- `/srv/rizzoma/lanes/blue`: candidate/active symlink on `127.0.0.1:8101`
- `/srv/rizzoma/lanes/green`: alternate symlink on `127.0.0.1:8102`
- `/var/lib/rizzoma/uploads`: persistent shared upload storage
- `/etc/rizzoma/production.env`: root-only production configuration
- `/etc/systemd/system/rizzoma@.service`: managed service template

## Bootstrap and topology reconciliation

1. Run `scripts/install-vps-systemd.sh` from the exact clean candidate checkout.
   Re-run it whenever the candidate changes `deploy/systemd/rizzoma@.service`;
   the deploy helper refuses a candidate whose unit does not byte-match the
   globally installed unit. `--help` is read-only and all other arguments are
   rejected.
2. Create `/etc/rizzoma/production.env` from
   [production.env.example](production.env.example). Whitelist only application
   settings; never copy an all-purpose dotenv containing SSH or Hetzner
   credentials. Set ownership `root:root` and mode `0600`.
3. Use a new random `SESSION_SECRET` and leave `SESSION_SECRET_PREVIOUS` empty
   for the July 2026 incident cutover. The prior Redis session store was
   internet-exposed and actively manipulated, so its sessions were flushed and
   the known source-code fallback must not remain an accepted verifier. For a
   future planned rotation between strong secrets, the previous-secret feature
   can preserve sessions for the seven-day maximum lifetime.
4. The installer sets Redis and CouchDB restart policy `unless-stopped`, creates
   or adopts a restart-persistent ClamAV container only when its image,
   `127.0.0.1:3310` publication, and `rizzoma-clamav-db` signature mount exactly
   match the declared topology; otherwise it replaces the container while
   preserving the volume. It also normalizes the five non-secret production
   invariants (`NODE_ENV`, `HOST`, local upload mode, and ClamAV host/port) and
   idempotently persists the public-interface drops for `5984`, `6379`, `3310`,
   and Rizzoma application ports in the Docker-aware chain. It refuses
   effective systemd drop-ins rather than allowing an operator override to
   bypass the reviewed unit.
   Verify external closure plus host-local dependency health after bootstrap.
   Each managed start gives cold Redis/CouchDB/ClamAV up to 180 seconds to become
   healthy, rather than exhausting systemd's restart burst on one-shot probes.

The production process refuses to start with the development session secret,
binds to loopback by default, reports both CouchDB and Redis session readiness,
and flushes dirty Yjs documents during `SIGTERM` before exiting.

## Build and start a candidate

Deploy a full commit SHA already merged into remote `master`:

```bash
scripts/deploy-vps.sh --sha <full-sha> --lane blue
```

The script takes a global deployment lock, verifies the SHA is an ancestor of
`origin/master`, checks root-only environment ownership and exact non-secret
runtime invariants, and requires the installed service unit to match the
candidate with no effective drop-ins. Existing releases are reused only after
their Git HEAD, tracked tree, ownership, read-only mode, persistent-upload
symlink, installed-versus-lock package versions, and complete production
dependency graph are revalidated. It scans all effective nginx configuration before and immediately
after the build, refusing any lane referenced by a loaded public or dev vhost,
including indirect upstream definitions. It then builds in a private disposable
staging worktree, publishes the release symlink atomically, and restores both
the prior lane target and its active/inactive plus enabled/disabled state if
startup or health fails. It installs exact dependencies, builds with the parity
renderer enabled and the native renderer disabled, then recreates a
production-only dependency tree from the same reviewed lockfile before it
mechanically compares every installed package version with that lockfile,
requires `npm ls --omit=dev --all` to pass, starts `rizzoma@blue`, and verifies:

- service active
- `/api/health` green, including Redis sessions
- ClamAV healthy and included in `/api/health` readiness
- compiled hashed assets present
- no Vite development client in the served HTML

The script never changes public nginx.

## Pre-cutover gate

Do not point either HTTPS vhost at the candidate while the old lane can still
receive writes. Socket.IO rooms and Yjs caches are process-local; even a short
canary overlap can persist divergent snapshots. Before maintenance, validate
only the candidate's local health, hashed static assets, journal cleanliness,
and rejection of an old cookie through direct loopback requests.

## Maintenance drain and atomic cutover

Take a brief write-maintenance window and preserve the old nginx/process recipe:

1. back up both Rizzoma vhosts and record the exact old Vite/API commands, PIDs,
   checkout SHA, and environment source
2. stop the old Vite process first, making public writes unavailable and
   severing every pre-cutover WebSocket
3. keep the now-isolated old API alive for at least 35 seconds so its legacy
   30-second Yjs snapshot interval can run
4. verify zero established connections to the old API and no snapshot errors,
   then stop the old API
5. change both public and dev vhosts to `http://127.0.0.1:8101`, run `nginx -t`,
   and reload nginx; only now may the managed lane receive write traffic

Run the complete acceptance set at the public HTTPS URL:

1. an old `rizzoma.sid` does not authenticate
2. a fresh login creates a Redis session, survives a managed restart, and
   returns the same identity afterward
3. a unique edit made immediately before that restart persists exactly after a
   fresh browser reload, proving the signal-time Yjs flush
4. Google OAuth callback shape passes
5. two-browser collaboration/reconnect passes
6. strict desktop and mobile Follow-the-Green moves `2 -> 1 -> 0`
7. screenshots pass at 1280, 1366, 1440, 1600 and mobile widths
8. candidate journal has zero 5xx, snapshot, or graceful-shutdown errors
9. a clean upload succeeds and an EICAR upload is rejected through the real ACL-backed route

Rollback is a controlled restart recipe, not a live dual-writer. Drain and stop
the managed lane first, start the recorded former processes locally, restore
the nginx backup, run `nginx -t`, reload, and verify public health, OAuth and a
fresh authenticated session. The data stores are shared, so rollback does not
entail a CouchDB or Redis rollback.

The rollback artifact is the exact prior SHA, environment recipe, process
commands, and nginx backup. It is deliberately not a second live writer.
