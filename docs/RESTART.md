## Restart Checklist (Same Folder, Any Machine)

Last refreshed: 2026-04-15 (`master`, FtG + collab audit — BUG #58 FEAT_ALL default, BUG #57 Y.js sync path + seed lock, BUG #56 `/api/topics` cache-control. Three commits pushed through `a2b32294`; close-out UX commit pending. New APK `2026.04.15.0231` on GDrive. See `docs/worklog-260415.md`.)

Last refreshed (prior): 2026-03-31 (`master`, cross-session gadget preference lifecycle accepted on fresh client)

Branch context guardrails:
- Active branch: `master` (as of 2026-02-25). Always cite branch + date when sharing status; refresh any “Current State” bullets for this branch before quoting.
- `docs/HANDOFF.md` now reflects `master` as of 2026-02-25; refresh if more changes land.
- Re-read checkpoint: 2026-02-04 01:55 local — BLB child unread highlight removed (green [+] only) and BLB snapshots refreshed (`snapshots/blb/1770165748162-*`); drift warnings below remain accurate (note `docs/LINKS_REPARENT.md` is still missing).
- 2026-03-29 reality check: Docker Desktop WSL integration is required again for local live verification. The `src/server/app.ts` fallback route uses `'/{*path}'` which is the canonical Express 5 / path-to-regexp v8 syntax (previously called a "workaround" — see Hard Gap #29, 2026-04-13 for the cleanup that confirmed this and reordered the `/uploads` static handler ahead of the SPA catch-all).

Private repo note:
- Direct work on `master` is allowed for this private/solo repo.
- Keep `master-archive-2026-02-24` as rollback anchor; use short-lived feature branches only for risky work.

Quick start for the next batch (copy/paste):
```
codex exec '
  Only edit files inside this repo; no external network/browsers unless via gh.

  Always-On Loop:
    - Treat every prompt as permission to continue the full Analyze -> Execute -> Verify -> Commit -> Document cycle.
    - Do not stop between tasks unless blocked by a critical permission error or an unresolvable logical impasse.
    - After each commit/push, immediately select the next smallest scoped task and repeat.

  Step 0: 
    - Check the current date/time.
    - Run "git checkout master" immediately - that is the currently active branch we're working in.
    - Re-read RESTORE_POINT.md, README_MODERNIZATION.md, docs/HANDOFF.md, docs/RESTART.md, and any Markdown changed in the last 31 days; capture drift into RESTORE_POINT.md and the handoff/restart guides, then tick the meta prerequisites and update the checkpoint timestamp in RESTORE_POINT.md.
  Step 0.1:
    - Run "npm run lint:branch-context" to ensure docs/HANDOFF.md current-state heading matches the active branch (uses git HEAD fallback; set BRANCH_NAME if needed). Re-run after any doc edits.
  Step 0.2:
    - If you need the dev stack, run `./scripts/start-all.sh` (now warns + continues if `sphinx` is missing/slow) or the manual flow (`docker compose up -d couchdb redis` + `FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev`). Ensure `http://localhost:3000/` is reachable before Playwright.
    - If Docker is missing in WSL, re-enable Docker Desktop -> Settings -> Resources -> WSL Integration for the active distro before continuing.

  Priority focus:
  0) Build on the registry-backed gadget baseline: the trusted embed adapter/node path is accepted for `YouTube`, `Sheet`, `iFrame`, and `Image`; the cleaned app-frame runtime path is accepted for Planner, Focus, and Kanban; the Store controls real preview-app install/remove state for the gadget picker on the clean `:4196` client; that lifecycle persists through the authenticated `/api/gadgets/preferences` path; and fresh-login lifecycle verification now passes with explicit `schemaVersion`, `scope: user`, defaults, and reset behavior. Next move is to use that stable runtime/store baseline to keep pushing BLB/live parity work.
  1) Perf/resilience sweeps for large waves, inline comments, playback, unread flows, and mobile; move beyond `perfRender=lite` and reduce full-render TTF/memory. Lite-mode perf harness now passes (stage duration ~1.5s landing / ~0.5s expanded, memory 23MB) but full render still needs work.
  2) BLB parity: enforce single-container topic pane (title as first line of the meta-blip body), inline [+] marker click behavior/styling (snapshot harness clicks the marker directly), per-blip toolbar parity (toolbar only for expanded blips), unread green markers, and update BLB snapshots. Latest set: `snapshots/blb/1770165748162-*` (2026-02-04).
  3) Toolbar parity: `test:toolbar-inline` now asserts the read toolbar (expanded via collapsed rows). Keep the read toolbar present and smokes green.
  4) Keep health checks and CI gating for /api/health, inline comments, uploads wired (health-checks job runs npm run test:health); keep browser smokes green (toolbar-inline + follow-green desktop/mobile with FEAT_ALL=1).
  5) Automate bundles/backups (bundle + GDrive copy) and document cadence (`scripts/backup-bundle.sh`).
  6) Finish CoffeeScript/legacy cleanup and dependency upgrades; decide legacy static assets (note: `.coffee` files remain only in `original-rizzoma-src/` reference tree).

  Testing/CI hygiene:
  - Keep npm run test:toolbar-inline and npm run test:follow-green green; snapshots live under snapshots/<feature>/ and are uploaded as Actions artifacts.
  - Update TESTING_STATUS.md and RIZZOMA_FEATURES_STATUS.md after targeted runs; call out gaps.
  - If you need fresh screenshots without rerunning Playwright locally, run: npm run snapshots:pull

  Stop after this batch, refresh RESTORE_POINT.md to mark completions and the new checkpoint timestamp, and rewrite the Codex exec block in AGENTS.md (plus this mirror snippet if it changed) with the next batch's starting steps before exiting to bash.'
```

Latest screenshot/parity archive (2026-02-25):
- `screenshots/260225/INDEX.md`
- `screenshots/260225/TODAY_RUN_EXHAUSTIVE_ANALYSIS_260225.md`
- `screenshots/260225/COMPARISON_EXHAUSTIVE_260225.md`
- `screenshots/260225/ui-exhaustive-1771981300160/` (175 screenshots + 175 per-screenshot notes)
- `docs/UI_ELEMENTS_EXHAUSTIVE.md`

Latest live verification artifacts:
- `screenshots/260329-live/topic-c7febb62dc333aa08f4a50aea8004efc.png`
- `screenshots/260329-live/blb-study-expanded.png`
- `screenshots/260329-live/blb-study-topic-root.png`
- `screenshots/260330-poll-fix/test-editor-poll-4174.png`
- `screenshots/260330-poll-fix/test-editor-poll-4174.html`
- `screenshots/260330-live-ui/blb-topic-v5.png`
- `screenshots/260330-live-ui/blb-topic-v5.html`
- `screenshots/260330-live-poll/live-topic-poll-v15.png`
- `screenshots/260330-live-poll/live-topic-poll-v15.html`
- `screenshots/260330-live-poll/live-topic-palette-v8.png`
- `screenshots/260330-live-poll/live-topic-palette-v8.html`
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
- `screenshots/260330-app-runtime/live-store-panel-v2.png`
- `screenshots/260330-app-runtime/live-store-panel-v2.html`
- `screenshots/260330-app-runtime/live-topic-kanban-v3.png`
- `screenshots/260330-app-runtime/live-topic-kanban-v3.html`
- `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png`
- `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.html`
- `screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json`
- `screenshots/260330-app-runtime/live-topic-planner-debug-mutation-traffic.json`
- `screenshots/260330-app-runtime/topic-patch-log.ndjson`
- `screenshots/260330-app-runtime/runtime-harness-planner-v1.png`
- `screenshots/260330-app-runtime/runtime-harness-planner-v1.html`
- `screenshots/260330-app-runtime/runtime-harness-focus-v1.png`
- `screenshots/260330-app-runtime/runtime-harness-focus-v1.html`

Latest accepted UI baseline (2026-03-30):
- Trust the clean feature-flagged Vite client at `http://127.0.0.1:4175` for the most recent UI work. Earlier long-lived `:3000` / `:4174` processes were stale during part of the visual pass.
- Accepted live-shell artifact: `screenshots/260330-live-ui/blb-topic-v5.png`
- Accepted isolated gadget artifact: `screenshots/260330-poll-fix/test-editor-poll-4174-v4.png`
- Accepted fresh authenticated live gadget artifact: `screenshots/260330-live-poll/live-topic-poll-v15.png`
- Accepted registry-backed live picker artifact: `screenshots/260330-live-poll/live-topic-palette-v8.png`
- For the final live gadget verification, use the fresh feature-flagged client at `http://127.0.0.1:4176`.
- Accepted trusted-embed artifact: `screenshots/260330-embed-adapters/live-topic-youtube-v4.png`
- Accepted trusted-embed error-state artifact: `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.png`
- Accepted trusted-embed expansion artifacts:
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.png`
- For the trusted-embed verification pass, use the fresh feature-flagged client at `http://127.0.0.1:4180`.
- Accepted app-runtime/store artifact: `screenshots/260330-app-runtime/live-store-panel-v2.png`
- For Store/runtime verification, use the forced fresh client at `http://127.0.0.1:4181`.
- Accepted in-topic sandboxed app artifact: `screenshots/260330-app-runtime/live-topic-kanban-v3.png`
- For topic-app verification, use the forced fresh client at `http://127.0.0.1:4182`.
- Accepted planner-persistence artifact: `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png`
- For the planner persistence verification, use the fresh feature-flagged client at `http://127.0.0.1:4192`; earlier `:4191` output was stale and still showed the pre-fix overwrite behavior.
- Accepted shared-runtime harness artifacts:
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.png`
- For the generalized shell verification, use `http://localhost:3001/test-app-runtime.html` with `scripts/capture_live_topic_app.cjs` in harness mode; the local authenticated topic-app path was unstable during this sub-batch and still needs a cleanup pass before it can be treated as the fresh source of truth again.
- Latest accepted BLB topic-root parity pass (2026-03-31):
  - Accepted artifact: `screenshots/260331-blb-parity/blb-probe-v1.png`
  - Source of truth: clean feature-flagged client at `http://127.0.0.1:4196`
  - Verifier: `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-parity`
  - This probe now seeds a denser BLB-style topic root with nested lists and inline thread markers, so it is a better shell-density comparison than the earlier sparse probe.
- Latest accepted BLB inline-thread parity pass (2026-03-31):
  - Accepted artifact: `screenshots/260331-blb-inline/blb-inline-probe-v1.png`
  - Source of truth: clean feature-flagged client at `http://127.0.0.1:4196`
  - Verifier: `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-inline inline`
  - This probe creates a root inline child plus a nested inline child, clicks both `[+]` markers, and captures the authenticated topic shell after real threaded expansion.
- Latest accepted BLB mixed-thread parity pass (2026-03-31):
  - Accepted artifact: `screenshots/260331-blb-mixed/blb-mixed-probe-v1.png`
  - Source of truth: clean feature-flagged client at `http://127.0.0.1:4196`
  - Verifier: `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-mixed mixed`
  - This probe combines root inline-thread expansion and a separate list-thread reply with a nested child on the same live topic surface.
- Latest accepted BLB unread-thread parity pass (2026-03-31):
  - Accepted artifact: `screenshots/260331-blb-unread/blb-unread-probe-v1.png`
  - Source of truth: clean feature-flagged client at `http://127.0.0.1:4196`
  - Verifier: `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-unread unread`
  - This probe uses the real read-state route to create a believable mix of green unread markers, gray read markers, an active inline-expanded unread thread with toolbar, and a collapsed list-thread row that stays unread because of a nested child.
- Latest accepted BLB toolbar-state parity pass (2026-03-31):
  - Accepted artifact: `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.png`
  - Source of truth: clean feature-flagged client at `http://127.0.0.1:4196`
  - Verifier: `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-toolbar toolbar`
  - This probe proves the expanded-vs-collapsed toolbar contract in the same live topic surface after hardening collapsed-row expansion in `src/client/components/blip/RizzomaBlip.tsx` and flattening `src/client/components/blip/BlipMenu.css` toward the legacy toolbar strip.
- Latest accepted dense live BLB scenario baseline (2026-03-31):
  - Accepted artifact: `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.png`
  - Source of truth: clean feature-flagged client at `http://127.0.0.1:4196`
  - Verifier: `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4196 screenshots/260331-blb-live-scenario`
  - This is the current richer authenticated BLB baseline for parity work: a plausible business-topic shell with mixed inline/list unread states, two expanded list replies, and a collapsed unread comparison reply in one accepted live capture.
  - DOM-state acceptance condition from the verifier: `expandedReplyCount = 2`, `visibleToolbarCount = 1`, `primaryExpandedIsActive = true`.
  - Follow-up note: after centralizing non-root blip activation through a shared active-blip path in `src/client/components/blip/RizzomaBlip.tsx`, the accepted single-toolbar probe still passes, but the richer multi-reply live scenario remains open and needs a fresh accepted closeout before this denser case can be treated as settled again.

Codex exec (restart codex):
```
codex exec '
  Rehydrate context:
  - npm run snapshots:pull (fetch latest browser-smoke artifacts into snapshots/<feature>/)
  - Re-read RESTORE_POINT.md and docs/HANDOFF.md for drift/backlog.
  - Verify CI outcomes on browser-smokes; keep snapshots/artifacts current.
'
```

### Drift warnings
- Status/onboarding docs (`README*.md`, `README_MODERNIZATION.md`, `MODERNIZATION_STRATEGY.md`, `PARALLEL_DEVELOPMENT_PLAN.md`) still describe demo-mode shortcuts or “all core features green” timelines; treat them as historical until we rewrite them with the current perf harness + CI gating requirements.
- Phase language (e.g., `modernization/phase1` or “Phase 1 ready”) in README/modernization strategy docs is historical and not authoritative for `feature/rizzoma-core-features`; use `RIZZOMA_FEATURES_STATUS.md` for the current branch snapshot (perf/getUserMedia/health/backups remain outstanding).
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` summarize the latest coverage/gaps but rely on the last recorded runs; rerun targeted suites before trusting them.
- Demo-mode login is gone: use real sessions through `AuthPanel`, not `?demo=true`.
- Playwright smokes are required for merges: `browser-smokes` runs `npm run test:toolbar-inline` + `npm run test:follow-green`, uploads `snapshots/<feature>/` artifacts, and runs even if build fails so snapshots/artifacts are always available. Pull them locally via `npm run snapshots:pull`.
- `docs/LINKS_REPARENT.md` was removed; restore or replace before linking to it.
- `README_MODERNIZATION.md` still reads like Phase 1 is largely complete and omits the perf/getUserMedia/health/backups backlog; rewrite before citing it.
- `docs/EDITOR_REALTIME.md` still lists presence/recovery/search as upcoming even though they shipped; update the roadmap to match the current backlog focus.
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` reflect historical Dec 2025 runs; rerun suites before relying on them.
- Remaining historical docs still recommend `npm run start:all` or demo-mode flows that do not reflect the current perf/backups/health backlog or the real-auth requirement; treat them strictly as historical checklists until rewritten.
- Operational scripts (`scripts/deploy-updates.sh`, `scripts/create-bundle.sh`) still reference demo-mode URLs; treat those references as historical and update if the scripts are reused.
- Landing view parity: topic landing must match `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png` (root labels only, children/editor hidden until “+” is clicked). Keep perf harness landing metric on this collapsed state; measure expansions separately.

1) Node and npm
- Require Node 20.19.0: `node -v` → `v20.19.0`
- If needed: `nvm install 20.19.0 && nvm use 20.19.0`

2) Dependencies
- Install: `npm ci` (or `npm install`)

3) Services
- Docker Desktop with WSL integration ON (if on Windows/WSL)
- Start: `docker compose up -d couchdb redis` (add `clamav` if you plan to set `CLAMAV_HOST`/`CLAMAV_PORT` for upload scanning)
- If you want full container mode (including app in Docker), run:
  `docker compose up -d app couchdb redis rabbitmq sphinx minio clamav`
  - This starts the actual app container `rizzoma-app`.
  - Local-dev mode still uses host app (`npm run dev`) with Docker only for infra.

4) Legacy Views (if DB lacks them)
- `npm run prep:views && npm run deploy:views`

5) Run Dev
- `npm run dev` → server :8788 (reserved Rizzoma backend port — see CLAUDE.md "Reserved Ports"), client :3000 (set `FEAT_ALL=1`; for smokes you can run `SESSION_STORE=memory REDIS_URL=memory://`)
- Open http://localhost:3000

### OAuth provider notes (port-migration aware, 2026-04-13)

Local dev OAuth credentials live in `.env` (gitignored):

| Provider | Env var | Cloud console project | Notes |
|---|---|---|---|
| Google | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Google Cloud project **Rizzoma** (Client ID prefix `46844340633-`) | Authorized redirect URI must include `http://localhost:8788/api/auth/google/callback` after the task #33 port migration from `:8000` to `:8788`. Both entries can coexist. |
| Microsoft | `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` | Azure App Registration (Client ID prefix `75dcf1a5-`) | Same port-migration caveat applies — needs `http://localhost:8788/api/auth/microsoft/callback` in the Azure app's redirect URI list if you use Microsoft sign-in locally. |

If you see `Error 400: redirect_uri_mismatch` at sign-in, the Cloud Console for that provider still has only the pre-migration `:8000` callback whitelisted; add the `:8788` variant and retry — no server restart needed.

Local email/password signup via the AuthPanel "Sign Up" tab always works without any OAuth config and is the fastest unblock if you just want to poke at the UI.

6) Editor Flag
- To enable editor endpoints: set `EDITOR_ENABLE=1`
  - For follow-green/toolbar smokes, also set `FEAT_ALL=1` for both server and Vite.

7) Verifications
- Typecheck: `npm run typecheck`
- Tests: `npm test`
- Build: `npm run build`
- Planner runtime sanity (accepted 2026-03-30 on `master`):
  - `node scripts/probe_live_planner_iframe.cjs http://127.0.0.1:4193`
  - `node scripts/capture_live_topic_app.cjs screenshots/260330-app-runtime/live-topic-planner-vfinal.png screenshots/260330-app-runtime/live-topic-planner-vfinal.html http://127.0.0.1:4193 Planner`
- BLB dense live toolbar-focus sanity (accepted 2026-03-31 on `master`):
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - accepted artifact: `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}` (naturalized business-thread copy + uneven unread grandchild mix + single-toolbar contract)
- BLB dense live mobile sanity (accepted 2026-03-31 on `master`):
  - `node scripts/capture_blb_live_scenario_mobile.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario-mobile`
  - accepted artifact: `screenshots/260331-blb-live-scenario-mobile/blb-live-scenario-mobile-v1.{png,html}` (same dense live scenario, tightened narrow-screen toolbar/header footprint, single-toolbar contract preserved)
- BLB dense live perf sanity (baseline added 2026-03-31 on `master`):
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - metrics artifact: `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
  - current accepted baseline after state-based waits:
    - `initialLoadMs = 290`
    - `inlineExpandMs = 308`
    - `inlineActivateMs = 280`
    - `primaryExpandMs = 19`
    - `secondaryExpandMs = 25`
    - `primaryActivateMs = 44`
    - `totalScenarioMs = 5276`
  - current accepted widened state:
    - `expandedReplyCount = 2`
    - `visibleToolbarCount = 1`
    - `collapsedUnreadHasUnreadIcon = true`
    - `collapsedReadVisible = true`
    - `domBlipCount = 6`
  - current accepted less-uniform timing snapshot:
    - `initialLoadMs = 348`
    - `inlineExpandMs = 416`
    - `inlineActivateMs = 246`
    - `primaryExpandMs = 81`
    - `secondaryExpandMs = 120`
    - `primaryActivateMs = 42`
    - `totalScenarioMs = 5227`
  - current accepted messier top-level state:
    - `expandedReplyCount = 2`
    - `visibleToolbarCount = 1`
    - `midCollapsedVisible = true`
    - `collapsedUnreadHasUnreadIcon = true`
    - `collapsedReadVisible = true`
    - `domBlipCount = 7`
  - current accepted messier timing snapshot:
    - `initialLoadMs = 410`
    - `inlineExpandMs = 360`
    - `inlineActivateMs = 425`
    - `primaryExpandMs = 60`
    - `secondaryExpandMs = 103`
    - `primaryActivateMs = 43`
    - `totalScenarioMs = 5432`
- Perf harness (optional large-wave sanity): `npm run perf:harness` (seeds a 5k-blip wave and captures time-to-first-render metrics/screenshots under `snapshots/perf/`); log metrics/budgets when you run it.
  - Recent runs: 200-blip PASS (TTF 2173.8ms, FCP 260ms, 101/200 rendered); 1000-blip PASS (2026-02-02) with `perfRender=lite` + `perfLimit=1000` + `x-rizzoma-perf=1` (stage duration ~1.5s landing / ~0.5s expanded, memory 23MB, 1000/1000 rendered; windowed 200 ~2.6–2.9s). Check budgets via `scripts/perf-budget.mjs`.

8) PR Workflow (CLI)
- Create PR: `gh pr create -R HCSS-StratBase/rizzoma -B master -H <branch> -t "Title" -F <body.md>`
- Update body: `gh api -X PATCH /repos/HCSS-StratBase/rizzoma/pulls/<num> -f body@body.md`
- Merge (squash): `gh pr merge <num> --squash --delete-branch --admin`

9) Backup
- Script: `scripts/backup-bundle.sh` (runs bundle + PowerShell copy; honors `RIZZOMA_BUNDLE_PATH` + `RIZZOMA_GDRIVE_DIR` overrides).
- Bundle (manual): `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy: see commands in `docs/HANDOFF.md` (last run 2026-02-03).

Current BLB dense-live caveat (2026-03-31)
- `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}` now reflects the corrected topic/meta-blip structure on `master` plus restored single-toolbar ownership on a fresh client.
- Latest accepted run: `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4198 screenshots/260331-blb-live-scenario`
- Accepted state:
  - `expandedReplyCount = 3`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
  - `mainThreadExpandedVisible = true`
  - `primaryExpandedVisible = true`
  - `secondaryExpandedVisible = true`
  - `midCollapsedVisible = true`
  - `collapsedUnreadVisible = true`
  - `collapsedReadVisible = true`
  - `rootFollowUpVisible = true`

Current live workflow sanity note (2026-03-31)
- `node scripts/explore_live_blip_workflow.cjs screenshots/260331-workflow-exploration/workflow-v1.png screenshots/260331-workflow-exploration/workflow-v1.html screenshots/260331-workflow-exploration/workflow-v1.json http://127.0.0.1:4198`
- This validates the ordinary live path on `master`:
  - root reply create
  - root reply expand
  - nested reply form open
  - nested reply submit
  - topic edit mode enter
  - gadget palette open

Current complex workflow audit note (2026-03-31)
- `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow http://127.0.0.1:4198`
- This generates the larger step-by-step live workflow pack under `screenshots/260331-complex-workflow/` and the comparison write-up in `screenshots/260331-complex-workflow/ANALYSIS.md`.
- Current judgment from that audit:
  - the real workflow still runs
  - the modern UI is still materially worse than the original Rizzoma screenshots in hierarchy, nesting readability, toolbar salience, and gadget-entry anchoring

Current complex workflow repair note (2026-03-31)
- `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass14 http://127.0.0.1:4197`
- This is the fresh rebuilt acceptance pack for the same workflow after the repair pass.
- Accepted correction:
  - topic edit mode now keeps the root topic body
  - gadget insertion no longer wipes the topic body
  - done mode persists both the poll and the original topic text
- Use this pack, not the older `screenshots/260331-complex-workflow/` audit, as the current truth for whether the root topic editing flow is fundamentally broken.

Current complex workflow polish note (2026-03-31)
- `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass15 http://127.0.0.1:4197`
- This is the latest accepted visual polish pack for the repaired workflow.
- Use it to judge the current edit-band/tool-flyout quality after the root-topic fix.

Current complex workflow nested-readability note (2026-03-31)
- `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass19 http://127.0.0.1:4198`
- This is the latest accepted pack after tightening nested-thread density, demoting the inline-comments warning, and compacting the poll gadget inside replies.
- Use it, not `pass15`, as the current truth for the live nested-reply readability state after the root-topic fix.

Current hard structural gap note (2026-03-31)
- Re-read and use:
  - `docs/RIZZOMA_HARD_GAP_LIST_260331.md`
- Treat that file as the governing next-step document for this area.
- Do not accept more “polish” work here unless it directly resolves one of the hard gaps:
  - title/body unity
  - true inline comments
  - removal of the alien inline-comments nav/filter surface
  - deterministic active-blip edit behavior

Current hard-gap execution note (2026-03-31)
- `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass23 http://127.0.0.1:4199`
- Use `pass23`, not the earlier `pass19` / `pass21` captures, to judge whether the alien inline-comments surface still pollutes the workflow.
- Accepted correction in `pass23`:
  - the `Inline comments / All / Open / Resolved` panel is gone from the actual live workflow surface
- Next required hard-gap step:
  - restore true anchored inline-comment behavior rather than only removing the wrong UI

Current anchored inline-comment note (2026-03-31)
- `node scripts/capture_live_inline_comment_flow.cjs screenshots/260331-inline-comment-audit-pass3 http://127.0.0.1:4200`
- Use `pass3` as the current truth for the focused inline-comment path.
- Accepted result:
  - `Ctrl+Enter` inserts the anchored `[+]` marker
  - `Done` preserves it in topic view
  - clicking `[+]` changes the URL into the subblip path
- Matching broad workflow regression check:
  - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass24 http://127.0.0.1:4200`
- Honest boundary:
  - the subblip view reached by the marker is still visually too weak and remains active hard-gap territory

Current inline-comment round-trip note (2026-04-01)
- `node scripts/capture_live_inline_comment_flow.cjs screenshots/260401-inline-comment-audit-pass25 http://127.0.0.1:4201`
- Use `pass25` as the current truth for the focused inline-comment route cycle.
- Accepted result:
  - anchored marker creation works
  - subblip route opens directly
  - `Done` reaches subblip read mode
  - `Hide` returns to the parent topic with the marker still present
  - clicking the parent marker reopens the subblip route
- Honest boundary:
  - after `Hide`, the parent topic currently returns in topic edit mode with the marker preserved in the editor DOM
  - the next hard-gap step is to make that parent-return presentation feel like real Rizzoma, not just structurally correct

Current inline-comment parent-return note (2026-04-01)
- `node scripts/capture_live_inline_comment_flow.cjs screenshots/260401-inline-comment-audit-pass40 http://127.0.0.1:4202`
- Use `pass40` as the current truth for the focused inline-comment route cycle.
- Accepted result:
  - the parent topic now returns in read mode after `Hide`
  - the parent toolbar shows `Edit`
  - one anchored `[+]` marker remains visible in topic view
  - clicking the marker reopens the subblip route
- Honest boundary:
  - the remaining hard-gap work is the subblip page presentation itself, not the parent-return mode

Current inline-comment typed-round-trip note (2026-04-01)
- `node scripts/capture_live_inline_comment_flow.cjs screenshots/260401-inline-comment-audit-pass44 http://127.0.0.1:4203`
- Use `pass44` as the current truth for the focused inline-comment route cycle.
- Accepted result:
  - typed subblip content survives into subblip read mode after `Done`
  - `Hide` returns to the parent topic in read mode
  - one anchored `[+]` marker remains visible in topic view
  - clicking that marker reopens the subblip route
- Honest boundary:
  - the remaining hard-gap work is the visual quality of the subblip page itself, not the core route cycle
