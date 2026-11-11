# Deprecated documentation — nothing here is authoritative

Every file in this folder was **current once**. None of it was deleted; all of it is kept for
history and provenance. But **do not act on anything in here** — it has been superseded.

**Why this folder exists.** On 2026-07-14 an audit of all 343 `.md` files in the repo found
131 real docs, of which ~45 were substantive — and they contradicted each other. Six different
files each claimed to describe "current state"; four different files compared old-vs-new; a
port tracker still said "17%, phases 2–4 not started" ten weeks after those phases were
committed; the BLB philosophy doc said a blip body was a "blank sheet, not necessarily
bulleted" while the code and the tests required bullets. Documentation written per-session and
never retired had become a hazard rather than an asset.

## Read these instead

| For | Read |
|---|---|
| **Current state** (branch, deployment, gate results, open failures) | [`../../STATUS.md`](../../STATUS.md) — **GENERATED**; regenerate with `node scripts/gen_status.mjs`. Never hand-written. |
| **Architecture**, the original's model, why our hybrid cracks | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| **BLB rules**, with every rule labelled OLD (rizzoma.com) vs NEW (our app) | [`../BLB.md`](../BLB.md) |
| The deep analysis of the original's fractal logic | [`../ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md`](../ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md) |
| The prescribed fix (native port) | [`../NATIVE_RENDER_PORT_PLAN.md`](../NATIVE_RENDER_PORT_PLAN.md) |
| The verification gate chain | [`../VISUAL_SCREENSHOT_SWEEP.md`](../VISUAL_SCREENSHOT_SWEEP.md) |
| How to run it | [`../../QUICKSTART.md`](../../QUICKSTART.md) |
| The 240-row feature matrix (machine-parsed by the sweep) | [`../../RIZZOMA_FEATURES_STATUS.md`](../../RIZZOMA_FEATURES_STATUS.md) |

## What's in here, and why it was retired

### Status / handoff files (six competing "current state" docs)

| File | Was current | Retired because | Content now lives in |
|---|---|---|---|
| `HANDOFF.md` | 2025-11 → 2026-07-14 | One of six competing status docs; instructed readers to check out `feature/rizzoma-core-features`, which has not been the working branch for months | `STATUS.md` (generated) |
| `RESTART.md` | 2025-11 → 2026-07-14 | Startup checklist that duplicated QUICKSTART and drifted from the real (non-Docker) live topology | `QUICKSTART.md` + `STATUS.md` |
| `RESTORE_POINT.md` | 2025-12 → 2026-07-14 | Session-scoped review checklist, mistaken for a status doc | `STATUS.md` |
| `CLAUDE_SESSION.md` | 2026-01 → 2026-05-12 | Frozen snapshot of one session's context, still read as current | `STATUS.md` |
| `TESTING_STATUS.md` | 2025-11 → 2026-07-14 | Claimed test status that predated the gate chain and hand-build acceptance entirely | `STATUS.md` + `docs/VISUAL_SCREENSHOT_SWEEP.md` |
| `NATIVE_PORT_PM.md` | 2026-05-05 | **Said "17% — phases 2/3/4 at 0%" while git showed `Phase 4 (#55) DONE` and a merged native-editor release.** The single most misleading file in the repo | `STATUS.md` §"Native port" — *measured from source, not asserted* |

### Old-vs-new comparisons (four docs, one subject)

| File | Retired because |
|---|---|
| `RIZZOMA_COMPARISON.md` (Jan, 391 lines) | Superseded by the 240-row matrix in `RIZZOMA_FEATURES_STATUS.md`, which is the one the sweep actually parses |
| `RIZZOMA_FULL_COMPARISON.md` (Feb, 1063 lines) | Same; largest of the duplicates |
| `TECH_STACK_OLD_VS_NEW.md` | Folded into `ARCHITECTURE.md` §1 |
| `arch-old-vs-new.md` | Folded into `ARCHITECTURE.md` §1–3 |

### Architecture / editor docs

| File | Retired because | Content now in |
|---|---|---|
| `ARCHITECTURE.md` (Jan, 344 lines) | Predates the native port and the content-array analysis | `../ARCHITECTURE.md` |
| `NATIVE_RENDER_ARCHITECTURE.md` | Duplicated the port plan + architecture | `../ARCHITECTURE.md` §4 |
| `EDITOR.md`, `EDITOR_REALTIME.md` | Folded into `ARCHITECTURE.md` §5 | `../ARCHITECTURE.md` |
| `TOPIC_RENDER_UNIFICATION.md` | Historical refactor note (Apr) | — |
| `DEPENDENCY_UPGRADE_AUDIT.md`, `LEGACY_ASSETS_AUDIT.md` | Point-in-time audits (Feb); kept for provenance | — |

### BLB docs — **the contradiction that caused a live bug**

| File | Retired because | Content now in |
|---|---|---|
| `BLB_LOGIC_AND_PHILOSOPHY.md` (1495 lines) | §3 described a blip as *"a blank rich text container… not necessarily bulleted"* — **true of OLD rizzoma.com, but never labelled as such** — while §19's checklist and the code both required bullets. On 2026-07-14 nested blips shipped as unbulleted `<p>` bodies. The new `BLB.md` labels **every** rule `[OLD]` / `[NEW]` / `[BOTH]` and states plainly that in **our** app **bullets are imposed** (SDS's explicit product decision). | `../BLB.md` |
| `BLB_PARITY_CHECKLIST.md` | Folded into `BLB.md` §6 (pre-commit checklist) | `../BLB.md` |
| `INLINE_COMMENTS_VS_REPLIES.md` | Folded into `BLB.md` §4 | `../BLB.md` |

### Modernization-phase docs (2025-11 → 2026-02)

`MODERNIZATION_COMPLETE.md` (its very title asserts completion — it declared the app
"production-ready" in January, six months before the fractal was found dying at depth 3),
`MODERNIZATION_STRATEGY.md`, `README_MODERNIZATION.md`, `PARALLEL_DEVELOPMENT_PLAN.md`.
All are historical planning artefacts from the original modernization push.

### Testing docs (predate the real gates)

`TESTING_GUIDE.md`, `MANUAL_TEST_CHECKLIST.md` — neither mentions the gate chain
(`visual:sweep → visual:coverage → parity:gate`) or hand-build acceptance, which are the
actual enforcement mechanisms today. See `docs/VISUAL_SCREENSHOT_SWEEP.md` and `docs/BLB.md` §8.

### Setup guides

`rizzoma_setup_guide.md`, `rizzoma_fresh_setup_guide.md` (Nov 2025) — superseded by
`QUICKSTART.md`.

### `skills-fork/`

`how_to_post_rizzoma.md`, `how_to_read_rizzoma.md` — **untracked** forks of the canonical
rizzoma skill. The single source of truth is `~/.claude/skills/rizzoma/SKILL.md`
(master: `/mnt/g/My Drive/claude-skills/rizzoma/`). Kept here only so the fork isn't lost.

---

**If you find yourself citing anything in this folder as current, stop.** Regenerate
`STATUS.md` and read `ARCHITECTURE.md` + `BLB.md` instead.
