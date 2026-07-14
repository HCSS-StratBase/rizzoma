# Worklog — 2026-07-14

Branch: `feature/native-fractal-port`

## Status/doc/VPS sync after parity-gate checkpoint

- Synced the public/dev VPS checkout:
  - path: `/data/large-projects/stephan/rizzoma_260612`
  - before: `d8d2d0c4`
  - parity evidence checkpoint: `ac6a6f9d`
  - then updated again after status-doc sync commits
  - public root and `/api/health` both returned 200 after the fast-forward
- Updated stale repo status surfaces that still cited older checkpoints:
  - `RESTORE_POINT.md`
  - `docs/RESTART.md`
  - `docs/VPS_DEPLOYMENT.md`
  - `TESTING_STATUS.md`
  - `docs/HANDOFF.md`
- Current synchronized truth:
  - local repo, pushed branch, and VPS checkout all include `ac6a6f9d` plus status-doc sync commits
  - `npm run parity:gate` is the current blocking visual parity gate
  - latest evidence folder is `screenshots/260713-225614-public-parity-sweep-feature-sweep/`
  - latest written audit is `screenshots/260713-225614-public-parity-sweep-feature-sweep/legacy-current-comparisons/PARITY_AUDIT.md`
- Measured audit boundary:
  - verdict is **FAIL / IN_PROGRESS**
  - 200 documented rows
  - 159 classified rows
  - 24 old Rizzoma PNGs
  - 44 new Rizzoma PNGs
  - 104/159 visual screenshot row coverage
  - 2 screenshot gaps
  - 10 side-by-side comparison sheets
- Verification:
  - `npm run parity:gate`
  - `npm run lint:branch-context`
  - public root 200
  - public `/api/health` 200
- Boundary:
  - this sync closes stale status drift
  - it does not make the parity audit green
  - next work remains classifying/fixing comparison-sheet divergences, closing `VF-039`/`VF-040`, and rerunning the gate

---

# Session 2 (Claude Fable 5) — parity gate chain CLEARED + single-active bridge ported

## Part 1 — Full parity-gate chain cleared

- **Gate hardened (SDS directive, `ae45fae0`)**: coverage `screenshot_gap > 0` now FAILS;
  legacy-reference floor **150 PNG+md pairs** (target ~243) across the Feb set +
  `screenshots/260714-legacy-reference-archive/`; comparison floor 16;
  `visual-sweep-gate.sh` registered under Stop in `.claude/settings.local.json`.
- **Systematic legacy archive**: 126 read-only captures of rizzoma.com in 4 passes
  (full-page states, element crops, 12 per-topic content states, mobile + 1280 widths;
  sandbox-only edit chrome; fold-dispatch unfolds — no unread-greens consumed).
  Total with the Feb set: **150 PNGs / 151 notes**.
- **VF-039/040 closed**: `capture_realtime_pair.mjs` two-client capture ("User 59 is
  typing…" visible in the owner client); `enterMainBlipEdit` fixed for the
  single-active model (activate before waiting for the menu).
- **Chain PASS**: 44/44 sweep gates; **159/159 coverage rows, 0 gaps**; 24 comparison
  sheets (`build_parity_comparisons.py`); `PARITY_AUDIT.md` 2026-07-14 =
  **EVIDENCE-COMPLETE / VISUAL PARITY IN_PROGRESS**.

## Part 2 — Single-active bridge ported (audit severe-failure #2)

Commits `2775bb8f` + `82ae960a` + `576c2853`, verified on STAGING:

- Entering edit mode now BROADCASTS `rizzoma:active-blip-claim` (blips previously
  claimed only on click, so programmatic edit entries left other surfaces editable).
- A foreign claim while editing FINISHES (auto-saves) the edit — before, it only hid
  the toolbar and the editor stayed editable.
- The topic editor participates: claims `topic-editor:<id>` on start, releases on
  foreign claims, REASSERTS on claims carrying the topic root's own id (clicks inside
  the editor bubble to the root container — releasing on those killed the edit session
  on its own clicks; the 2026-07-09 lesson).
- Child edit-entry re-drive: the child's first mount lives in the topic editor's
  BlipThreadNode portal, which the release unmounts; re-dispatch expand + enter-edit
  until its ProseMirror is editable.
- Verified claim choreography (instrumented, staging): `topic-editor:<id>` → root-id
  (own-host) → reassert → child claim → release; end state **exactly ONE editable
  surface** (the child, view render), `isEditingTopic: false`.
- `vite.config.ts`: `VITE_PORT`/`VITE_API_TARGET`/`strictPort` overrides so staging
  runs beside live.

## Deployment state at this checkpoint

| Instance | Tree | Code | Status |
|---|---|---|---|
| Live `138-201-62-161.nip.io` (:8000/:3000) | `rizzoma_260612` | pre-bridge | bridge NOT yet deployed |
| Staging `dev.138-201-62-161.nip.io` (:8100/:3100) | `rizzoma_merge` | `576c2853` | bridge VERIFIED here |

nginx dev vhost repointed back to :3100 (the 07-13 session had it on :3000; backup
`/root/rizzoma-dev.conf.bak-1784026`). Ops gotchas hit twice today: kill stale
processes by `ss -ltnp` port owner (an 8h-old server survived a pgrep pass); vite
without `strictPort` silently drifts to :3001.

## Open (next)

- **Deep-BLB layout (audit #1)**: diagonal ladder → legacy tight boxed nesting.
  `measure_fractal_geometry.mjs` ready. Known indentation sources:
  `RizzomaBlip.tsx:2110` (`marginLeft: depth * 24`) + `RizzomaBlip.css` LI indents.
- Deploy bridge to live (with the layout fix), full gate re-run, PARITY_AUDIT #2 → resolved.
- Observer-side click actionability (audit #3); mobile ruling (#4); legacy archive 150 → 243.

## Part 3 — Deep-BLB layout FIXED (audit severe-failure #1), both fixes LIVE

Commits `e53b95c9` (v1) + `76ed55e2` (v2) + `cd14290a` (v3), deployed to live and staging.

**Root cause (measured, not guessed).** A per-level geometry probe
(`measure_fractal_geometry.mjs`) + an element-chain attribution probe
(`measure_indent_chain.mjs`) showed the diagonal ladder was FIVE compounding terms
per nesting level, not one:

| Term | Before | After |
|---|---|---|
| `.inline-child-expanded` margin-left | 22px | 0 |
| `.inline-child-expanded` padding-left | 8px | 2px |
| LI margin-left (the LEGACY step — keep) | 22px | 22px |
| `.blip-content-row` padding-left | 12px | 0 |
| `.blip-text` padding-left | 8px | 0 |
| bullet gutter (bullet + flex gap) | ~13px | ~8px |
| **left step per level** | **~87px** | **~34px** |
| **width lost per level** (avatar/meta flex column) | **~157px** | **~11px** |
| **depth-10 usable width** (1440 viewport) | **241px** | **562px** |

Fixes: keep ONLY the LI's 22px step (that IS legacy's step); the inline-child
wrapper hugs it; body paddings stop stacking; the avatar/contributors chip is
`position: absolute` in the box corner instead of consuming flex width; nested
children get the legacy boxed-card treatment (1px #d9d9d9 border + radius +
subtle shadow) so a child renders visually INSIDE its parent's box.

**Eyeballed** (not DOM-only): `screenshots/260714-blb-layout/` —
`after-fix-v2-depth10.png` and the side-by-side
`legacy_vs_fixed_depth10_v3.png` vs the 2026-05-05 legacy reference. The
diagonal ladder is gone; depth-10 renders as contained boxed nesting.

**Ops gotcha (cost a false negative):** the long-running live vite process did NOT
pick up the CSS change on git-checkout — it served the OLD stylesheet while the
.tsx changes WERE live. Always restart vite (kill by `ss -ltnp` port owner) after
a CSS-touching deploy, and verify by measuring, not by trusting the tree state.

**Honest boundary:** legacy's step is the bare 22px LI margin; ours is ~34px (the
residual is the nested bullet gutter). Visually equivalent nesting, not
pixel-identical — recorded as such in PARITY_AUDIT.
