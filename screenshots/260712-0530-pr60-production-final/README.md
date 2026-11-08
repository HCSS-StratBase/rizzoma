# PR #60 production acceptance

Date: 2026-07-12 CEST

Release: PR [#60](https://github.com/HCSS-StratBase/rizzoma/pull/60), merged as `fe6988fb25db5baf788cd35517df01d2bb87d24d`. The merge tree exactly matched the staging head accepted before cutover. Public nginx now targets the blue/green lane on Vite `:3100`, which proxies to the merged API on `:8100`.

## Verified outcome

- Public health returned HTTP 200 after cutover, and Google OAuth generated the public callback `https://138-201-62-161.nip.io/api/auth/google/callback`.
- The public two-process collaboration smoke passed 10/10 with a measured 39 ms A-to-B relay, zero receiving-client REST PUTs, bidirectional convergence, reconnect catch-up, unread drain, and `Cache-Control: no-store`.
- The strict public Follow-the-Green smoke passed on desktop and emulated Pixel 5 mobile. The real `button.next-button.has-unread` control and API state both moved from 2 unread to 1 and then 0; unread reads returned HTTP 200 and the two individual mark-read writes returned HTTP 201 in each profile.
- The API reported zero 5xx responses across the post-cutover acceptance run. The active API used RedisStore and had 32 persisted test-session keys at the final operational check.
- GitHub CI for the release head was fully green: 62 test files, 284 tests passed, 3 skipped, 0 failed; typecheck passed; lint had 0 errors and 6,354 warnings; the production build transformed 3,298 modules; browser, health, performance, iOS, and aggregate gates passed.

## Visual inspection

- `1783826559554-desktop-two-unread.png` shows the real desktop Next action before draining unread items; `1783826559554-desktop-all-read.png` shows the resulting Next Topic state.
- `1783826559554-mobile-two-unread.png` shows the compact mobile Next action at the lower right; `1783826559554-mobile-all-read.png` shows the corresponding Next Topic action after the drain. Both remain clear of the topic card and toolbar.
- `viewport-1280.png`, `viewport-1366.png`, `viewport-1440.png`, and `viewport-1600.png` were captured from the public URL after authentication. The topic list, central editor, header actions, and right tools rail remain separate and visible across the required desktop widths; no header stacking or control overlap was observed.

The command-level evidence is in `collab.txt` and `follow-green.txt`.

## Remaining boundary

The prior public lane on `:3000`/`:8788` remains healthy as an immediate nginx rollback target. The active lane is still an unmanaged bare Node/Vite process rather than a supervised service, both lanes share the production CouchDB database, physical iPhone Safari remains untested, and the 500/1,000-blip full-render sweeps remain open.
