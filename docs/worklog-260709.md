# Worklog 2026-07-09 — dead-"+" subblips FIXED on live (single-active-editor)

## Outcome

The live Rizzoma at https://138-201-62-161.nip.io now renders and edits nested
subblips correctly. The dead-"+" bug (nested children invisible, "+" chip inert)
is fixed in production, via the properly-engineered version of the fix that was
attempted and rejected on 2026-06-16.

## What was wrong

Two stacked problems:

1. **Live master lacked the fractal editor entirely** — the editor+parity render
   lives on `feature/native-fractal-port` / the parked merge branch
   (`merge/fractal-editor-to-master`, `54d3be90`). On master, a depth-10 fixture
   rendered as ONE flat container with a dead "+" (reproduced + screenshotted:
   `screenshots/260709-live-subblip-repro/`).
2. **The merge branch had the toolbar-on-every-blip defect** that made SDS roll
   back on June 16: `RizzomaBlip.tsx` conflated *expanded* with *active*
   (`isActive = effectiveExpanded || isEditing`), so a fully-unfolded tree showed
   an edit bar at every level (BLB §18b2 violation).

## The fix (`fix/single-active-editor`, commits `a04e94a7` + `2692d987`)

- **`ActiveBlipContext`** (new): the topic holds ONE active blip id. Every
  `RizzomaBlip` derives `isActive` from it. Clicking activates the deepest blip
  (stopPropagation); entering edit claims the slot; when another blip claims it,
  the previous editor `handleFinishEdit()`s (auto-saving) and goes passive. The
  topic root claims the slot once on open. Expanding no longer activates.
- **Robust edit-entry for Ctrl+Enter children**: the single-RAF
  `rizzoma:enter-edit-blip` dispatch raced the child mount + the parent's
  finish-edit save; new children could land in view mode with no typing
  affordance. Now re-dispatches until the child's ProseMirror is editable (~3s cap).
- 3 pre-existing tsc errors on the merge branch fixed (these were exactly the
  files hand-patched uncommitted on the VPS on June 16 — that stash is preserved
  in the `rizzoma_merge` worktree as "june-16 uncommitted toolbar hand-patch").
- `vite.config.ts`: `VITE_PORT` / `VITE_API_TARGET` env overrides so a staging
  instance can run beside live.

## Verification (all gates eyeballed as PNGs, not DOM-only)

- `scripts/verify_single_active_editor.mjs` — **11/11 gates** on staging AND on
  live after cutover: markers render, 3 levels expand inline, ≤1 menu after
  every action, activation follows clicks, exactly one edit toolbar, previous
  editor closes.
- `scripts/verify_ctrl_enter_dev.mjs` — Ctrl+Enter creates an inline child that
  auto-enters edit with a single toolbar (PASS on staging + live).
- `scripts/viewport_sweep_dev.mjs` — clean at 1280/1366/1440/1600.
- Google OAuth redirect_uri verified intact after cutover
  (`https://138-201-62-161.nip.io/api/auth/google/callback`).
- Screenshots: `screenshots/260709-single-active-verify/` (staging),
  `screenshots/260709-live-after-cutover/` (live).

## Deployment topology (current truth)

| What | Where | Ports | Branch |
|---|---|---|---|
| **Live** | `/data/large-projects/stephan/rizzoma_260612` | server :8000, vite :3000 → nginx `138-201-62-161.nip.io` | detached at `origin/fix/single-active-editor` |
| **Staging** | `/data/large-projects/stephan/rizzoma_merge` | server :8100, vite :3100 → nginx `dev.138-201-62-161.nip.io` | `fix/single-active-editor` |

Both run as `nohup` tsx+vite dev processes with `FEAT_ALL=1
FEAT_RIZZOMA_PARITY_RENDER=1` (see boundary below). CouchDB + Redis are the
long-running docker containers; DB `project_rizzoma` is SHARED between live and
staging.

**Rollback:** `/root/rizzoma-live-rollback-commit.txt` (master `905e7f10`) +
`/root/rizzoma-live.env.bak-cutover`; `git checkout master` in the live tree +
restart without the parity flag. nginx dev vhost backup:
`/root/rizzoma-dev.conf.bak-1783563800`.

## Boundaries / follow-ups

- Processes are still bare `nohup` dev-mode (tsx watch + vite) — no systemd
  unit, no `REDIS_URL` (MemoryStore sessions, lost on restart). Same as before
  the cutover, but now documented. Productionizing = Phase 5.
- `fix/single-active-editor` is pushed but NOT merged to master — master still
  lacks the editor. Merge decision is SDS's after using the live site.
- The native render (`?render=native`, Track G) remains opt-in and unaffected.
- Test fixture topic `0b997d49bf636cdd371819e13601e7ce` ("Try", account
  `try-owner+try-1783562412806@example.com`) contains a depth-10 spine + a few
  empty children created by test runs — safe to trash.

---

# ADDENDUM (same day, after SDS's manual test failed) — the fix above was NOT enough

SDS tried ONE flow by hand — topic root: Edit → Ctrl+Enter — and it was dead. He was
right; the 11-gate suite had only exercised NESTED blips with synthetic events. Three
further defects were found and fixed (commits `37ba00a1`, `bd811c4b`, `681c626c`):

1. **Topic editor outside the single-active model** — `topicEditor` (RizzomaTopicDetail)
   could stay editable while a child edited (two toolbars). New `EditSurfaceActiveBridge`
   claims the slot under `topic-editor:<id>` while `isEditingTopic`.
2. **Bridge released against a stale claim** — effects observe the committing render's
   context, so the first post-edit commit still carried the previous active id and the
   bridge closed the edit it had just opened. Fixed with a claimed-observation guard.
3. **THE BUG SDS HIT: clicking inside the topic editor killed its own edit session.**
   The click bubbles to the topic-root blip container → `handleBlipClick` claims the
   ROOT's id → bridge saw a "foreign" claim → `finishEditingTopic()` → the ProseMirror
   blurred → every subsequent keystroke (typing, Ctrl+Enter) went to `<body>`. Diagnosed
   via a focus timeline (focusin at Edit-click +103ms, focusout at content-click). Fix:
   the bridge knows its `hostBlipId` and reasserts its claim instead of releasing.
   Also: the topic-flow Ctrl+Enter child now re-drives expand+edit-entry until its
   editor is editable (its first mount lives in the topic editor's BlipThreadNode
   portal, which unmounts when the topic edit closes).

## Verification of the ACTUAL user flow (real clicks + real keystrokes, live)

- Edit (real click) → click into content (focus RETAINED, verified via activeElement)
  → Ctrl+Enter → `POST /api/blips 201` → child mounts in edit with ONE toolbar →
  typed text lands in the child → **persists server-side** (verified via API readback).
- `scripts/rizzoma_sanity_sweep.mjs` (the May 9-check harness, now env-parameterized):
  **14/14 PASS on live** against a fresh depth-10 fixture (`0b997d49…026729`).
- `scripts/visual-feature-sweep.mjs` (the 200-row feature matrix): **44/44 programmatic
  gates PASS, 0 FAIL** on live (`screenshots/260709-feature-sweep/manifest.md`).
  1 residual: the realtime cursor/typing capture timed out waiting for a blip menu to
  be visible WITHOUT activation — an assumption the single-active model intentionally
  invalidates (menus now require activating the blip); harness to be updated.
- Regression: `verify_single_active_editor.mjs` 11/11 + nested Ctrl+Enter still PASS.

## Lesson (recorded as memory `feedback-rizzoma-verify-the-users-flow`)

Synthetic-event suites passed while the user's first real interaction failed. For any
Rizzoma editor claim: verify with REAL Playwright clicks/keystrokes (not
evaluate-dispatched events), on the TOPIC ROOT as well as nested blips, including
focus retention (activeElement) and typing persistence — and run the repo's own
sanity + feature sweeps before reporting.
