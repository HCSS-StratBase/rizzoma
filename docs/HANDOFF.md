## Handoff Summary — Rizzoma Modernization

Last Updated: 2026-03-31 (cross-session gadget preference lifecycle accepted on fresh client; runtime/store verification archived under screenshots/260331-*/)

Branch context guardrails:
- Active branch: `master`. Always include branch name + date when summarizing status, and refresh branch-specific bullets before citing them.
- The "Current State" section below is inherited from `feature/rizzoma-core-features` snapshot content and should be refreshed for `master` as changes land.

Branching mode (private repo):
- Direct development on `master` is acceptable in this private/solo setup.
- Preserve `master-archive-2026-02-24` as rollback anchor when master pointer changes are performed.
- Use feature branches when isolation is needed for risky or long-running work.

### Drift warnings (actively curating)
- Some onboarding/status docs (`README*.md`, `README_MODERNIZATION.md`, `MODERNIZATION_STRATEGY.md`, `PARALLEL_DEVELOPMENT_PLAN.md`) still talk about demo-mode shortcuts, “all core features green,” or aggressive auto-merge flows that predate the unread/perf backlog. Treat them as historical until we rewrite them with the current perf harness + CI gating expectations.
- Phase language (e.g., `modernization/phase1` or “Phase 1 complete”) in README/modernization strategy docs is historical only and does not apply to `feature/rizzoma-core-features`; rely on `RIZZOMA_FEATURES_STATUS.md` for the active branch snapshot (perf/getUserMedia/health/backups still pending).
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` were refreshed to call out the perf/getUserMedia/backups/health-check gaps, but they remain summaries only; rerun tests before trusting them.
- If link management guidance is still needed, `docs/LINKS_REPARENT.md` was removed; restore or replace before directing contributors to it.
- Demo-mode login references are stale: the Rizzoma layout routes sign-in through the real `AuthPanel`, so contributors must use authenticated sessions rather than `?demo=true` fallbacks.
- Playwright smokes are required for merges: the `browser-smokes` GitHub job runs `npm run test:toolbar-inline` + `npm run test:follow-green`, uploads `snapshots/<feature>/` artifacts, and now runs even when the build stage fails so snapshots/artifacts are always available for triage. Pull them locally via `npm run snapshots:pull` if you need to inspect without rerunning Playwright.

## CI gates (Hard Gap #19, 2026-04-13)
- `.github/workflows/ci.yml` defines five jobs: `build`, `browser-smokes`, `perf-budgets`, `health-checks`, and `ci-gate` (the aggregator).
  - `build` — typecheck, lint (non-blocking), `npm test`, build, Docker image build (push-only).
  - `browser-smokes` — runs `test:toolbar-inline` + `test:follow-green` (desktop + mobile) on the dev stack with `FEAT_ALL=1 EDITOR_ENABLE=1`, uploads snapshots. Runs `if: always()`.
  - `perf-budgets` — runs `npm run perf:harness` against the dev stack with `RIZZOMA_PERF_BLIPS=50` and `RIZZOMA_PERF_ENFORCE_BUDGETS=0` (advisory). Toggle the enforce flag to make perf regressions block merges.
  - `health-checks` — runs `npm run test:health` (which exercises `server.health.test.ts` + `routes.comments.inlineHealth.test.ts` + `routes.uploads.edgecases.test.ts`). Runs `if: always()` so health regressions surface independently of build/typecheck.
  - `ci-gate` — single aggregator that depends on all four jobs above and fails if ANY of them failed or were cancelled. **This is the job to require in branch protection** (Settings → Branches → master → Require status checks → check `ci-gate`). With that one box checked, no merge can land if build, browser-smokes, perf-budgets, or health-checks regressed.
- `README_MODERNIZATION.md` still positions Phase 1 as largely complete and omits the current perf/getUserMedia/health/backups backlog; rewrite before citing it for the active branch.
- `docs/EDITOR_REALTIME.md` "Next steps" still lists presence/recovery/search as pending even though they shipped; update the roadmap to match the current perf/resilience focus.
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` reflect historical Dec 2025 runs; rerun suites before relying on them.
- Remaining historical docs still promote `npm run start:all` or demo-mode flows; use the branch-specific guidance in `docs/RESTART.md` + `docs/HANDOFF.md` instead.
- Operational scripts (`scripts/deploy-updates.sh`, `scripts/create-bundle.sh`) still reference demo-mode URLs; treat those references as historical and update if the scripts are used again.
- Landing view parity: topic landing page must match `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png` — only root labels visible, no children/body/editor until user clicks “+”. Perf harness landing metric should measure this collapsed state; expansion metrics can be separate.

PR Ops (CLI)
- CLI‑only: `gh pr create|edit|merge`; resolve conflicts locally; squash‑merge and auto‑delete branch.
- After merges, refresh the GDrive bundle (commands below).

Current State (master @ 2026-03-30; includes gadget registry phase 1, trusted embed adapters, accepted fresh live UI artifacts, and fixed topic-root app persistence)
- FEAT_ALL required: start both server (:8788, the reserved Rizzoma backend port — see CLAUDE.md "Reserved Ports") and Vite (:3000) with `FEAT_ALL=1` plus `SESSION_STORE=memory REDIS_URL=memory://` for local smokes; CouchDB/Redis via Docker.
- Docker Desktop WSL integration was re-enabled on 2026-03-29; `docker compose up -d couchdb redis` works again from WSL for local live-app verification.
- Express 5 SPA fallback: `src/server/app.ts` uses `app.get('/{*path}', ...)` which is the canonical path-to-regexp v8 syntax under Express 5 (bare `*` was dropped in v8). This was documented as a "workaround" in earlier snapshots but is actually the correct form. Cleaned up in Hard Gap #29 (2026-04-13): the `/uploads` static handler is now mounted BEFORE the SPA catch-all so the catch-all only has to skip `/api` paths, and the code comment explains the syntax is canonical.
- Latest live-app artifacts (2026-03-29):
  - `screenshots/260329-live/topic-c7febb62dc333aa08f4a50aea8004efc.png`
  - `screenshots/260329-live/blb-study-expanded.png`
  - `screenshots/260329-live/blb-study-topic-root.png`
- Latest accepted live-shell artifacts (2026-03-30):
  - `screenshots/260330-live-ui/blb-topic-v5.png`
  - `screenshots/260330-live-ui/blb-topic-v5.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4175` because older long-lived `:3000` / `:4174` processes were serving stale UI during early captures.
- Latest accepted BLB topic-root parity artifacts (2026-03-31):
  - `screenshots/260331-blb-parity/blb-probe-v1.png`
  - `screenshots/260331-blb-parity/blb-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs` with a denser BLB-style root-topic probe.
- Latest accepted BLB inline-thread parity artifacts (2026-03-31):
  - `screenshots/260331-blb-inline/blb-inline-probe-v1.png`
  - `screenshots/260331-blb-inline/blb-inline-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... inline` to create and expand a root inline child plus a nested inline child before capture.
- Latest accepted BLB mixed-thread parity artifacts (2026-03-31):
  - `screenshots/260331-blb-mixed/blb-mixed-probe-v1.png`
  - `screenshots/260331-blb-mixed/blb-mixed-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... mixed` to combine inline-thread expansion with a separate list-thread reply on the same live topic surface.
- Latest accepted BLB unread-thread parity artifacts (2026-03-31):
  - `screenshots/260331-blb-unread/blb-unread-probe-v1.png`
  - `screenshots/260331-blb-unread/blb-unread-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... unread` plus the real `POST /api/waves/:waveId/blips/:blipId/read` route to create a believable mix of green unread markers, gray read markers, an active inline-expanded unread thread with toolbar, and a collapsed list-thread row that stays unread because of a nested child.
- Latest accepted BLB toolbar-state parity artifacts (2026-03-31):
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.png`
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_probe.cjs ... toolbar` to prove the expanded-vs-collapsed toolbar contract in the live topic shell after hardening collapsed-row expansion in `src/client/components/blip/RizzomaBlip.tsx` and flattening the per-blip toolbar in `src/client/components/blip/BlipMenu.css` toward the legacy utility-strip texture.
- Latest accepted dense live BLB scenario artifacts (2026-03-31):
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.html`
  - Source of truth for this pass is the clean feature-flagged Vite client on `http://127.0.0.1:4196`, using `scripts/capture_blb_live_scenario.cjs` to seed and capture a denser authenticated business-topic shell with mixed inline/list unread states, two expanded list replies, and a collapsed unread comparison reply.
  - The same verifier now records DOM-state counts and passed with `expandedReplyCount = 2`, `visibleToolbarCount = 1`, and `primaryExpandedIsActive = true`, so the multi-reply toolbar-focus contract is now covered in the richer live scenario instead of only the stripped-down probes.
  - Follow-up note from the next batch: non-root blip activation has since been centralized through a shared active-blip path in `src/client/components/blip/RizzomaBlip.tsx`, and the accepted single-toolbar probe still passes after that refactor. The richer multi-reply live scenario remains open again because the latest attempt exposed a toolbar-focus leak that still needs a clean accepted closeout.
- Latest accepted live gadget artifacts (2026-03-30):
  - `screenshots/260330-live-poll/live-topic-poll-v15.png`
  - `screenshots/260330-live-poll/live-topic-poll-v15.html`
  - `screenshots/260330-live-poll/live-topic-palette-v8.png`
  - `screenshots/260330-live-poll/live-topic-palette-v8.html`
  - Source of truth for the final poll/palette verification is the fresh feature-flagged Vite client on `http://127.0.0.1:4179`.
- Latest accepted trusted-embed artifacts (2026-03-30):
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.html`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.html`
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.html`
  - Source of truth for the trusted-embed verification is the fresh feature-flagged Vite client on `http://127.0.0.1:4180`.
- Latest accepted app-runtime/store artifact (2026-03-30):
  - `screenshots/260330-app-runtime/live-store-panel-v2.png`
  - `screenshots/260330-app-runtime/live-store-panel-v2.html`
  - Source of truth for the app-runtime/store verification is the forced fresh Vite client on `http://127.0.0.1:4181`.
- Latest accepted in-topic sandboxed app artifact (2026-03-30):
  - `screenshots/260330-app-runtime/live-topic-kanban-v3.png`
  - `screenshots/260330-app-runtime/live-topic-kanban-v3.html`
  - Source of truth for the first app-preview verification is the forced fresh Vite client on `http://127.0.0.1:4182`.
- Latest accepted sandboxed app persistence artifacts (2026-03-30):
  - `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.html`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-mutation-traffic.json`
  - `screenshots/260330-app-runtime/topic-patch-log.ndjson`
  - Source of truth for the fixed planner persistence verification is the fresh feature-flagged Vite client on `http://127.0.0.1:4192` with the live backend server restart that includes the route logging/debug hardening.
  - Human-readable architecture/debug explainer: `docs/APP_RUNTIME_PERSISTENCE_EXPLAINED.md`
- Latest accepted generalized runtime-harness artifacts (2026-03-30):
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.html`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.html`
  - Source of truth for the shared-shell refactor is the harness page `src/client/test-app-runtime.html`, captured through `scripts/capture_live_topic_app.cjs` on `http://localhost:3001/test-app-runtime.html`.
- Dirty gadget/editor batch status:
  - `PollGadget` parse/render compatibility is restored in `src/client/components/editor/extensions/GadgetNodes.ts`.
  - `npm test -- --run src/tests/client.editor.GadgetNodes.test.ts` passes again, now including a real `editor.getHTML()` serializer assertion.
  - Fresh Playwright poll artifacts from a clean feature-flagged client live under `screenshots/260330-poll-fix/`:
    - `test-editor-poll-4174.png`
    - `test-editor-poll-4174.html`
  - The isolated poll test page is visually acceptable (`screenshots/260330-poll-fix/test-editor-poll-4174-v4.png`), the live BLB topic shell is acceptable (`screenshots/260330-live-ui/blb-topic-v5.png`), and the registry-backed live topic editor now inserts/render polls acceptably in-context on a fresh client (`screenshots/260330-live-poll/live-topic-poll-v15.png`).
  - Gadget insertion now flows through the shared helper in `src/client/gadgets/insert.ts`, and the live picker is driven by `src/client/gadgets/registry.ts` instead of per-component switch statements.
  - Trusted URL gadgets now resolve through `src/client/gadgets/embedAdapters/` and render via the native `embedFrameGadget` node or the real image node instead of leaking escaped iframe markup into topic content.
  - The Store now reflects the actual runtime boundary (`built-in`, `trusted`, `preview`, `planned`) instead of fake install toggles, and the first app-manifest/host-API scaffolding lives under `src/client/gadgets/apps/`.
  - The first real sandboxed app preview now mounts inside a topic through `AppFrameGadget` + `SandboxAppGadgetView` + `public/gadgets/apps/kanban-board/index.html`, with a minimal live host bridge over `postMessage`.
  - The first persistence-critical app bug is now fixed: topic-root planner edits survive `Done`, and the stale overwrite path from rogue `PUT /api/blips/:topicId` traffic has been removed/hardened.
  - The shared app shell is now generalized and verified in the dedicated runtime harness for Planner + Focus.
  - Remaining work now moves into cleaning up the live authenticated topic-app verifier, then extending the generalized shell to additional preview apps and broader host-API/store behavior.
- Screenshot/parity archive refreshed on 2026-02-25:
  - Canonical archive root: `screenshots/260225/`
  - Exhaustive run: `screenshots/260225/ui-exhaustive-1771981300160/` (175 screenshots + 175 notes)
  - Run analysis: `screenshots/260225/TODAY_RUN_EXHAUSTIVE_ANALYSIS_260225.md`
  - Consolidated parity rollup: `screenshots/260225/COMPARISON_EXHAUSTIVE_260225.md`
  - UI element inventory: `docs/UI_ELEMENTS_EXHAUSTIVE.md`
  - Confirmed parity gaps from live-reference set remain: `rizzoma-gear-menu`, `rizzoma-share`, `rizzoma-share-modal`, `rizzoma-search-overlay`, `rizzoma-unread`
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
  - Immediate fix: continue BLB parity cleanup from the accepted dense live BLB scenario baseline plus the unread/toolbar probes, now that the richer multi-reply toolbar-focus leak is fixed on the clean `:4197` client (`screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}`), the scenario reads with less synthetic business-thread copy, and the unread mix is less evenly seeded across grandchildren. Next target is less scripted live-topic distribution beyond the current scenario and then mobile/perf consequences.
  - Mobile consequence check is now accepted too: `scripts/capture_blb_live_scenario_mobile.cjs` passes on the clean `:4197` client with `screenshots/260331-blb-live-scenario-mobile/blb-live-scenario-mobile-v1.{png,html}` after tightening the small-screen toolbar/header footprint. Next target remains broader, less-seeded live-topic distributions and then perf pressure on the denser shell.
  - Perf-pressure instrumentation is now started on the same dense live scenario: `scripts/capture_blb_live_scenario.cjs` emits `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json` with step timings + DOM counts. Treat this as a coarse baseline only; the next target is reducing fixed waits so the numbers become useful for regression pressure.
  - That dense-live perf probe is now tightened too: fixed sleeps were replaced with thread-state waits, and the accepted `blb-live-scenario-v3.metrics.json` baseline on the clean `:4197` client now reads `totalScenarioMs = 4227` with the same one-toolbar/unread contract. Next target is to broaden beyond the seeded distribution while keeping this probe green.
  - The dense-live scenario is now broadened one step further too: an extra neutral collapsed follow-up thread is present in the accepted `blb-live-scenario-v3.{png,html,metrics.json}` artifact, taking `domBlipCount` to `6` while preserving `visibleToolbarCount = 1`. Next target is to keep reducing how hand-seeded the live distribution feels without losing the current single-toolbar contract.
  - That same dense-live scenario is now less mechanically regular too: paragraph density and child ordering vary more across the expanded/collapsed replies, while the accepted `blb-live-scenario-v3.{png,html,metrics.json}` artifact still holds `visibleToolbarCount = 1` and `collapsedUnreadHasUnreadIcon = true`. Next target is to move beyond this still-seeded business-thread fixture into messier live-topic distributions.
  - The top-level ordering is now messier too: a neutral collapsed middle row sits between the two expanded replies in the accepted `blb-live-scenario-v3.{png,html,metrics.json}` artifact, taking `domBlipCount` to `7` while preserving `visibleToolbarCount = 1`. Next target is to shift this same contract into a less-scripted real-topic distribution instead of only enriching the seeded fixture.
  - Gadget platform continuation: the cleaned `:4193` topic-app path is accepted for Planner, Focus, and Kanban (`screenshots/260331-app-runtime/` plus `live-topic-planner-vfinal.{png,html}`); the Store/install lifecycle is accepted on the clean `:4196` client (`screenshots/260331-store-lifecycle/`); the same lifecycle is accepted through the authenticated `/api/gadgets/preferences` path (`screenshots/260331-store-lifecycle-server/`); and the fresh-login lifecycle now also passes with explicit user-scoped defaults/reset behavior (`screenshots/260331-store-lifecycle-session7/`). Next move is to carry this stable runtime/store baseline back into BLB/live parity work.
  - Perf/resilience sweeps: address 1k-blip perf harness failure (TTF + render count), add budgets/docs, and schedule runs.
  - Keep Playwright smokes/browser artifacts green; monitor follow-green socket delivery and toolbar parity as code changes land.
  - Health checks + CI gating: `/api/health` + inline comments/upload health tests pass locally; ensure CI coverage and alerting remain intact.
  - Backups: automate bundle + GDrive copy after merges and document cadence.
- Legacy cleanup: finish CoffeeScript/legacy asset disposition and dependency upgrades; rewrite onboarding/status docs to remove demo/start-all claims.
  - Audit (2026-02-02): `.coffee` files remain only in `original-rizzoma-src/` reference tree; none in active `src/`.

Restart Checklist (any machine)
- Node 20.19.0; `npm ci` (or `npm install`)
- Services: `docker compose up -d couchdb redis` (add `clamav` if `CLAMAV_HOST`/`CLAMAV_PORT` are set for upload scanning)
- Legacy views: `npm run prep:views && npm run deploy:views`
- Dev: `npm run dev` (server :8788, client :3000) — 8788 is the reserved Rizzoma backend port (avoids :8000 collision with `google_workspace_mcp`); see CLAUDE.md "Reserved Ports".
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

Remote access (Tailscale Funnel — 2026-04-14)
- **Public URL (one for everyone)**: `https://stephan-office.tail4ee1d0.ts.net/`
- Works from: desktop, phone on WiFi, phone on cellular, any colleague on the public internet. Same URL everywhere. Automatic Let's Encrypt TLS.
- Enable: `tailscale funnel --bg --https=443 http://127.0.0.1:3000` (run from Windows PowerShell; WSL can also invoke via `/mnt/c/Program\ Files/Tailscale/tailscale.exe`).
- Disable: `tailscale funnel reset` or `tailscale funnel --https=443 off`.
- Check state: `tailscale funnel status`. First-time activation may require visiting `https://login.tailscale.com/f/funnel?node=<nodeId>` once to enable Funnel on the tailnet.
- **Backend env**: `APP_URL=https://stephan-office.tail4ee1d0.ts.net` must be set when launching the backend so OAuth callback URLs are generated against the Funnel hostname (not the internal proxy target). The server honors `X-Forwarded-Host` via `src/server/routes/auth.ts:getBaseUrl()` but `APP_URL` overrides everything and is the most reliable path.
- **Google OAuth redirect URI** registered in Google Cloud Console: `https://stephan-office.tail4ee1d0.ts.net/api/auth/google/callback`. IP-addressed redirect URIs are rejected by Google; LAN hostnames must end in a public TLD (`.ts.net`, `.duckdns.org`, etc.).
- **Known issue (2026-04-14)**: Vite's dev server and Tailscale Funnel's H2 upstream forwarder don't play nicely under concurrent load — the browser gets intermittent 502s on module requests and the page renders blank on first load. Hard-refresh usually recovers. Clean fix: build the app with `npm run build` and serve via `npm run preview -- --host --port 3001`, then point the Funnel at 3001 instead of 3000. Production bundle has ~5 files, no concurrency stress.
- **Logging**: winston with rotating file transport at `logs/rizzoma.log` (10 MB × 5 gens). `trust proxy` is on so real client IPs are captured from `X-Forwarded-For`. `logAuthEvent()` in `src/server/lib/logger.ts` logs OAuth success/failure with `provider`, `email`, `ip`, `ua`, `reason`. Essential once the Funnel is open to the public internet — scanners start probing `/proc/self/environ`, `/api/graphql`, etc. within minutes.

PR Log
- 2025‑11‑06: #23 merged (B Part 1: snapshots)
- 2025‑11‑11: #30 merged (B+: realtime incremental updates)
- 2025‑11‑11: #32 merged (B+: rooms/presence)
- 2025‑11‑11: #34 merged (B+: presence identity + UI badge)

Latest BLB dense-live note (2026-03-31)
- `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}` was regenerated on `master` against `http://127.0.0.1:4198` after correcting the seeded scenario to match the documented topic = meta-blip model and then restoring single-toolbar ownership on that corrected tree.
- Current accepted truth for that artifact:
  - topic body remains the root/meta-blip
  - one real top-level discussion thread contains the nested business replies
  - one separate root-level follow-up remains as a sibling
  - `expandedReplyCount = 3`
  - `visibleToolbarCount = 1`

Latest live workflow sanity note (2026-03-31)
- `screenshots/260331-workflow-exploration/workflow-v1.{png,html,json}` captures a fresh live topic run on `master` against `http://127.0.0.1:4198`.
- Verified normal path:
  - root reply create
  - root reply expand
  - nested reply form open
  - nested reply submit
  - topic edit mode enter
  - gadget palette open
- Interpretation:
  - the basic “create a blip and use gadgets from edit mode” workflow still works
  - the remaining problem is confusing structural/affordance consistency, not total failure of the core path

Latest complex workflow audit note (2026-03-31)
- `screenshots/260331-complex-workflow/` contains an 11-step live workflow pack captured on `master` against `http://127.0.0.1:4198`, plus `summary.json`, `final.html`, and `ANALYSIS.md`.
- Workflow covered:
  - topic load
  - two root replies
  - root reply expansion
  - nested reply form + nested reply submit
  - topic edit mode
  - gadget palette open
  - poll insert
  - done-mode return
- Comparison result:
  - workflow actions still succeed
  - the UI remains materially worse than the original screenshots in topic-pane hierarchy, nested-thread legibility, toolbar obviousness, and gadget-entry feel

Latest complex workflow repair note (2026-03-31)
- `screenshots/260331-complex-workflow-pass14/` is the fresh rebuilt verification pack captured on `master` against `http://127.0.0.1:4197`.
- Key accepted corrections:
  - topic edit mode no longer collapses to a blank placeholder paragraph
  - the topic body remains visible in steps 8-10 while the gadget palette opens and a poll is inserted
  - done mode persists the poll without erasing the original topic body
- Most important implementation note:
  - `src/client/components/RizzomaTopicDetail.tsx` now seeds topic editing from the visible read-mode topic body when available and avoids the unstable topic-root collaboration bootstrap path
- Remaining honest gap:
  - the UI is still not visually equal to the legacy Rizzoma screenshots, but the catastrophic root-topic edit/body-loss regression from the earlier audit is fixed

Latest complex workflow polish note (2026-03-31)
- `screenshots/260331-complex-workflow-pass15/` is the follow-up acceptance pack on `master` against `http://127.0.0.1:4197`.
- Accepted correction:
  - the right-rail gadget palette reads more like an anchored utility flyout
  - the topic toolbar strip is more legible and less visually lost
  - the repaired root-topic body preservation still holds through poll insertion + done mode

Latest complex workflow nested-readability note (2026-03-31)
- `screenshots/260331-complex-workflow-pass19/` is the latest accepted pack on `master` against a fresh forced client at `http://127.0.0.1:4198`.
- Accepted correction:
  - nested reply cards are denser and less washed out
  - the inline-comments degraded-state banner is smaller and less dominant
  - the poll gadget is more compact inside nested replies
  - the repaired root-topic workflow still holds end to end on the fresh client
- Honest boundary:
  - this is better than `pass15`, not final legacy parity
  - the warning banner still exists and the thread surface is still cleaner in the original screenshots

Latest hard structural gap note (2026-03-31)
- `docs/RIZZOMA_HARD_GAP_LIST_260331.md` replaces the “just keep polishing” mindset for this area.
- Current judgment:
  - the remaining failures are structural violations of the documented/original Rizzoma model, not ordinary visual debt
- Immediate next priorities from that gap list:
  - remove detached title/body behavior
  - remove the alien inline-comments nav/filter surface
  - reimplement anchored inline comments as a first-class interaction again

Latest hard-gap execution note (2026-03-31)
- `screenshots/260331-complex-workflow-pass23/` is the first trusted execution batch from the hard-gap list on `master`, captured on a fresh client at `http://127.0.0.1:4199`.
- Accepted correction:
  - the alien inline-comments side panel is gone from the live workflow surface
  - the edit/poll workflow is visibly cleaner because the `Inline comments / All / Open / Resolved` product detour no longer renders inside the thread area
- Important boundary:
  - this does **not** mean inline comments are fixed
  - it means the wrong non-Rizzoma inline-comments surface was successfully removed
  - the next required step is to restore real anchored inline-comment behavior

Latest anchored inline-comment note (2026-03-31)
- `screenshots/260331-inline-comment-audit-pass3/` is the trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4200`.
- Accepted correction:
  - `Ctrl+Enter` inserts a real `[+]` marker into topic content
  - `Done` preserves that marker in topic view
  - clicking `[+]` now changes the URL into the anchored subblip path
- Matching broad workflow regression pack:
  - `screenshots/260331-complex-workflow-pass24/`
- Important boundary:
  - the resulting subblip page is still visually underpowered
  - but the live inline-comment interaction is now back on the anchored subblip model rather than the removed annotation/filter product

Latest inline-comment round-trip note (2026-04-01)
- `screenshots/260401-inline-comment-audit-pass25/` is the current trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4201`.
- Accepted correction:
  - `Ctrl+Enter` inserts the anchored marker
  - the subblip opens on its own route
  - `Done` reaches subblip read mode
  - `Hide` returns to the parent topic with the marker still present
  - clicking that parent marker reopens the subblip route
- Important boundary:
  - the parent topic currently returns in topic edit mode after `Hide`
  - the round trip is structurally correct again, but still visually weaker than legacy Rizzoma

Latest inline-comment parent-return note (2026-04-01)
- `screenshots/260401-inline-comment-audit-pass40/` is the current trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4202`.
- Accepted correction:
  - after `Hide`, the parent topic now returns in read mode
  - the root toolbar shows `Edit`, not `Done`
  - the anchored `[+]` marker is visible in topic view
  - clicking that marker reopens the subblip route
- Important boundary:
  - the remaining hard gap is now the weak visual treatment of the subblip page itself
  - the parent-return shell is no longer the blocker

Latest inline-comment typed-round-trip note (2026-04-01)
- `screenshots/260401-inline-comment-audit-pass44/` is the current trusted focused audit on `master`, captured on a fresh client at `http://127.0.0.1:4203`.
- Accepted correction:
  - typed subblip content survives into subblip read mode after `Done`
  - `Hide` still returns to the parent topic in read mode
  - one anchored `[+]` marker remains visible in topic view
  - clicking that marker still reopens the subblip route
- Important boundary:
  - the remaining hard gap is now mostly visual parity of the subblip page itself
  - the structural inline-comment route cycle is holding again
