## Restart Checklist (Same Folder, Any Machine)

Branch context guardrails:
- Active branch: `feature/rizzoma-core-features`. Always cite branch + date when sharing status; refresh any “Current State” bullets for this branch before quoting.
- `docs/HANDOFF.md` now reflects `feature/rizzoma-core-features` as of 2026-02-02; refresh if more changes land.
- Re-read checkpoint: 2026-02-02 19:20 local — topic meta-blip single-pane update + Playwright reruns captured; drift warnings below remain accurate (note `docs/LINKS_REPARENT.md` is still missing).

Quick start for the next batch (copy/paste):
```
codex exec '
  Only edit files inside this repo; no external network/browsers unless via gh.

  Step 0: 
    - Check the current date/time.
    - Run "git checkout feature/rizzoma-core-features" immediately - that is the currently active branch we're working in.
    - Re-read RESTORE_POINT.md, README_MODERNIZATION.md, docs/HANDOFF.md, docs/RESTART.md, and any Markdown changed in the last 31 days; capture drift into RESTORE_POINT.md and the handoff/restart guides, then tick the meta prerequisites and update the checkpoint timestamp in RESTORE_POINT.md.
  Step 0.1:
    - Run "npm run lint:branch-context" to ensure docs/HANDOFF.md current-state heading matches the active branch (uses git HEAD fallback; set BRANCH_NAME if needed). Re-run after any doc edits.

  Priority focus:
  1) Perf/resilience sweeps for large waves, inline comments, playback, unread flows, and mobile; move beyond `perfRender=lite` and reduce full-render TTF/memory. Lite-mode perf harness now passes (stage duration ~1.5s landing / ~0.5s expanded, memory 23MB) but full render still needs work.
  2) BLB parity: enforce single-container topic pane (title as first line of the meta-blip body), inline [+] marker click behavior/styling (snapshot harness clicks the marker directly), per-blip toolbar parity, unread green markers, and update BLB snapshots.
  3) Toolbar parity: `test:toolbar-inline` now asserts the read toolbar (expanded via collapsed rows). Keep the read toolbar present and smokes green.
  4) Keep health checks and CI gating for /api/health, inline comments, uploads wired (health-checks job runs npm run test:health); keep browser smokes green (toolbar-inline + follow-green desktop/mobile with FEAT_ALL=1).
  5) Automate bundles/backups (bundle + GDrive copy) and document cadence (`scripts/backup-bundle.sh`).
  6) Finish CoffeeScript/legacy cleanup and dependency upgrades; decide legacy static assets (note: `.coffee` files remain only in `original-rizzoma-src/` reference tree).
  7) Topic render unification: follow `docs/TOPIC_RENDER_UNIFICATION.md` to reuse `RizzomaBlip` for meta‑blip body.

  Testing/CI hygiene:
  - Keep npm run test:toolbar-inline and npm run test:follow-green green; snapshots live under snapshots/<feature>/ and are uploaded as Actions artifacts.
  - Update TESTING_STATUS.md and RIZZOMA_FEATURES_STATUS.md after targeted runs; call out gaps.
  - If you need fresh screenshots without rerunning Playwright locally, run: npm run snapshots:pull

  Stop after this batch, refresh RESTORE_POINT.md to mark completions and the new checkpoint timestamp, and rewrite the Codex exec block in AGENTS.md (plus this mirror snippet if it changed) with the next batch's starting steps before exiting to bash.'
```

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
- Status/onboarding docs (`README*.md`, `QUICKSTART.md`, `README_MODERNIZATION.md`, `MODERNIZATION_STRATEGY.md`, `PARALLEL_DEVELOPMENT_PLAN.md`, `TESTING_GUIDE.md`, `MANUAL_TEST_CHECKLIST.md`, `CLAUDE.md`) still describe demo-mode shortcuts or “all core features green” timelines; treat them as historical until we rewrite them with the current perf harness + CI gating requirements.
- Phase language (e.g., `modernization/phase1` or “Phase 1 ready”) in README/modernization strategy docs is historical and not authoritative for `feature/rizzoma-core-features`; use `RIZZOMA_FEATURES_STATUS.md` for the current branch snapshot (perf/getUserMedia/health/backups remain outstanding).
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` summarize the latest coverage/gaps but rely on the last recorded runs; rerun targeted suites before trusting them.
- Demo-mode login is gone: use real sessions through `AuthPanel`, not `?demo=true`.
- Playwright smokes are required for merges: `browser-smokes` runs `npm run test:toolbar-inline` + `npm run test:follow-green`, uploads `snapshots/<feature>/` artifacts, and runs even if build fails so snapshots/artifacts are always available. Pull them locally via `npm run snapshots:pull`.
- `docs/LINKS_REPARENT.md` was removed; restore or replace before linking to it.
- `README_MODERNIZATION.md` still reads like Phase 1 is largely complete and omits the perf/getUserMedia/health/backups backlog; rewrite before citing it.
- `docs/EDITOR_REALTIME.md` still lists presence/recovery/search as upcoming even though they shipped; update the roadmap to match the current backlog focus.
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` reflect historical Dec 2025 runs; rerun suites before relying on them.
- `QUICKSTART.md`, `TESTING_GUIDE.md`, and `CLAUDE.md` continue to recommend `npm run start:all`/auto-commit/demo-mode flows that do not reflect the current perf/backups/health backlog or the real-auth requirement; treat them strictly as historical checklists until rewritten.
- Landing view parity: topic landing must match `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png` (root labels only, children/editor hidden until “+” is clicked). Keep perf harness landing metric on this collapsed state; measure expansions separately.

1) Node and npm
- Require Node 20.19.0: `node -v` → `v20.19.0`
- If needed: `nvm install 20.19.0 && nvm use 20.19.0`

2) Dependencies
- Install: `npm ci` (or `npm install`)

3) Services
- Docker Desktop with WSL integration ON (if on Windows/WSL)
- Start: `docker compose up -d couchdb redis` (add `clamav` if you plan to set `CLAMAV_HOST`/`CLAMAV_PORT` for upload scanning)

4) Legacy Views (if DB lacks them)
- `npm run prep:views && npm run deploy:views`

5) Run Dev
- `npm run dev` → server :8000, client :3000 (set `FEAT_ALL=1`; for smokes you can run `SESSION_STORE=memory REDIS_URL=memory://`)
- Open http://localhost:3000

6) Editor Flag
- To enable editor endpoints: set `EDITOR_ENABLE=1`
  - For follow-green/toolbar smokes, also set `FEAT_ALL=1` for both server and Vite.

7) Verifications
- Typecheck: `npm run typecheck`
- Tests: `npm test`
- Build: `npm run build`
- Perf harness (optional large-wave sanity): `npm run perf:harness` (seeds a 5k-blip wave and captures time-to-first-render metrics/screenshots under `snapshots/perf/`); log metrics/budgets when you run it.
  - Recent runs: 200-blip PASS (TTF 2173.8ms, FCP 260ms, 101/200 rendered); 1000-blip PASS (2026-02-02) with `perfRender=lite` + `perfLimit=1000` + `x-rizzoma-perf=1` (stage duration ~1.5s landing / ~0.5s expanded, memory 23MB, 1000/1000 rendered; windowed 200 ~2.6–2.9s). Check budgets via `scripts/perf-budget.mjs`.

8) PR Workflow (CLI)
- Create PR: `gh pr create -R HCSS-StratBase/rizzoma -B master -H <branch> -t "Title" -F <body.md>`
- Update body: `gh api -X PATCH /repos/HCSS-StratBase/rizzoma/pulls/<num> -f body@body.md`
- Merge (squash): `gh pr merge <num> --squash --delete-branch --admin`

9) Backup
- Script: `scripts/backup-bundle.sh` (runs bundle + PowerShell copy; honors `RIZZOMA_BUNDLE_PATH` + `RIZZOMA_GDRIVE_DIR` overrides).
- Bundle (manual): `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy: see commands in `docs/HANDOFF.md` (last run 2026-02-02).
