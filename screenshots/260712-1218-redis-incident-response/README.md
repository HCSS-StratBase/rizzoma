# Redis incident response evidence

Incident discovered and contained on 2026-07-12 between 12:03 and 12:18 CEST.

## Confirmed compromise

- `rizzoma-redis` had been published unauthenticated on all interfaces since
  its 2026-06-12 creation; Hetzner Robot allowed its port inside range
  `5432-6543`.
- External Redis returned unauthenticated `PONG`.
- Redis contained 54 keys: 53 Rizzoma sessions and one permanent key `x`.
- Key `x` held a padded `ssh-rsa` public key, the classic Redis persistence
  payload. Fingerprint: `SHA256:oN0PnU4YY0KT5X6+s8tJWpRHvSeizYg2rsi8pNxIStw`.
- Command statistics measured 1,257 `CONFIG SET` calls, 578 `SLAVEOF` calls,
  373 `FLUSHDB` calls, 243 `EVAL` calls, and rejected module-load/unload calls.
- Container logs confirmed repeated attacker-controlled `REPLICAOF`, full RDB
  synchronizations, and returns to master mode as recently as 2026-07-10.

## Scope evidence

- The malicious key fingerprint matched none of the host's five authorized SSH
  keys.
- Every accepted SSH login since 2026-06-12 used one of four authorized public
  key fingerprints; there were zero accepted password or unknown-key logins in
  that journal window. The high-volume key was explicitly labeled
  `github-actions-rubase-sunburst-template-2026-05-04`.
- Redis was root inside its container but not privileged and mounted only its
  Docker data volume at `/data`.
- No Redis module was loaded; the container had no `authorized_keys` file.
- CouchDB exposed its normal root banner, but unauthenticated `_all_dbs` and
  `project_rizzoma` requests both returned HTTP 401.
- Process, container, listener, persistence-path, and temporary-executable
  review found no miner or attacker-key persistence. This is strong negative
  evidence, not mathematical proof that the host was never affected.

## Containment and eradication

- Persisted IPv4 and IPv6 public-interface drops for Docker-forwarded CouchDB
  `5984` and Redis `6379`.
- Persisted IPv4 and IPv6 host-input drops for internal Rizzoma ports
  `3000-3001,3100,8000,8100-8102,8200-8202,8788`.
- Preserved the compromised RDB, Redis log, and attacker public key under the
  root-only local directory `/root/redis-incident-20260712/` on the VPS.
- Evidence hashes:
  - compromised RDB: `0fd577d3f3b185cd905f0283ad172569a7dfef1ae40aac3267ec678255bd734a`
  - Redis log: `9c33c81c8150497d912e65690636be7434f7b0e450a59fc70a2674cc77a12601`
- Flushed all 54 untrusted keys and forced a clean snapshot.
- Recreated `rizzoma-redis` from `redis:7-alpine`; the new instance is master,
  has no modules or dangerous-command history, and uses restart policy
  `unless-stopped`.
- Set CouchDB restart policy to `unless-stopped`.
- Changed every repository Compose publication to host loopback and made the
  Docker production profile require an explicit strong session secret.
- Changed every legacy VPS dotenv copy from world-readable mode `0644` to
  `0600`, then created a root-owned, mode-`0600`, application-only production
  environment without SSH or Hetzner credentials.
- External CouchDB, Redis, legacy API `8000`, active API `8100`, and rollback
  API `8788` now time out, while public HTTPS `/api/health` remains HTTP 200.

## Session decision

All prior sessions are treated as exposed and invalid. The managed service must
use a new random `SESSION_SECRET`, leave `SESSION_SECRET_PREVIOUS` empty, and
require users to sign in once. Acceptance must prove a newly created session
survives a managed restart.

## Residual boundary

The running pre-change containers still declare all-interface host publications
for CouchDB and Redis; the active durable control is the persisted dual-stack
firewall rule. The repository Compose declaration now binds all published ports
to loopback; safely recreating the two data containers from it remains. The
authorized GitHub Actions root key is intentionally used from many ephemeral
runner IPs, but its broad root access remains a separate hardening concern.
