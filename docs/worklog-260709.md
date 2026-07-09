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
