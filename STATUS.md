# STATUS — Rizzoma (GENERATED, do not hand-edit)

> Regenerate with `node scripts/gen_status.mjs`. Every number here is measured from git,
> the latest sweep/audit and the source tree. Six hand-written status files drifted for
> months before this existed; they are in `docs/deprecated/`.

**Generated:** 2026-07-16 (from HEAD's date — no wall-clock, keeps reruns deterministic)

## Code

| | |
|---|---|
| **Branch** | `feature/native-fractal-port` |
| **HEAD** | 12984319 2026-07-16 Phase 1 (native port): render fractal to full depth from parentId tree |
| **Unpushed commits** | 0 |
| **Uncommitted files** | 143 |

## Deployment (see docs/VPS_DEPLOYMENT.md for the reality banner)

| | |
|---|---|
| **Live** | `https://138-201-62-161.nip.io` — tree `/data/large-projects/stephan/rizzoma_260612`, nohup tsx :8000 + vite :3000 behind nginx |
| **Staging** | `https://dev.138-201-62-161.nip.io` — tree `rizzoma_merge`, :8100 / :3100 |
| **In Docker** | CouchDB + Redis only (NOT the app — the compose-based topology in QUICKSTART is historical) |
| **Session store** | MemoryStore on the live process (sessions die on restart) — productionization pending |

## Verification (latest run)

| | |
|---|---|
| **Latest sweep** | `screenshots/260714-1600-feature-sweep` |
| **Programmatic gates** | 44 / 44 programmatic gates PASS |
| **Coverage matrix** | 159 rows classified · 101 screenshot + 5 dynamic + 53 non-screenshot · **0 gaps** |
| **Legacy/current comparisons** | 26 sheets |
| **Hand-build evidence** | `screenshots/260714-handbuild-d10-run4` — 33 step PNGs |
| **Parity audit verdict** | EVIDENCE-COMPLETE; four severe failures RESOLVED; visual parity IN_PROGRESS on the rest. |

## Native port (measured from source, not from a tracker)

| | |
|---|---|
| **Source** | 12 files, 2185 LOC in `src/client/native/` |
| **Unit tests** | 8 test files |
| **Wiring** | **READ-ONLY** — opt-in via `?render=native`; no Edit button, no toolbars. Editing still goes through the React/TipTap hybrid. |
| **Acceptance** | `HB_RENDER=native node scripts/handbuild_acceptance.mjs` must pass before any cutover |

## Open failures (from the latest PARITY_AUDIT)

- Observer-side real clicks time out on freshly-shared topics — OPEN.
- Mobile parity — OPEN (needs a product ruling).

## Where to read next

- **Architecture + why the hybrid cracks** → `docs/ARCHITECTURE.md`
- **BLB rules, old-vs-new labelled** → `docs/BLB.md`
- **The prescribed fix** → `docs/NATIVE_RENDER_PORT_PLAN.md`
- **The gate chain** → `docs/VISUAL_SCREENSHOT_SWEEP.md`
- **Everything superseded** → `docs/deprecated/README.md`
