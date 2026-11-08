# Native fractal-render — architecture

> **Status (2026-05-06)**: Phases 0-4 done, Phase 5 6/11 done + 1 WIP + 5 deferred. The native render path is opt-in via `?render=native` URL flag and the `FEAT_RIZZOMA_NATIVE_RENDER=1` env var. Default path is still the React-portal+TipTap path.

> **Important — what "native render" does NOT replace:**
>
> - **TipTap stays.** Per-blip edit mode mounts a real TipTap Editor with ALL existing extensions (mentions, hashtags, tasks, code-block-lowlight, image/chart/poll gadgets, BlipKeyboardShortcuts, Collaboration). The native path uses TipTap for editing — see `tiptap-adapter.ts`.
> - **React stays for the outer app shell.** `RizzomaTopicDetail`, `RizzomaLayout`, navigation, modals, the WavePlaybackModal — all still React. `NativeWaveView.tsx` is a thin React wrapper that hosts the native DOM tree.
> - **Y.js + Collaboration extension stay.** Per-blip body uses `Y.XmlFragment` (TipTap's native collab type) under `TopicDoc.blipFragment(id)`.
>
> What "native render" DOES replace:
> - Per-blip `React.createPortal` teleporting child blips into anchor slots
> - Per-blip React component (`RizzomaBlip.tsx` ~2,200 LOC) managing fold/expand state via React
> - Mixed view-mode/edit-mode rendering split (some via `dangerouslySetInnerHTML`, some via `createPortal`, some via React subtrees)
> - The "card-stack" visual style that the portal pattern produced (gap #2 in yesterday's analysis)

This doc is for anyone reading the `src/client/native/` tree for the first time. It explains what the port does, how the pieces fit, and which file to read for which question.

For the **why** behind the port (and the 10 stylistic gaps that drove it), read [`docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md`](./ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md). For the **plan + phasing**, read [`docs/NATIVE_RENDER_PORT_PLAN.md`](./NATIVE_RENDER_PORT_PLAN.md).

## 1. The model — one record-array per blip

Original Rizzoma's editor (`editor/model.coffee`) modeled blip body content as a flat ordered array of typed records. The port keeps that exact shape:

```ts
type ContentArray = Array<TextEl | LineEl | BlipEl | AttachmentEl>;

interface LineEl { type: 'line'; text: ' '; params: { bulleted?, numbered?, heading? } }
interface TextEl { type: 'text'; text: string; params: { bold?, italic?, url?, ... } }
interface BlipEl { type: 'blip'; text: ' '; params: { id: string; threadId? } }
```

Each blip's body content is one ContentArray. **The DOM tree IS the blip tree, 1:1** — child blips appear as `BLIP` records inside the parent's array, structurally nested in the rendered DOM via `<span class="blip-thread">`. No React.createPortal teleporting children out of flow.

**Read**: [`src/client/native/types.ts`](../src/client/native/types.ts).

## 2. Parse + serialize — HTML ↔ ContentArray

Two pure functions bridge between Tana-style record arrays and HTML:

- **`parseHtmlToContentArray(html: string): ContentArray`** — walks an HTML document depth-first, emitting LINE / TEXT / BLIP / ATTACHMENT records into a flat array. Used at first sync (load saved HTML from CouchDB, materialize the model).
- **`serializeContentArrayToHtml(arr: ContentArray): string`** — the inverse, walks the array once and emits HTML. Output is round-trip stable.

Direct ports of original Rizzoma's `share/parser.coffee` HtmlParser. Dev-DB round-trip verified by `scripts/native_roundtrip_devdb.mjs` against the VPS CouchDB (5/5 blips clean after the 3 parser-bug-fix commits).

**Read**: [`src/client/native/parser.ts`](../src/client/native/parser.ts), [`src/client/native/serializer.ts`](../src/client/native/serializer.ts).

## 3. Render — single linear walk

`renderContent(container, content, opts)` walks the ContentArray once and builds DOM:

- LINE → `<p>` / `<li>` / `<h1..6>` (with appropriate list/heading classes)
- TEXT → text node + styling spans (bold/italic/etc.)
- BLIP → wrap in `<span class="blip-thread">` w/ a `<div class="js-blips-container">` slot for the structural child blip; same threadId batches into one BlipThread
- ATTACHMENT → `<img>`

`opts.resolveChildBlip(id) → HTMLElement` is the callback that returns the child blip's container — typically built by the caller's BlipView via the same renderer recursively.

Direct port of original Rizzoma's `editor/renderer.coffee:86-121` walk. Phase 1's depth-10 spike (`__tests__/spike-depth-10.test.ts`) renders 2047 blips × depth 10 in jsdom, all folded by default, with subtree-preserving fold/unfold.

**Read**: [`src/client/native/renderer.ts`](../src/client/native/renderer.ts), [`src/client/native/blip-thread.ts`](../src/client/native/blip-thread.ts).

## 4. Per-blip view — BlipView

`BlipView` owns one blip's `<div class="blip-container">` + inner `<div class="blip-text">` slot. The container persists across re-renders; only the inner content is replaced — preserves the original's invariant that fold/unfold never destroys the subtree.

API surface:
- `setContent(arr)` — replace content, re-render
- `setChildResolver(fn)` — wire how to find child blip containers (set by WaveView)
- `setHistoryHandler(fn)` — wire the per-blip history button click
- `getContainer()` / `getInner()` — for callers that mount editors into the slot
- `destroy()` — tear down

The native DOM gear menu (history button etc.) is owned by BlipView directly — no React, no portal — survives fold/unfold without remount. CSS `.blip-container:hover > .blip-gear-menu` reveals on hover.

**Read**: [`src/client/native/blip-view.ts`](../src/client/native/blip-view.ts).

## 5. Topic-level — WaveView

`WaveView` is the topic registry. Per-topic Y.Doc-equivalent at the structural level: lazy BlipView materialization, child-resolver wiring, lifecycle events (`blip-added` / `blip-removed` / `root-set` / `unread-changed` / `destroyed`), DOM helpers (`findViewForElement`, `nextUnreadAfter`).

**Read**: [`src/client/native/wave-view.ts`](../src/client/native/wave-view.ts).

## 6. Edit mode — BlipEditorHost + tiptap-adapter

Per-blip edit mode mounts a TipTap editor into the BlipView's inner slot:

- **`BlipEditorHost`** (TipTap-agnostic): `mount()` seeds editor with `serializeContentArrayToHtml(view.getContent())`; `save()` parses editor HTML back to ContentArray and writes to view; `unmount()` tears down + re-renders read mode; `cancelAndUnmount()` rolls back.
- **`tiptap-adapter`** (TipTap-importing): `makeTipTapFactory(extensions, props)` produces a factory that returns a `BlipEditorAdapter`. Caller passes the project's existing `getEditorExtensions()` config — mentions / hashtags / tasks / code-block-lowlight / image gadget / chart gadget / poll gadget / etc. all plug in for free.
- **`insertChildBlipAtCursor(cursorMarker, newBlipId)`** — Ctrl+Enter handler. Walks the current paragraph forward to the next LINE, inserts a BLIP element at the END of the paragraph (matches original Rizzoma's behavior), strips the cursor marker. Returns the new ContentArray.

**Read**: [`src/client/native/blip-editor-host.ts`](../src/client/native/blip-editor-host.ts), [`src/client/native/tiptap-adapter.ts`](../src/client/native/tiptap-adapter.ts).

## 7. Real-time collab — yjs-binding + awareness

- **`TopicDoc`** (in `yjs-binding.ts`): per-topic `Y.Doc` with shared `Y.Array<Y.Map>` at key `'content'` for the structural blip tree. Per-blip body editing rides on TipTap's existing `Y.XmlFragment` plumbing under `'blip:<id>'` keys (TipTap's `Collaboration` extension binds to those fragments).
- **Mutation helpers**: `insertBlipMarker` / `insertText` / `insertLine` / `removeAt` — all transactional.
- **`observeContent(yarr, listener)`**: subscribe via `observeDeep`; listener receives a fresh ContentArray snapshot per change.
- **`TopicAwareness`**: wraps `y-protocols/awareness` with the project's `UserPresence` + `CursorState` shape. `setUser` / `setCursor` / `getParticipantsInBlip(blipId)` / `on(listener)`. Deterministic color palette via `colorForUserId`.

Cross-tab convergence verified by `__tests__/yjs-binding.test.ts` (3 cross-Y.Doc cases). Awareness-level cross-client presence + cursor sharing verified by `__tests__/awareness.test.ts` (9 cases).

**Read**: [`src/client/native/yjs-binding.ts`](../src/client/native/yjs-binding.ts), [`src/client/native/awareness.ts`](../src/client/native/awareness.ts).

## 8. React integration — NativeWaveView

`NativeWaveView.tsx` is a thin React wrapper. It does NOT render any topic content itself — that's the WaveView's job. It:

1. Reads `FEATURES.RIZZOMA_NATIVE_RENDER`
2. If on, instantiates a WaveView with the given content lookup
3. Mounts WaveView's root container into a host `<div>`
4. Renders a tiny native toolbar (currently: Playback button → opens `WavePlaybackModal`)
5. Cleans up on unmount or topic switch
6. Wires mobile gestures (`usePullToRefresh` + `useSwipe`-left to collapse)

`RizzomaTopicDetail.tsx` chooses between this and the existing React/TipTap path via `?render=native` URL flag (early-return path mounts NativeWaveView; default path renders the legacy tree).

**Read**: [`src/client/components/native/NativeWaveView.tsx`](../src/client/components/native/NativeWaveView.tsx), [`src/client/components/native/NativeWaveView.css`](../src/client/components/native/NativeWaveView.css).

## 9. Tests + visual gate sweep

**Programmatic vitest unit tests (68 native):**



| File | Tests | Covers |
|---|---|---|
| `parser.test.ts` | 8 | HTML → ContentArray smoke + depth-3 fractal |
| `serializer.test.ts` | 15 | ContentArray → HTML + parser↔serializer round-trip |
| `spike-depth-10.test.ts` | 2 | depth-10 fractal in jsdom (2047 blips, fold semantics) |
| `blip-editor-host.test.ts` | 10 | mount/save/unmount lifecycle + Ctrl+Enter inline insert |
| `wave-view.test.ts` | 10 | registry + events + DOM helpers + Follow-the-Green |
| `yjs-binding.test.ts` | 14 | round-trip + mutation helpers + cross-Y.Doc convergence |
| `awareness.test.ts` | 9 | presence + cursor + cross-tab listener |

Run all: `npx vitest run src/client/native/__tests__/`.

**Visual feature sweep (`scripts/visual-feature-sweep.mjs`):**

Drives a Playwright session through the full UI surface and captures screenshots + runs PROGRAMMATIC gate assertions per step. Each `capture()` accepts an optional `assertFn: async (page) => boolean | { pass, detail }` that probes DOM/state for the actual condition.

The manifest at `<sweep-dir>/manifest.md` records gate results as `✓ PASS / ✗ FAIL / · no-gate` per capture. Headline reports `N / M programmatic gates PASS (out of K captures total)` — `K - M` captures without an assertFn are explicitly flagged as descriptive-only (NOT verified). Failed gates get a dedicated section with details.

**Anti-pattern to avoid**: a sweep with 100 screenshots but 0 assertFns is theatre — the manifest's "Assertion:" string is documentation, not verification. Same anti-pattern as PM `done` markings without checks. See [`feedback_sweeps_must_verify_behavior.md`](file:///home/stephan/.claude/projects/-mnt-c-Rizzoma/memory/feedback_sweeps_must_verify_behavior.md).

Run via:
```bash
RIZZOMA_BASE_URL=https://dev.138-201-62-161.nip.io \
RIZZOMA_SWEEP_DIR=screenshots/<date>-feature-sweep \
RIZZOMA_E2E_PASSWORD='VisualSweep!1' \
node scripts/visual-feature-sweep.mjs
```

Latest run (2026-05-06, `screenshots/260506-GATED-sweep/`): **14/15 programmatic gates PASS, 1 FAIL** (selector-bug, not product). 30 captures still need `assertFn` added.

## 10. The 5-commit Ctrl+Enter inline-mount fix

The central bug yesterday's depth-10 side-by-side exposed: Ctrl+Enter created the child blip on the server + inserted the `[+]` marker, but the new child never expanded inline. Subsequent keystrokes went back to the parent editor — flat list S1a/S1b/.../S10c instead of nested fractal.

Five commits cracked it (all on `feature/native-fractal-port`):

| Commit | What |
|---|---|
| `1cf7772b` | toggle handler: `parentId` claim path + `await load(true)` |
| `1d4c5368` | `load(force=true)` bypasses concurrent-load early-return; optimistic blip injection into local state |
| **`93e4ce14`** | **the actual root-cause** — `RizzomaBlip` portal block was gated on `!parityViewRender`, which excluded topic-edit-via-`contentOverride` mode. Gate now allows TipTap-marker rendering in either path. |
| `748d5b74` | debug log cleanup |
| `53ce5ad8` | drop redundant `Ctrl+Shift+8` inside loop (server already seeds `<ul><li>` for new children; toggling broke depth-9-10) |

Visual proof: [`screenshots/newriz-depth10-260506-FIXED-v2/`](../screenshots/newriz-depth10-260506-FIXED-v2/) (depth-10 build runs end-to-end), [`screenshots/side-by-side-260506-FIXED-v2/CONTACT-SHEET-FIXED-v2-all-18.png`](../screenshots/side-by-side-260506-FIXED-v2/CONTACT-SHEET-FIXED-v2-all-18.png) (rizzoma.com left vs ours right, all 18 build steps).

## 11. What's deferred (Phase 5)

These cleanups can't run until the native path is the DEFAULT (currently opt-in only via `?render=native`) AND a 24h+ soak passes:

- Delete `RizzomaBlip.tsx` (~2,200 LOC)
- Delete `InlineHtmlRenderer.tsx` (~280 LOC)
- Delete `inlineMarkers.ts` (~125 LOC)
- Delete `BlipThreadNode.tsx` (~150 LOC)
- Trim `RizzomaTopicDetail.tsx` (~600 LOC)
- Drop both `FEAT_RIZZOMA_PARITY_RENDER` and `FEAT_RIZZOMA_NATIVE_RENDER` flags

Net delta: ~3,500 LOC removed. Native path becomes the only path.

The decision point: the user needs to verify the native path covers all use cases (edit, collab, mentions, gadgets, mobile gestures) under daily use. Until then the React/TipTap path stays as a fallback.

## 12. PM tracking

Two PMs read live data from `gh issue view` + `git log`:

- **Terminal**: `pmr` (script at `scripts/pm_native_port.py`, launcher at `~/.local/bin/pmr`)
- **HTML**: `pmrh` (script at `scripts/build_native_pm.mjs`, launcher at `~/.local/bin/pmrh`)

Auto-WIP detection: a deliverable shows ◐ if any of its `files` is git-dirty OR was modified in the last 5 minutes. Manual `wip=True` is honored as an override.
