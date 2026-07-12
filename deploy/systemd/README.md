# Managed VPS deployment

This is the authoritative target production topology for Rizzoma. A compiled
client and server run together from an immutable release under a systemd
blue/green lane. Nginx is the only intended public application listener.
CouchDB and Redis remain the existing Docker services. Docker still declares
their host ports on all interfaces, but a persistent `DOCKER-USER` rule now
drops public-interface traffic to `5984,6379`; external closure and local
health were verified on July 12. Eventual loopback-only Docker publication
remains the cleaner target when those dependency containers are recreated.

The active layout is:

- `/srv/rizzoma/releases/<full-sha>/`: immutable built releases
- `/srv/rizzoma/lanes/blue`: candidate/active symlink on `127.0.0.1:8101`
- `/srv/rizzoma/lanes/green`: alternate symlink on `127.0.0.1:8102`
- `/var/lib/rizzoma/uploads`: persistent shared upload storage
- `/etc/rizzoma/production.env`: root-only production configuration
- `/etc/systemd/system/rizzoma@.service`: managed service template

## One-time bootstrap

1. Run `scripts/install-vps-systemd.sh` from a clean repository checkout.
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
4. The installer sets Redis and CouchDB restart policy `unless-stopped` and
   idempotently persists the public-interface drop for host ports `5984,6379`.
   Verify external closure plus host-local dependency health after bootstrap.
   Each managed start gives cold Redis/CouchDB up to 50 seconds to become
   healthy, rather than exhausting systemd's restart burst on one-shot probes.

The production process refuses to start with the development session secret,
binds to loopback by default, reports both CouchDB and Redis session readiness,
and flushes dirty Yjs documents during `SIGTERM` before exiting.

## Build and start a candidate

Deploy a full commit SHA already merged into remote `master`:

```bash
scripts/deploy-vps.sh --sha <full-sha> --lane blue
```

The script verifies the SHA is an ancestor of `origin/master`, refuses the
publicly active lane, builds in a disposable staging worktree, publishes the
release atomically, and restores the prior lane link if startup or health
fails. It installs exact dependencies, builds with the parity renderer enabled
and the native renderer disabled, prunes development packages, starts
`rizzoma@blue`, and verifies:

- service active
- `/api/health` green, including Redis sessions
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

Rollback is a controlled restart recipe, not a live dual-writer. Drain and stop
the managed lane first, start the recorded former processes locally, restore
the nginx backup, run `nginx -t`, reload, and verify public health, OAuth and a
fresh authenticated session. The data stores are shared, so rollback does not
entail a CouchDB or Redis rollback.

The rollback artifact is the exact prior SHA, environment recipe, process
commands, and nginx backup. It is deliberately not a second live writer.
