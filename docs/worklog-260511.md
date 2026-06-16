# Worklog — 2026-05-11 (Bug C closure + 44/44 sweep + Task #191 investigation)

Branch: `feature/native-fractal-port` · 9 commits this session.

## Headline outcomes

| Item | Outcome |
|---|---|
| **Bug C / Task #190** Nested inline-marker render → empty editor | ✅ **FIXED** at root: `isEditingRef` guard prevents autosave overwriting saved content with `<p></p>` on inline-child mount |
| **Sweep gates** | 43/44 → **44/44 PASS · 0 FAIL · 0 no-gate** |
| **Cherry-pick** autosave fix to `feature/rizzoma-core-features` | ✅ `899f9196` — Hryhorii's branch also gets the silent-content-corruption fix |
| **Task #191** TipTap pre-warming / optimistic mount | ⚠️ INVESTIGATED, reverted — no further latency win available without out-of-scope server changes |
| **Bug A latency** | Stays at 322-433ms (was 1434ms baseline; 3-4× faster) |
| **Bug B nested Ctrl+Enter** | 322ms PASS (stable) |

## Bug C root cause

TipTap's `onUpdate` callback fires when content is programmatically set via `setContent()` (not just on user typing). Three places in `RizzomaBlip` call `setContent` on mount or blip-id-change:

1. `useEditor`'s `content` prop (initial render)
2. blip-id-change `useEffect` at line ~617: `inlineEditor.commands.setContent(blip.content)`
3. `handleStartEdit` at line ~997: `inlineEditor.commands.setContent(nextContent)`

For an inline-mounted `spine[k]` (clicked `[+]` from parent's body):

1. Parent's marker click → `toggleInlineChild(spine[k].id)`
2. Re-render mounts new `RizzomaBlip` with `spine[k]` as blip
3. TipTap `useEditor` created with `spine[k].content` as initial
4. blip-id-change useEffect fires `setContent(spine[k].content)`
5. `setContent` triggers `onUpdate`
6. `onUpdate`'s `editor.getHTML()` returns the parsed/normalized HTML. For content with bare `<span class="blip-thread-marker">` (not a recognized TipTap node), parser falls back to `<p></p>`
7. autosave PUTs `<p></p>` to `/api/blips/:id`
8. `spine[k]`'s content is now `<p></p>` server-side, no marker for `spine[k+1]` visible
9. Sweep walks to `k+1`, marker doesn't exist, gate fails

**Fix** (commit `65e2a11c`): skip auto-save in `onUpdate` when `isEditingRef.current` is false. Use a ref because `onUpdate` is captured at editor-creation time and would otherwise see only the initial `isEditing` value (false). The user can only TYPE in edit mode, so any non-edit-mode `onUpdate` is from a programmatic `setContent`.

Beyond gate 036 — this eliminates a broader class of silent content-corruption bugs whenever a real user expands an inline child without intending to edit it.

## Task #191 — Bug A last mile (TipTap pre-warming attempt)

Profile (commit `6edbf138`) of the 432ms Ctrl+Enter wallclock revealed:

| Phase | Duration |
|---|---|
| Keypress + handleAddChild setup | ~40ms |
| `POST /api/blips` server round-trip | ~54ms |
| `await load(true)` (3 parallel API fetches) | **~271ms** (limited by slowest: `/api/waves/.../participants`) |
| Toggle dispatch → enter-edit dispatch → editor mount | ~50ms |
| TipTap editor mount + first paint | **only 6ms** |

So TipTap pre-warming (the original Task #191 plan) would save ~nothing. The real bottleneck is the 271ms participants fetch.

### Attempted fix — reverted

Optimistic local mount + skip `await reload()`:

- `b556ee56` — `RizzomaBlip`: skip `await __rizzomaTopicReload()`, fire-and-forget instead, after optimistic add via `__rizzomaTopicAddBlip`
- `67849298` — `RizzomaTopicDetail`: fall back to top-level append in `__rizzomaTopicAddBlip` when parent isn't found in tree
- `68b3ae87` — `RizzomaTopicDetail.handleAddChild`: same fix for depth-1 path

**Result**: depth-1 broke entirely (Bug A failed); depth-2+ regressed (Bug B failed). Both reverted in `c9228790` + `17d07cc8`.

### React-batching gotcha (recorded for future attempts)

The `await load(true)` wasn't just about server data — it was giving React time to **commit the optimistic `setBlips` state update**. React batches state updates; without the await, the toggle dispatch fires BEFORE the optimistic state has committed, so the toggle handler reads stale `inlineChildren` and can't find the new blip → toggle is a no-op.

### Paths to further Bug A latency reduction (out of scope)

- **Server-side**: CouchDB index for participants — the 271ms fetch is likely a full table scan
- **Client-side**: `flushSync` to commit React state synchronously before dispatching toggle — would allow the optimistic mount to actually work

## Sweep & PM

Re-ran `scripts/visual-feature-sweep.mjs` against dev VPS at commit `65e2a11c`. Result: **44/44 programmatic gates PASS · 0 FAIL · 0 no-gate**. Manifest at `screenshots/260511-AUTOSAVE-FIX-sweep-feature-sweep/`.

PM dashboard at `https://dev.138-201-62-161.nip.io/native-port-pm.html` still shows the same matrix as 2026-05-10 (no sweep-driven changes that would shift coverage % for the matrix's Jaccard token matching). Live counts: 25 PASS / 0 matrix-FAIL / 91 covered-no-gate / 109 uncovered (visual) / 57 N/A excluded.

## Cherry-pick

Cherry-picked autosave fix (`65e2a11c`) onto `feature/rizzoma-core-features` as `899f9196`. Pushed. Both branches now have the silent-content-corruption guard.

VPS side-effect: cherry-pick required `git checkout feature/rizzoma-core-features`, which silently became the active branch on the dev VPS for several pulls. Caught when later optimistic-mount commits weren't visible in the running container despite being on `feature/native-fractal-port`. Resolved by `git checkout feature/native-fractal-port` on VPS + `git pull --ff-only`. Documented as a gotcha: **always check VPS branch state after a cherry-pick to another branch**.

## Branch state

Active branch: `feature/native-fractal-port` (HEAD: `17d07cc8`). VPS at `https://dev.138-201-62-161.nip.io` is fast-forwarded to branch HEAD, container restarted, FEAT_ALL=1 set in compose env.

## Open work after today

- **Add captures for 109 uncovered visual features** (highest ROI, gradual coverage boost)
- **Trash rogue Tana tag** `-b9KQhkcs8dr` (needs user OK; destructive)
- **Phase 5** destructive deletes (blocked on user 24h+ soak validation)
