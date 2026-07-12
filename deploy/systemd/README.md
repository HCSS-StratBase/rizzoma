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
3. Use a new random `SESSION_SECRET`. During the first managed cutover only,
   set `SESSION_SECRET_PREVIOUS=dev-secret-change-me`: the measured bare API had
   no explicit secret and therefore signed its 51 Redis sessions with that
   source-code fallback. The server signs new cookies with the new secret while
   accepting those existing cookies. Remove the previous value after the
   seven-day maximum session lifetime.
4. The installer sets Redis and CouchDB restart policy `unless-stopped` and
   idempotently persists the public-interface drop for host ports `5984,6379`.
   Verify external closure plus host-local dependency health after bootstrap.

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

## HTTPS canary gate

Production cookies are `Secure`, so browser acceptance against plain
`http://127.0.0.1:8101` is invalid. Back up the dev vhost, temporarily change
only its Rizzoma `proxy_pass` from `:3100` to the candidate lane, validate with
`nginx -t`, and reload. Run the full acceptance set through
`https://dev.138-201-62-161.nip.io`:

1. authenticated identity and session continuity
2. Google OAuth callback shape
3. two-browser collaboration/reconnect
4. strict desktop and mobile Follow-the-Green `2 -> 1 -> 0`
5. real viewport screenshots at 1280, 1366, 1440, 1600 and mobile widths
6. zero candidate 5xx responses in `journalctl -u rizzoma@blue`

For the first managed cutover, session continuity must include replaying a
currently valid public `rizzoma.sid` through the candidate and proving
`/api/auth/me` returns the same user identity. Counting Redis keys alone is not
enough.

Restore the dev vhost after the canary so the former lane remains externally
reachable as a rollback reference.

## Atomic public cutover

Back up `/etc/nginx/sites-available/rizzoma.conf`, change only its Rizzoma
`proxy_pass` to `http://127.0.0.1:8101`, run `nginx -t`, and reload nginx. Repeat
the complete acceptance set at the public URL. Keep the former `:3100/:8100`
lane running throughout the rollback window.

Rollback is the inverse: restore the recorded nginx backup, run `nginx -t`,
reload, and verify public health, OAuth and an authenticated session. The data
stores are shared, so rollback does not entail a CouchDB or Redis rollback.

Do not stop the former API until it has no established connections and its
graceful-shutdown release is active. Older releases without the shutdown hook
need a 35-second quiet window for the periodic Yjs snapshot before termination.
