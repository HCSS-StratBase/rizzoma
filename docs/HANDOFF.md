## Handoff Summary — Rizzoma Modernization

Last Updated: 2026-07-14 (parity gate/audit checkpoint synced everywhere · VPS at ac6a6f9d)

Current State (feature/native-fractal-port @ 2026-07-14)

### Current state — 2026-07-14, branch `feature/native-fractal-port`

- **Everything points at the same checkpoint now**: local repo, pushed branch, and VPS checkout `/data/large-projects/stephan/rizzoma_260612` are at `ac6a6f9d`.
- **Public health**: `https://138-201-62-161.nip.io/` returns 200 and `https://138-201-62-161.nip.io/api/health` returns 200 after the VPS fast-forward.
- **Hard parity gate**: `npm run parity:gate` now requires legacy references, current public sweep, coverage, side-by-side old/current PNGs, and written audit before UI work can be handed off.
- **Current audit status**: `screenshots/260713-225614-public-parity-sweep-feature-sweep/legacy-current-comparisons/PARITY_AUDIT.md` is **FAIL / IN_PROGRESS**: 200 documented rows, 159 classified rows, 24 old PNGs, 44 new PNGs, 104/159 visual coverage, 2 screenshot gaps, 10 comparison sheets, and 0 completed written analyses before the audit.
- **Boundary**: this sync closes stale status drift; it does not certify full Rizzoma parity. Next work remains classifying/fixing comparison-sheet divergences, closing `VF-039`/`VF-040`, and then rerunning the gate.

### Current state — 2026-07-13, branch `feature/native-fractal-port`

- **BLB creation/read surface is no longer terminal-looking on the public hostname**: collapsed root, nested, and terminal BLB rows now render a bullet plus `[+]` affordance instead of bare text, and collapsed-row clicks expand without bubbling into the wrong parent. The current branch/VPS checkpoint is `ac6a6f9d`.
- **Clickable public proof**: [BLB proof 20260713T203706](https://138-201-62-161.nip.io/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a00740b). Artifacts: `screenshots/260713-223655-public-blb-fractal-proof-after-sso-502-fix/` (`01` root/collapsed, `02` root expanded, `03` nested expanded, `04` reload persistence, plus `result.json`). Earlier dev proof remains at [BLB proof 20260713T132301](https://dev.138-201-62-161.nip.io/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a005c3a).
- **Unread route 500s fixed**: `/api/waves/:id/unread`, `/next`, and `/prev` no longer call the app through `fetch(req.protocol + req.headers.host)`, which broke behind nginx; they compute blip order directly from CouchDB.
- **Public 502 fixed after Gmail SSO callback**: Google OAuth redirects back to the bare hostname, but enabled production nginx was still pointing at dead `127.0.0.1:8101`. It was temporarily restored to live legacy `8102`, then cut over to the new app on `127.0.0.1:3000` so SSO returns to the same codebase as the BLB proof. Backups: `/etc/nginx/sites-enabled/rizzoma.conf.bak-20260713-fix-prod-502` and `/etc/nginx/sites-enabled/rizzoma.conf.bak-20260713-cutover-new-blb`.
- **Dev VPS restored**: active checkout `/data/large-projects/stephan/rizzoma_260612` is now synced to `ac6a6f9d`; `https://dev.138-201-62-161.nip.io` is live after repairing the enabled nginx dev vhost from dead `127.0.0.1:8101` to live `127.0.0.1:3000`.
- **Verification**: `npm run build` passed; targeted route tests passed (11/11); full `npm run test` passed (55 files, 245 passed, 3 skipped); Playwright proof passed against both dev and the bare public URL. The only console error in the clean proof is the expected initial unauthenticated `/api/auth/me` 401 before the proof user registers.
- **Boundary**: public proof path is green, but broader visual sweep, mobile/responsive sweep, and iPhone Safari remain separate gates.

### Current state — 2026-07-13 late, active-only toolbar parity

- **Per-blip menu parity fixed on public**: the user's screenshot correctly showed a major mismatch with original Rizzoma — every expanded blip was showing its own `Edit / Collapse / Expand / link / gear` strip. `b517102b` changes active state to an explicit single-blip claim and prevents click bubbling from activating ancestors; active-menu CSS is now scoped to the active blip's own direct menu/content.
- **Public proof**: [BLB proof 20260713T205010](https://138-201-62-161.nip.io/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a00e553). Evidence: `screenshots/260713-225006-public-active-terminal-toolbar-proof/`.
- **Verification**: `npm run build` passed; focused tests passed (3 files, 25 tests); proof harness now asserts exactly one visible `.blip-menu-container` after clicking the terminal blip, and that menu's `data-blip-id` is the terminal blip. Visual PNG inspection confirms root and nested blips have no repeated menu while the terminal active blip has the toolbar.
- **Boundary**: this closes the specific active-toolbar parity defect. Broader visual/responsive/mobile sweep and iPhone Safari remain open.

### Current state — 2026-07-13 late, visual parity gate hardened

- **Process gap fixed mechanically**: the previous `.claude/hooks/visual-sweep-gate.sh` only warned and was not registered in the local Stop hook chain. It now calls `npm run parity:gate` and returns `continue:false` when parity evidence is missing.
- **Durable gate**: `scripts/check-rizzoma-parity-gate.mjs` plus `npm run parity:gate` now requires the legacy reference set, a fresh `screenshots/*-feature-sweep/`, current `coverage.md`, saved side-by-side comparison PNGs, and written `PARITY_AUDIT.md` before UI work can be handed off as checked.
- **Measured audit**: `screenshots/260713-225614-public-parity-sweep-feature-sweep/legacy-current-comparisons/PARITY_AUDIT.md` records the current status as **FAIL / IN_PROGRESS**: 200 documented rows, 159 classified rows, 24 old reference PNGs, 44 new sweep PNGs, 104/159 visual screenshot row coverage, 2 screenshot gaps, 10 side-by-side sheets, and 0 completed written analyses before the new audit.
- **Known severe failures recorded**: BLB/fractal bullet defects, active-toolbar menu regression, Google SSO 502, deep-BLB layout divergence, and unresolved mobile parity decision. The audit does not claim broad parity.
- **Verification**: `npm run parity:gate` passed with the audit present; `.claude/hooks/visual-sweep-gate.sh </dev/null` returned `{"continue": true}`.

### Current state — what shipped today (2026-05-12, branch `feature/native-fractal-port`)

- **Sweep**: 45/45 PASS · 0 FAIL · 0 no-gate (stable through 6 coverage-lift cycles).
- **PM matrix coverage**: 25 → **204 verified PASS (×8.2)**, uncov 109 → 4, weak 91 → 6, **coverage % over 214 visually-testable: 31% → 97%**.
- **CouchDB participants index** (`bd8cea23`): `idx_participant_by_wave` added; query 271 → 61 ms. Bug A wallclock 432 → 235 ms in profile. Cumulative Bug A: 1434 → 235 ms = **6.1× faster overall**.
- **Autosave fix cherry-picked** to `feature/rizzoma-core-features` (`899f9196`). Both branches now have the silent-content-corruption guard.
- **Task #191** (Bug A optimistic mount) — investigated + reverted twice; React batching gotcha documented.

### Previous state — 2026-05-11 session

### Current state — what shipped today (2026-05-11, branch `feature/native-fractal-port`)

- **Bug C / Task #190 RESOLVED at root** (`65e2a11c`): TipTap's `onUpdate` was autosaving `<p></p>` over saved content when programmatic `setContent()` fired on inline-child mount. Bare `<span class="blip-thread-marker">` isn't a recognized TipTap node — parser fell back to empty paragraph; autosave PUT `<p></p>` to server; spine[k+1]'s marker disappeared; sweep gate 036 failed walking the depth-10 spine. Fix: `isEditingRef` guard in `onUpdate` skips autosave when not in edit mode. Broader impact: eliminates silent content corruption for any real user expanding an inline child without intending to edit.
- **Sweep**: 43/44 → **44/44 PASS · 0 FAIL · 0 no-gate**.
- **Cherry-pick** to `feature/rizzoma-core-features` (`899f9196`): Hryhorii's branch also gets the autosave fix.
- **Task #191** (Bug A last mile): INVESTIGATED but no further latency win shipped. Profile showed the bottleneck (271ms of 432ms) is the `/api/waves/.../participants` fetch in `await load(true)`. Optimistic mount + skip await broke depth-1 AND regressed Bug B because React's batched `setBlips` hadn't committed before toggle dispatch. All attempts reverted. Bug A stays at 322-433ms (3-4× faster than 1434ms).
- See `docs/worklog-260511.md` for full details + the React-batching gotcha.

### Previous state — 2026-05-07..10 session arc

- **Bug A** Ctrl+Enter latency 1434ms → 430ms (3.3× faster) by dropping the 600ms idle timer and awaiting `__rizzomaTopicReload()` directly (`a6079ac5`). Verified PASS by `scripts/verify_bug_AB.mjs` against dev VPS. Optimistic local mount attempted (`15c637a4` + `5c3bdf0c`) but reverted — TipTap mount time, not `load()` round-trip, is the actual bottleneck. Remaining wins listed in PM Bug A panel.
- **Bug B** Nested Ctrl+Enter at depth 2+ now mounts the new editor (`6a1220bd`). Replaced local `toggleInlineChild` with global `rizzoma:toggle-inline-blip` event + `parentId` after awaitable reload. Verified 318ms PASS at depth 2.
- **Bug C** NEW — nested inline-marker rendering. `[+]` markers inside inline-expanded portal children don't appear after expanding spine[1]. Same class as Bug B but for the click-to-expand path. Tracked as Task #188; needs investigation in `RizzomaBlip.inlineChildren` propagation when blip is mounted via portal. Blocks deep-fractal sweep coverage (gate 036 still FAILS for this reason).
- **PM dashboard** redesigned 5×: tabs (Live activity / Dev Phases / Feature Sweep), 83 → 283 features by parsing the comparison-table half of `RIZZOMA_FEATURES_STATUS.md`, fractal accordion (Category → Feature → Capture+thumbnail), sort by FAIL %/all collapsed/dedup taxonomies, N/A non-visual split (57 backend/infra excluded), Jaccard best-match matcher (37→2 FAIL fan-out fixed). Live: `https://dev.138-201-62-161.nip.io/native-port-pm.html`.
- **Visual sweep** at 44/45 PASS (was 43/45). Gate 003 (nav-topics) relaxed to "search input present"; gate 036 (depth10-spine) remains failing due to Bug C.
- **VPS dev container** at `https://dev.138-201-62-161.nip.io` is fast-forwarded to branch HEAD; `feature/native-fractal-port` includes Phases 0-5 of the Direct-TS native render port (see `docs/NATIVE_RENDER_ARCHITECTURE.md`).

### What's still in-flight / open

- **Bug C** investigation (Task #188) — primary blocker for deep-fractal coverage.
- **Bug A remaining wins**: parallelize the 3 sequential awaits in `load()` (~−100ms), collapse 4-RAF chain to 1 (~−32ms), explore TipTap pre-warming (largest potential, gets us to original-Rizzoma sub-100ms).
- **Sweep coverage**: 109 visually-testable features remain `uncovered` — biggest categories are search/uploads/history/email-notifications. Adding `capture()`s + assertFns one by one is the path.
- **Phase 5** destructive deletes still deferred (need 24h+ user soak validation).

### Previous work — 2026-05-04 Hryhorii test feedback (still in `feature/rizzoma-core-features` branch)
- **Bullet hierarchy survives save**: view-mode `.blip-text ul/ol/li/...` rules now mirror edit-mode `.ProseMirror` rules; global `* { padding: 0 }` reset no longer flattens saved bullets. Verified on `https://dev.138-201-62-161.nip.io` — real `<ul>` renders `padding-left: 22.5px` + disc/circle/square per nesting level. (#45, `cd9e626e`)
- **`docker compose up` works**: sphinx (vestigial) gated behind `--profile search`; default 7 services (no sphinx), `--profile search` adds it. (#46, `cd9e626e`)
- **Inline `[+]` opens from edit mode**: `BlipThreadNode` wraps `[+]` and a `.inline-child-portal` anchor in a `display: contents` host span; portal-rendering JSX moved out of view-mode-only branch; single render path matches original Rizzoma. Visually verified — see `screenshots/issue-47-fix-verified.png`. (#47, `f0d7658e` + `707a24f6`)
- **OAuth callback URL no longer leaks `localhost`**: `APP_URL`/`CLIENT_URL`/`ALLOWED_ORIGINS` now env-passthrough in dev compose; new nginx vhost + LE cert at `dev.138-201-62-161.nip.io` → `:8200` (Google OAuth refuses bare-IP redirect URIs). End-to-end Sign-in-with-Google verified live. (#48, `02a57468`)

VPS state: `nginx :443` for `138-201-62-161.nip.io` → `:8201` (prod), for `dev.138-201-62-161.nip.io` → `:8200` (dev, NEW). Full root-cause writeup in [`docs/worklog-260504.md`](worklog-260504.md).

### Drift warnings (pre-2026-05-04)

Branch context guardrails:
- Active branch: `feature/rizzoma-core-features`. Always include branch name + date when summarizing status, and refresh branch-specific bullets before citing them.
- The historical state section below reflects `feature/rizzoma-core-features` as of 2026-04-25; revalidate before relying on it.

### Drift warnings (actively curating)
- Some onboarding/status docs (`README*.md`, `README_MODERNIZATION.md`, `MODERNIZATION_STRATEGY.md`, `PARALLEL_DEVELOPMENT_PLAN.md`) still talk about demo-mode shortcuts, “all core features green,” or aggressive auto-merge flows that predate the unread/perf backlog. Treat them as historical until we rewrite them with the current perf harness + CI gating expectations.
- Phase language (e.g., `modernization/phase1` or “Phase 1 complete”) in README/modernization strategy docs is historical only and does not apply to `feature/rizzoma-core-features`; rely on `RIZZOMA_FEATURES_STATUS.md` for the active branch snapshot (perf/getUserMedia/health/backups still pending).
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` were refreshed to call out the perf/getUserMedia/backups/health-check gaps, but they remain summaries only; rerun tests before trusting them.
- If link management guidance is still needed, `docs/LINKS_REPARENT.md` was removed; restore or replace before directing contributors to it.
- Demo-mode login references are stale: the Rizzoma layout routes sign-in through the real `AuthPanel`, so contributors must use authenticated sessions rather than `?demo=true` fallbacks.
- Playwright smokes are required for merges: the `browser-smokes` GitHub job runs `npm run test:toolbar-inline` + `npm run test:follow-green`, uploads `snapshots/<feature>/` artifacts, and now runs even when the build stage fails so snapshots/artifacts are always available for triage. Pull them locally via `npm run snapshots:pull` if you need to inspect without rerunning Playwright.
- `README_MODERNIZATION.md` still positions Phase 1 as largely complete and omits the current perf/getUserMedia/health/backups backlog; rewrite before citing it for the active branch.
- `docs/EDITOR_REALTIME.md` "Next steps" still lists presence/recovery/search as pending even though they shipped; update the roadmap to match the current perf/resilience focus.
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` reflect historical Dec 2025 runs; rerun suites before relying on them.
- Remaining historical docs still promote `npm run start:all` or demo-mode flows; use the branch-specific guidance in `docs/RESTART.md` + `docs/HANDOFF.md` instead.
- Operational scripts (`scripts/deploy-updates.sh`, `scripts/create-bundle.sh`) still reference demo-mode URLs; treat those references as historical and update if the scripts are used again.
- Landing view parity: topic landing page must match `screenshots/260224-2343-rizzoma-live-reference/feature/rizzoma-core-features/rizzoma-main.png` — only root labels visible, no children/body/editor until user clicks “+”. Perf harness landing metric should measure this collapsed state; expansion metrics can be separate.
- April production work that landed on `master` is not automatically on this active branch. Verify branch-native code and tests before assuming a `master` fix is present here.
- Screenshot artifacts now use `screenshots/YYMMDD-HHMM[-SS]-purpose-label/`; see `screenshots/README.md`. Do not create new loose PNG/JSON/HTML artifacts at `screenshots/` root.

PR Ops (CLI)
- CLI‑only: `gh pr create|edit|merge`; resolve conflicts locally; squash‑merge and auto‑delete branch.
- After merges, refresh the GDrive bundle (commands below).

Historical State (feature/rizzoma-core-features @ 2026-04-25)
- FEAT_ALL required: start both server (:8000) and Vite (:3000) with `FEAT_ALL=1` plus `SESSION_STORE=memory REDIS_URL=memory://` for local smokes; CouchDB/Redis via Docker.
- Tests last run (2026-04-24): public-prod visual feature sweep passed via `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_SWEEP_STAMP=260424-025320 npm run visual:sweep`, with artifacts in `screenshots/260424-025320-feature-sweep/`: 42 primary screenshots, manifest parsing 196 documented rows / 161 screenshot-valid rows / 69 dynamic candidates, and no residuals. `RIZZOMA_SWEEP_DIR=screenshots/260424-025320-feature-sweep npm run visual:coverage` passed and wrote `coverage.md`/`coverage.json` with all 161 screenshot-valid rows classified: 101 static screenshot-covered, 2 dynamic screenshot-covered, 58 non-screenshot/test-artifact, 0 screenshot gaps, 0 needs-review. `BUILD_QUALITY_VERDICT.md` now marks 161 green / 0 orange / 0 red after Redis 5 session storage, Twitter/X OAuth2 PKCE, mobile/PWA/offline runtime tests, and physical Pixel 9 Pro XL / Chrome evidence in `screenshots/260424-2319-real-device-pixel9proxl-local/`. The phone pass exposed and then fixed a mobile blip-toolbar overlap; final accepted evidence is `015-cdp-android-toolbar-compact-final.png` with measured `overlaps: false`. Public-prod full-render perf baseline also passed at 100 seeded blips (`RIZZOMA_PERF_RENDER=full`, artifacts in `screenshots/260424-0010-prod-perf-baseline/`): landing-labels stage 1193.7ms, expanded-root stage 524.5ms, FCP 740ms, memory 33-36MB, labels 100/100. `PERF_SNAPSHOT_DIR=screenshots/260424-0010-prod-perf-baseline PERF_BUDGET_EXPECTED_BLIPS=100 PERF_BUDGET_MIN_RATIO=1 node scripts/perf-budget.mjs` passed on stage-local budgets. Optional absolute-TTF diagnostic still flags expanded-root at 3522.9ms vs 3000ms. `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_E2E_BROWSERS=chromium RIZZOMA_SNAPSHOT_DIR=screenshots/260424-0010-prod-toolbar-scoped npm run test:toolbar-inline` passed. Latest local verification before the phone fix: `npm run typecheck` and full `npm run test` passed (48 files, 174 passed, 3 skipped, 0 failures). Latest verification after the phone fix: `npm run typecheck`, `npm run lint:branch-context`, `git diff --check`, and `npm run test -- --run src/tests/client.BlipMenu.test.tsx src/tests/client.mobilePwa.test.tsx` passed (2 files, 26 tests). Full `npm run test` was attempted twice after the phone fix but was killed with exit `-1` after many suites passed and without a final assertion summary; rerun in CI or a clean shell before using it as fresh full-suite proof.
- Perf tooling: `perf-harness.mjs` now supports `RIZZOMA_PERF_RENDER=lite|full` and records `renderProfile`/`perfMode` in metrics. `scripts/perf-budget.mjs` supports `PERF_SNAPSHOT_DIR`, checks stage-local duration by default, and only checks absolute page TTF when `PERF_BUDGET_CHECK_TTF=1`.
- Visual residual from 2026-04-24 public-prod screenshots: mobile gesture, BottomSheet, touch-target/PWA, and offline behavior now have focused runtime tests; physical Pixel 9 Pro XL / Chrome closes the last branch-matrix row. Public VPS freshness was corrected by deploying app-code commit `69d6a8a9`; public Android Chrome cursor-inline proof lives in `screenshots/260424-2350-real-device-pixel9proxl-public/`. VPS source is fast-forwarded to the latest docs/evidence checkpoint without rebuilding. Boundary: iPhone Safari remains untested.
- Tests last run (2026-02-04): `node test-blb-snapshots.mjs` pass with snapshots under `snapshots/blb/1770165748162-*`. Earlier 2026-02-03 runs: Playwright `npm run test:toolbar-inline` pass (assertions active; snapshots under `snapshots/toolbar-inline/1770080797945-*-final.png`). Playwright `npm run test:follow-green` pass (desktop+mobile) with snapshots under `snapshots/follow-the-green/1770081675832-*` and `snapshots/follow-the-green/1770081713734-*`. Earlier 2026-02-03 runs: `npm run test:health` pass; `npm test -- --run src/tests/client.BlipMenu.test.tsx` pass; perf harness 1000 blips pass with metrics under `snapshots/perf/metrics-1770076098998-*.json` and renders under `snapshots/perf/render-1770076098998-*.png`. Prior runs: `npm test -- --run src/tests/routes.topics.follow.test.ts` pass (2026-02-02). Historical BLB snapshot runs remain below; re-run before merges.
- BLB inline `[+]` markers now navigate into subblip documents; Ctrl+Enter inserts marker and navigates into the new subblip (topic + blip editors).
- Topic meta-blip now renders via `RizzomaBlip` in normal mode (topic root renderMode) while keeping the topic toolbar + editor override; root-level blips still render as standard `RizzomaBlip` instances inside the unified container.
- Read-only blip toolbar now includes Collapse/Expand buttons for legacy parity; toolbar renders only for expanded blips; collapsed child rows rely on green `[+]` for unread.
- Topics list enrichment: `/api/topics` now emits author name/avatar, snippets, unread totals, and follow state for signed-in users; follow/unfollow endpoints persist `topic_follow` docs with tests in `src/tests/routes.topics.follow.test.ts`.
- Perf: `perf-harness.mjs` 200-blip run PASS (TTF 2173.8ms, FCP 260ms, rendered 101/200); 1000-blip runs now PASS in `perfRender=lite` mode — latest 2026-02-02 run (1000 blips) reported stage duration ~1.5s landing and ~0.5s expanded, memory 23MB, labels rendered 1000/1000 (`snapshots/perf/metrics-1770042725851-*.json`). Windowed 200-label time ~2.6–2.9s. `perfLimit` raises `/api/blips` limits in perf mode; `x-rizzoma-perf=1` skips blip history writes during perf seeding, `perf=full` skips unread/sidebar fetches, and benchmarks now use per-stage duration. Keep working on full-render perf beyond lite mode.
- Follow-the-Green: socket host fix restores `wave:unread` delivery; CTA clears without API fallback. Snapshots under `snapshots/follow-the-green/` (desktop+mobile). RightToolsPanel uses unread sockets/refresh and logs debug when `rizzoma:debug:unread=1`.
- Toolbar/inline comments: inline toolbar parity smoke green; inline comment nav remains optional in smoke but UI renders toolbars. Snapshots under `snapshots/toolbar-inline/`.
- Health/Uploads: `/api/health` + inline comment/upload health tests green locally; uploads pipeline retains MIME/ClamAV/S3/MinIO support.
- Perf/monitoring: `scripts/perf-budget.mjs` added; `src/client/lib/performance.d.ts` supports perf monitor consumers; perf snapshots stored under `snapshots/perf/`.
- Dependency upgrades: audit captured in `docs/DEPENDENCY_UPGRADE_AUDIT.md`; minor/patch batch applied (Playwright/Vitest/Prettier, AWS SDK, session/email libs). Major editor/tooling/server upgrades remain deferred.

Open PRs
- #37: BLB: refresh snapshot harness + inline expansion

Next Work
- Branch focus (current batch): keep changes small/flagged; land perf/resilience sweeps and adapter/health/backup work in slices.
  - Visual sweep hardening: keep `npm run visual:sweep` plus `npm run visual:coverage` current; current branch verdict is 161 green / 0 orange / 0 red. The public VPS is now deployed from app-code commit `69d6a8a9`, source checkout is fast-forwarded to the latest docs/evidence checkpoint, and Android Chrome public cursor-inline proof passed; next mobile proof target is iPhone Safari if a device is available.
  - Perf/resilience sweeps: rerun production-target full-render baselines at 500/1000 blips, compare against lite mode, and investigate absolute-TTF drift.
  - Keep Playwright smokes/browser artifacts green; monitor follow-green socket delivery and toolbar parity as code changes land.
  - Health checks + CI gating: `/api/health` + inline comments/upload health tests pass locally; ensure CI coverage and alerting remain intact.
  - Backups: automate bundle + GDrive copy after merges and document cadence.
- Legacy cleanup: finish CoffeeScript/legacy asset disposition and dependency upgrades; rewrite onboarding/status docs to remove demo/start-all claims.
  - Audit (2026-02-02): `.coffee` files remain only in `original-rizzoma-src/` reference tree; none in active `src/`.

Restart Checklist (any machine)
- Node 20.19.0; `npm ci` (or `npm install`)
- Services: `docker compose up -d couchdb redis` (add `clamav` if `CLAMAV_HOST`/`CLAMAV_PORT` are set for upload scanning)
- Legacy views: `npm run prep:views && npm run deploy:views`
- Dev: `npm run dev` (server :8000, client :3000)
- Flag: set `EDITOR_ENABLE=1`
- Verify: `npm run typecheck && npm test && npm run build`

CI Notes
- PRs run typecheck/tests and skip full build; pushes run build and Docker image build.
- `browser-smokes` GitHub job runs `npm run test:toolbar-inline` + `npm run test:follow-green`, saves `snapshots/toolbar-inline/` + `snapshots/follow-the-green/`, and uploads `dev.log` whenever the Playwright suites regress (it runs even if build fails). Keep it green before merging.

Backup (GDrive)
- Script: `scripts/backup-bundle.sh` (runs bundle + PowerShell copy; honors `RIZZOMA_BUNDLE_PATH` + `RIZZOMA_GDRIVE_DIR` overrides).
- Bundle (manual): `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy (manual PowerShell):
  `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`
- Last run: 2026-02-03 (bundle created + copied to GDrive via `scripts/backup-bundle.sh`).

PR Log
- 2025‑11‑06: #23 merged (B Part 1: snapshots)
- 2025‑11‑11: #30 merged (B+: realtime incremental updates)
- 2025‑11‑11: #32 merged (B+: rooms/presence)
- 2025‑11‑11: #34 merged (B+: presence identity + UI badge)
