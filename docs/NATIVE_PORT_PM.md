# 🚀 Native Fractal-Render Port — Live Project Tracker

> **Source of truth**: this file. Updated after every commit on `feature/native-fractal-port`.
> **Backed by**: GH epic [#50](https://github.com/HCSS-StratBase/rizzoma/issues/50) + phase issues [#51](https://github.com/HCSS-StratBase/rizzoma/issues/51)–[#56](https://github.com/HCSS-StratBase/rizzoma/issues/56) + [docs/NATIVE_RENDER_PORT_PLAN.md](./NATIVE_RENDER_PORT_PLAN.md) + [docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md](./ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md)
> **Why the port**: 7-layer React/TipTap hybrid kept cracking (10 fix-spawns-fix bugs in one day). Original Rizzoma's content-array + linear-walk model is elegant. Port it to TS instead of patching seams forever.

---

## 🎯 Overall progress

```
█████░░░░░░░░░░░░░░░░░░░░░░░░░  17 %  (2.5 / 14.5 workdays)
```

| 🟢 Done | 🔄 In progress | ⏳ Pending | ❌ Blocked |
|---|---|---|---|
| 2 phases | 1 phase | 3 phases | 0 |

---

## 📋 Phase status board

### 🟢 Phase 0 — Feature-flag wiring `[#51]`

```
████████████████████████████████  100 %  ─  0.5 / 0.5 days
```

| | Deliverable | Commit |
|---|---|---|
| ✅ | `vite.config.ts` define for `import.meta.env.FEAT_RIZZOMA_NATIVE_RENDER` | [`92fbf09f`](https://github.com/HCSS-StratBase/rizzoma/commit/92fbf09f) |
| ✅ | `src/shared/featureFlags.ts` adds `RIZZOMA_NATIVE_RENDER` | `92fbf09f` |
| ✅ | `RizzomaLayout.tsx` appends `.rizzoma-native` to layout root when flag is on | `92fbf09f` |
| ✅ | Typecheck clean | — |

**Why this phase first**: today's session burned ~4 hours on the parity flag silently inactive client-side because `vite.config.ts` was missing the `define` entry. Wired this one right at day 0.

---

### 🔄 Phase 1 — Spike: parser + renderer + BlipThread (static render) `[#52]`

```
██████████████████░░░░░░░░░░░░░░  60 %  ─  ~1.8 / 3 days
```

| | Deliverable | LOC | Commit |
|---|---|---|---|
| ✅ | `types.ts` — `ContentArray = Array<TextEl \| LineEl \| BlipEl \| AttachmentEl>` | 95 | [`f37bbc1f`](https://github.com/HCSS-StratBase/rizzoma/commit/f37bbc1f) |
| ✅ | `parser.ts` — HTML → ContentArray | 250 | `f37bbc1f` + heading fix [`b06d4d30`](https://github.com/HCSS-StratBase/rizzoma/commit/b06d4d30) |
| ✅ | `blip-thread.ts` — `<span class="blip-thread">` + CSS-class fold (port of `blip_thread.coffee`) | 190 | `f37bbc1f` |
| ✅ | `renderer.ts` — single linear walk over ContentArray → DOM | 190 | `f37bbc1f` |
| ✅ | vitest tests — 8/8 green | — | `b06d4d30` |
| ⏳ | `serializer.ts` — ContentArray → HTML inverse | ~150 | — |
| ⏳ | Spike harness HTML page rendering depth-10 fractal from JSON fixture | — | — |
| ⏳ | Pixel-match against `screenshots/260505-rizzoma-com-vs-mine/16-rizzoma-com-depth10_old-260505.png` | — | — |
| ⏳ | Round-trip parser tests on every dev-DB topic | — | — |

**Exit criteria** (from issue #52):
- ✅ Zero React imports in `src/client/native/`
- ⏳ Spike harness renders depth-10 fractal pixel-matching rizzoma.com
- ⏳ Parser round-trips dev-DB topic HTML without data loss

---

### ⏳ Phase 2 — BlipView + TipTap edit-mode mounting + Ctrl+Enter `[#53]`

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0 %  ─  0 / 4 days  (depends on Phase 1)
```

| | Deliverable | LOC |
|---|---|---|
| ⏳ | `blip-view.ts` — port of `blip/view.coffee` | ~600 |
| ⏳ | `blip-editor-host.ts` — mount/unmount TipTap into BlipView's slot | ~200 |
| ⏳ | `wave-view.ts` — port of `wave/view.coffee` | ~250 |
| ⏳ | `NativeWaveView.tsx` — thin React wrapper behind feature flag | ~150 |
| ⏳ | `RizzomaTopicDetail.tsx` side-by-side toggle (no demolition) | — |
| ⏳ | Ctrl+Enter handler — insert BLIP at cursor's array index | — |
| ⏳ | Sanity sweep + state-survives-collapse pass on `?render=native` | — |

---

### ⏳ Phase 3 — Y.js collab + cross-tab sync + live cursors `[#54]`

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0 %  ─  0 / 3 days  (depends on Phase 2)
```

---

### ⏳ Phase 4 — Auxiliary feature wiring `[#55]`

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0 %  ─  0 / 2 days  (depends on Phase 3)
```

---

### ⏳ Phase 5 — Cut over + 24h soak + cleanup commit `[#56]`

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0 %  ─  0 / 2 days  (depends on Phase 4)
```

---

## 🛠️ Track-based parallelization (if 2 devs available)

```
Track A — Render core           Track B — Collab + UX features
                                 (starts after Phase 1 spike)
✅ types.ts + parser.ts          ⏳ Y.js binding (Phase 3)
✅ renderer.ts + blip-thread.ts  ⏳ Aux feature wiring (Phase 4)
🔄 serializer.ts (next up)       ⏳ Inline comments anchor migration
⏳ blip-view.ts (Phase 2)        ⏳ Cross-tab sync tests
⏳ wave-view.ts (Phase 2)
```

After Phase 1, Tracks A and B can run in parallel → calendar drops from ~3 weeks to ~2 weeks with two developers.

---

## 📈 Codebase delta projection

```
Will ADD     ███████████████░░░░░░░░░░░░░░░░░  ~2,000 LOC TS  (src/client/native/)
Will DELETE  █████████████████████████░░░░░░░  ~3,500 LOC TS
                                                ├─ RizzomaBlip.tsx (~2,200)
                                                ├─ InlineHtmlRenderer.tsx (~280)
                                                ├─ inlineMarkers.ts (~125)
                                                ├─ BlipThreadNode.tsx (~150)
                                                └─ RizzomaTopicDetail.tsx (~600)
NET          ─1,500 LOC  (smaller codebase, fewer indirections, fewer edge cases)
```

---

## 🚥 Daily verification gate (running cost during port)

Every commit on `feature/native-fractal-port` runs:

| | Check | Command |
|---|---|---|
| 🟢 | TypeScript clean | `npx tsc --noEmit` |
| 🟢 | Native parser tests | `npx vitest run src/client/native/__tests__/parser.test.ts` |
| ⏳ | Native renderer snapshot tests (Phase 1.5) | `npx vitest run src/client/native/__tests__/renderer.test.ts` |
| ⏳ | Native collab convergence (Phase 3) | `npx vitest run src/client/native/__tests__/collab.test.ts` |
| ⏳ | Sanity sweep against native path (Phase 2) | `node scripts/rizzoma_sanity_sweep.mjs --render=native` |
| ⏳ | State-survives-collapse against native path (Phase 2) | `node scripts/verify_state_survives_collapse.mjs --render=native` |
| ⏳ | Perf budget (Phase 2) — 5% wall-time bigger blocks the merge | `npm run perf:harness` |

---

## 🔥 Risks (from [docs/NATIVE_RENDER_PORT_PLAN.md §7](./NATIVE_RENDER_PORT_PLAN.md))

| Risk | 🚦 | Mitigation |
|---|---|---|
| Y.js binding to ContentArray fiddly | 🟡 | Keep TipTap collab fragment per-blip; ContentArray binding outer-only |
| Parser misses edge cases in old data | 🟢 | Round-trip tests on every dev-DB topic; bail-out keeps stragglers on React path |
| Browser block-inside-paragraph quirk | 🟢 | Original had it too; pixel-match against rizzoma.com proves equivalence |
| Cross-tab desync | 🟡 | Vitest Y.js convergence suite (Phase 3) |
| Perf regression on big topics | 🟢 | `perf:harness` 5% gate; native render is faster than React diff for unchanged subtrees |
| One developer can't validate everything | 🟡 | Each phase has automated verification gates; manual soak with 2 users at end of phase 5 |

---

## ⏱️ Calendar

```
Week 1  Day 1  Day 2  Day 3  Day 4  Day 5
        ✅0    🔄1    🔄1    1      2

Week 2  Day 6  Day 7  Day 8  Day 9  Day 10
        2      2      3      3      3

Week 3  Day 11 Day 12 Day 13 Day 14 Day 15
        4      4      5      5      ✓ done
```

(Today is Day 1 — Phases 0 + most of 1 done; pulled ahead of single-day plan.)

---

## 📌 Last updated

- **2026-05-05 evening** — Phase 0 ✅ + Phase 1 60% (4/9 deliverables, 8/8 vitest tests green)
- Live commits on branch `feature/native-fractal-port`
- Working `feature/rizzoma-core-features` branch untouched — instant rollback if soak fails
- GH issues [#50–#56](https://github.com/HCSS-StratBase/rizzoma/issues/50) carry the same data with comment threads for ad-hoc updates

---

## 🔄 How this file updates

- After every commit on the port branch, I'll bump the pbar % + check off deliverables + post a short update on the relevant phase's GH issue + (if status changes meaningfully) drop a Tana entry on the canonical day node
- Anyone can read this file (`git pull && cat docs/NATIVE_PORT_PM.md`) for current state
- Anyone can read the GH issues for asynchronous discussion / blockers
- Anyone can read [docs/NATIVE_RENDER_PORT_PLAN.md](./NATIVE_RENDER_PORT_PLAN.md) for the underlying plan that doesn't change day-to-day
