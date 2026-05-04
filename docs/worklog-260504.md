# Worklog 2026-05-04 — Hryhorii test feedback fixes (4 issues, all verified live)

Branch: `feature/rizzoma-core-features`. All work tonight is in response to Hryhorii's report after pulling the most recent commit and trying `docker compose up` + the topic at `http://138.201.62.161:8200/#/topic/24a8415531ea9a3ae3b7709eb20003ec`.

## What landed

| # | Title | Commit(s) | GH issue |
|---|---|---|---|
| 1 | Bullet hierarchy collapses to flat on save (view-mode `<ul>` missing list rules) | `cd9e626e` | [#45](https://github.com/HCSS-StratBase/rizzoma/issues/45) |
| 2 | `docker compose up` fails — missing `Dockerfile.sphinx` (sphinx vestigial from CoffeeScript era) | `cd9e626e` | [#46](https://github.com/HCSS-StratBase/rizzoma/issues/46) |
| 3 | Inline `[+]` not openable from edit mode (split render path) | `f0d7658e` + `707a24f6` | [#47](https://github.com/HCSS-StratBase/rizzoma/issues/47) |
| 4 | OAuth callback URL leaks `localhost` (Vite proxy + `changeOrigin: true` rewrites Host) | `02a57468` | [#48](https://github.com/HCSS-StratBase/rizzoma/issues/48) |

All four issues filed, fixes shipped, GH issues closed, end-to-end verified on the live VPS dev container.

## #45 — Bullet hierarchy

**Root cause.** `RizzomaApp.css:2-6` has the global `* { padding: 0 }` reset (already documented in CLAUDE.md memory as "Global `* { padding: 0 }` reset strips `<ul>` padding"). The compensating list rules existed for **edit mode** in `RizzomaBlip.css` (`.blip-editor-container .ProseMirror ul/ol/li/...`) but were **never mirrored to view mode** (`.blip-text` — the container that gets `dangerouslySetInnerHTML` saved HTML at `RizzomaBlip.tsx:2058`). So during edit: TipTap renders correct disc/circle/square hierarchy. On save → renders into `<div class="blip-text">` with no list rules → flat, no markers, nested lists indistinguishable.

**Fix.** Mirrored the edit-mode block to `.blip-text ul/ol/li/li p/ul ul/ol ol/...` with a comment crediting Hryhorii. Added `.inline-child-portal:empty { display: none }` to suppress phantom blank lines next to collapsed markers.

**Verified.** Live probe of the `:8200` topic showed computed `padding-left: 22.5px` and `list-style-type: disc` on the real saved `<ul>`. Without the fix both would be `0` and `none`.

## #46 — docker-compose sphinx

**Root cause.** `docker-compose.yml` referenced `Dockerfile.sphinx` (deleted long ago in the CoffeeScript cleanup). Sphinx full-text search engine was vestigial; the modernized TS app uses CouchDB Mango queries everywhere.

**Fix.** Same approach Hryhorii proposed in his local diff:
- Gate `sphinx` service behind `profiles: ["search"]` so default `docker compose up` skips it.
- Remove `sphinx` from `app.depends_on`.
- Inline comment explains intent + the `--profile search` re-enable command.

**Verified.** `docker compose config --services` on VPS: 7 services in default profile (no sphinx); 8 with `--profile search` (sphinx included).

## #47 — Inline `[+]` from edit mode

**Root cause.** Original Rizzoma had a single render path for inline child blips: the `[+]` marker and its anchored expansion-portal lived together in the editor's DOM, so clicking `[+]` worked the same in view OR edit mode. Our impl split them — view mode used `injectInlineMarkers()` to add `.inline-child-portal` anchors at end-of-`<li>`, edit mode rendered `[+]` via `BlipThreadNode` (TipTap atom node) with NO portal anchor. So `Ctrl+Enter` created the new child but you could only open it after exiting edit mode.

**Fix (3 parts).**
1. `BlipThreadNode.renderHTML` now wraps `[+]` and a sibling `.inline-child-portal` anchor in a `display: contents` host span. Portal anchor exists alongside the marker in BOTH render paths.
2. `useLayoutEffect` that builds `portalContainers` now scans from `blipContainerRef` (covers both modes) instead of `contentRef` (view mode only), filtered by inline child IDs to keep portal scope local to this blip.
3. The portal-rendering JSX moved out of the view-mode-only branch into the always-rendered area. `createPortal` teleports the React tree into whichever `.inline-child-portal` anchor exists.

Plus CSS: `.blip-thread-host { display: contents }` (wrapper vanishes from layout, marker stays inline) + `.inline-child-portal:empty { display: none }`.

**Bug introduced + caught + fixed mid-test.** First commit (`f0d7658e`) used `inlineChildren` directly as `useLayoutEffect` dep. That array is rebuilt via `.filter` every render → new reference every time → effect re-fires → `setPortalTick` → re-render → infinite loop → React unmounted the entire `RizzomaBlip` subtree. Fix (`707a24f6`): replace dep with stable string hash `inlineChildIdsKey = inlineChildren.map(c => c.id).sort().join(',')`.

**Verified.** Clicked the existing `[+]` marker on the topic root WHILE the parent was in edit mode → child blip rendered inline at the marker position; parent stayed in edit mode. DOM probe before/after click confirms 0→1 expanded children, 0→1 portal with rendered child. Visual proof in `screenshots/issue-47-fix-verified.png`.

## #48 — OAuth callback localhost leak

**Root cause chain (3 steps).**
1. `vite.config.ts:51-58` proxies `/api/*` to Express with `target: 'http://localhost:8000'` + `changeOrigin: true`.
2. `changeOrigin: true` rewrites the inbound `Host` header to `localhost:8000` before Express sees the request.
3. Express's `getBaseUrl()` at `src/server/routes/auth.ts:120` builds the OAuth callback URL from `req.get('host')` when `APP_URL` is unset → `http://localhost:8000/api/auth/google/callback`.

Google then redirects users to `localhost:8000` after login → user's browser hits localhost on their own machine → ERR_CONNECTION_REFUSED.

**Fix (repo).** Made `APP_URL` / `CLIENT_URL` / `ALLOWED_ORIGINS` pass through `${...:-}` env vars in `docker-compose.yml`, defaulted empty so behavior unchanged for plain local dev. To enable OAuth on a non-localhost address: set the vars and `docker compose up`. Inline comment in compose file documents the trap.

**Fix (VPS dev container).** Patched `/data/large-projects/stephan/rizzoma/docker-compose.yml` to set `APP_URL=https://dev.138-201-62-161.nip.io`, recreated container.

**Infra change required for the fix to work end-to-end.** Google OAuth refuses bare-IP redirect URIs (policy: "must use a valid top private domain"). So `https://138.201.62.161:8200/...` was rejected. Set up a proper DNS-named HTTPS endpoint:
- New nginx vhost `/etc/nginx/sites-enabled/rizzoma-dev.conf` for `dev.138-201-62-161.nip.io` → `127.0.0.1:8200`
- Let's Encrypt cert via webroot challenge (expires 2026-08-02, auto-renews)
- Two-phase deploy: first HTTP-only stub for ACME challenge; then full HTTP+HTTPS vhost once cert issued
- Updated dev container `APP_URL` from raw IP to `https://dev.138-201-62-161.nip.io`
- Added `https://dev.138-201-62-161.nip.io/api/auth/google/callback` to the Google Console OAuth client (user did this manually; ~2-3 min Google edge propagation observed)

**Verified.** Direct probe of Google's auth endpoint with various redirect_uris → `https://dev.138-201-62-161.nip.io/api/auth/google/callback` returns `https://accounts.google.com/v3/signin/identifier?...` (accepted), no `redirect_uri_mismatch`. Then full Sign-in-with-Google round-trip completed in Playwright with cached `sdspieg@gmail.com` session → landed at `https://dev.138-201-62-161.nip.io/?layout=rizzoma` with the Topics list rendered (signed in).

## Lessons / process notes

- The CLAUDE.md "Recently Completed Highlights" + worklog + Tana + bundle should not require the user to ask. Doing this proactively going forward.
- Hryhorii's test report was a single message — three bugs fell out of it because the area is interconnected (BLB rendering, OAuth, docker). Worth structuring future test passes the same way: one user/tester report → multiple linked GH issues → one batched fix series.
- Two infra side-effects worth remembering: (a) Google's "no bare IP" policy for OAuth — always use nip.io or a real DNS name; (b) Vite's `changeOrigin: true` rewrites Host header — explicit `APP_URL` is required for any auth flow that builds URLs from request host.

## Files touched

- `src/client/components/blip/RizzomaBlip.tsx` — useLayoutEffect scan from `blipContainerRef`, portal-rendering JSX moved out of view-mode branch, stable `inlineChildIdsKey` dep.
- `src/client/components/blip/RizzomaBlip.css` — view-mode `.blip-text ul/ol/li/...` rules, `.blip-thread-host { display: contents }`, `.inline-child-portal:empty { display: none }`.
- `src/client/components/editor/extensions/BlipThreadNode.tsx` — `renderHTML` now wraps marker + portal anchor in host span with `contenteditable="false"`.
- `docker-compose.yml` — sphinx behind `--profile search`, sphinx removed from `app.depends_on`, env `${...:-}` passthrough for `APP_URL`/`CLIENT_URL`/`ALLOWED_ORIGINS` on the dev `app` service.

## VPS state (post-fixes)

- `nginx :443` for `138-201-62-161.nip.io` → `:8201` (prod container, unchanged)
- `nginx :443` for `dev.138-201-62-161.nip.io` → `:8200` (dev container, NEW)
- Dev container env: `APP_URL=https://dev.138-201-62-161.nip.io`, `CLIENT_URL=https://dev.138-201-62-161.nip.io`, `ALLOWED_ORIGINS=http://localhost:3000,http://138.201.62.161:8200,https://dev.138-201-62-161.nip.io`
- Cert files at `/etc/letsencrypt/live/dev.138-201-62-161.nip.io/{fullchain,privkey}.pem`
