# Worklog — 2026-07-13

Branch: `feature/native-fractal-port`

## BLB collapsed-row affordance + dev proof

- Fixed the immediate BLB failure where collapsed blips could render as terminal-looking text without a visible `[+]` affordance:
  - `src/client/components/blip/RizzomaBlip.tsx`
  - collapsed root/list rows now stop click propagation, expand deterministically, and always render the green/grey `[+]` affordance
  - nested collapsed child rows also always render `[+]`
  - `onToggleCollapse` now fires only on collapse, not on expand, so expansion is not immediately counteracted by parent collapse state
- Fixed a proxy-sensitive unread-route bug:
  - `src/server/routes/waves.ts`
  - `/api/waves/:id/unread`, `/next`, and `/prev` no longer call the app through `fetch(req.protocol + req.headers.host)`; they compute the blip order directly from CouchDB
  - updated `src/tests/routes.waves.prev.test.ts` for the direct CouchDB `_find` path and fixed the empty-order `/prev` edge case
- Added a reusable clickable proof harness:
  - `scripts/verify-blb-fractal-proof.mjs`
  - creates a fresh authenticated test user, topic, root blip, nested blip, terminal leaf, screenshots the BLB states, and writes `result.json`
  - `scripts/rizzoma_sanity_sweep.mjs` now supports `RZ_BASE`, `RZ_TOPIC`, `RZ_EMAIL`, `RZ_PASS`, and `RZ_OUT_DIR`
- Dev VPS state:
  - active checkout `/data/large-projects/stephan/rizzoma_260612` synced to `75d888c7`
  - restarted dev server/client with `FEAT_ALL=1`
  - repaired `dev.138-201-62-161.nip.io` nginx proxy, which had been pointing at dead `127.0.0.1:8101`; enabled vhost now proxies to the live Vite dev server at `127.0.0.1:3000`
  - backup: `/etc/nginx/sites-enabled/rizzoma-dev.conf.bak-20260713-blb-dev-proxy`
- Verification:
  - `npm run build` passed
  - targeted route tests passed: `src/tests/routes.waves.unread.test.ts`, `src/tests/routes.waves.prev.test.ts`, `src/tests/routes.waves.test.ts`, `src/tests/routes.blips.permissions.test.ts` — 11/11
  - full `npm run test` passed — 55 files, 245 passed, 3 skipped
  - clickable dev proof passed at [BLB proof 20260713T132301](https://dev.138-201-62-161.nip.io/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a005c3a)
  - proof artifacts: `screenshots/260713-152256-dev-https-blb-fractal-proof-clean/`
  - visually inspected PNGs show:
    - topic root body uses real bullets
    - collapsed root reply renders bullet + green `[+]`
    - expanded root shows bulleted content and nested bullet + green `[+]`
    - expanded nested blip shows terminal leaf as bullet + green `[+]`
    - reload returns to persisted collapsed BLB rows
- Boundary:
  - this was initially verified on the dev VPS URL, then the bare public hostname was repaired/cut over after OAuth exposed a stale nginx upstream
  - only the proof path was visually verified today; broader feature sweep and mobile/iPhone Safari remain separate gates

## Public hostname 502 + OAuth callback repair

- Reproduced the user-facing `502 Bad Gateway` after Gmail SSO at the nginx layer:
  - the Google callback returned to `https://138-201-62-161.nip.io/api/auth/google/callback`
  - enabled production nginx vhost `/etc/nginx/sites-enabled/rizzoma.conf` still proxied to dead `127.0.0.1:8101`
  - nginx logged `connect() failed (111: Connection refused) while connecting to upstream`
- Confirmed the legacy production node process on `8102` was alive, then corrected the stale enabled vhost:
  - temporary restore: `127.0.0.1:8101` → `127.0.0.1:8102`
  - backup: `/etc/nginx/sites-enabled/rizzoma.conf.bak-20260713-fix-prod-502`
- Confirmed OAuth on both dev and bare public hosts redirects back to the bare hostname, so a dev-only proof URL is not sufficient for authenticated SSO testing.
- Cut the bare public hostname over to the already-verified new app on Vite/API:
  - `/etc/nginx/sites-enabled/rizzoma.conf`: `proxy_pass http://127.0.0.1:3000;`
  - backup: `/etc/nginx/sites-enabled/rizzoma.conf.bak-20260713-cutover-new-blb`
  - `nginx -t` succeeded and `systemctl reload nginx` completed
- Verification:
  - `https://138-201-62-161.nip.io/` returns 200
  - `https://138-201-62-161.nip.io/api/health` returns 200
  - `https://138-201-62-161.nip.io/api/auth/google` returns 302 to Google with callback back to `https://138-201-62-161.nip.io/api/auth/google/callback`
  - public BLB proof passed at [BLB proof 20260713T203706](https://138-201-62-161.nip.io/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a00740b)
  - proof artifacts: `screenshots/260713-223655-public-blb-fractal-proof-after-sso-502-fix/`
  - visually inspected PNGs show public root/nested/terminal bullet-plus recursion and reload persistence
