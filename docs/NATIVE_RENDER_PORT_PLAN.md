# Native fractal-render port: detailed plan

**Goal**: replace our React/TipTap hybrid for the **parent-of-blips render layer** with a direct TypeScript port of the original Rizzoma's content-array + linear-walk renderer (per [docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md](./ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md)).

**Non-goal**: do NOT touch any of: server schema, Y.js collab transport, per-blip TipTap editor (mentions/tags/tasks/code-blocks/inline-comments), playback endpoints, auth, uploads, sidebar/header/modals, mobile/PWA shell.

**Estimated calendar time**: 2–3 weeks of focused work for one person.
**Estimated lines added**: ~1,500–2,500 TS.
**Estimated lines removed**: ~3,500–4,500 TS (RizzomaBlip + InlineHtmlRenderer + inlineMarkers + BlipThreadNode + parts of RizzomaTopicDetail).
**Net diff**: smaller codebase, fewer indirections, fewer edge cases.

---

## 0. Architecture target

```
┌─────────────────────────────────────────────────────────────┐
│ React UI shell (UNCHANGED)                                  │
│   • Sidebar, header, tabs, modals, topics list, navigation  │
│   • <RizzomaTopicDetail> hosts the new <NativeWaveView>     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ NativeWaveView (NEW, ~150 LOC TS)                           │
│   • Wraps a <div ref={containerRef}> for the wave content  │
│   • On mount: builds a Renderer + Wave class instance       │
│   • Tears down on unmount                                   │
│   • Exposes imperative methods: refresh, foldAll, focus     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Renderer (NEW, port of editor/renderer.coffee, ~300 LOC TS) │
│   • renderContent(container, contentArray) — single walk    │
│   • LINE → <p>, TEXT → text node, BLIP → BlipThread span   │
│   • Recursively renders child blips into js-blips-container │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ BlipThread (NEW, port of blip/blip_thread.coffee, ~200 LOC) │
│   • <span class="blip-thread"> with fold-button + container │
│   • fold/unfold = CSS class toggle, never destroys DOM      │
│   • Hosts per-blip editor mounted by BlipView               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ BlipView (NEW, port of blip/view.coffee, ~600 LOC TS)       │
│   • Owns one blip's lifecycle: read state, contributors,    │
│     fold state, child-blip map, edit transitions            │
│   • Mounts a TipTap editor INTO its DOM slot when isEditing │
│   • Emits/handles events: blip-insert, focus, edit, done    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ TipTap editor (UNCHANGED)                                   │
│   • Per-blip rich text editor with all extensions           │
│   • Mentions, tags, tasks, code blocks, gadgets, inline     │
│     comments — all stay as-is                               │
│   • Y.js + CollaborationCursor for real-time presence       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ ContentArray + Y.js sync (NEW, ~300 LOC TS)                 │
│   • Type: Array<LineEl | TextEl | BlipEl>                   │
│   • Wrapped in Y.Array<Y.Map> for OT/CRDT sync              │
│   • Per-blip content-array is one Y.Doc fragment            │
│   • Server-side: stays HTML-per-blip (parser converts on    │
│     load; serializer converts on save). No DB migration.    │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Feature-flag wiring (Day 0, ~1 hr)

Single new flag `FEAT_RIZZOMA_NATIVE_RENDER`. Wire through `vite.config.ts` define block (the gap that bit us today — `FEAT_RIZZOMA_PARITY_RENDER` was missing from the define for hours before discovery).

**Files**:
- `vite.config.ts` — add `'import.meta.env.FEAT_RIZZOMA_NATIVE_RENDER': JSON.stringify(process.env.FEAT_RIZZOMA_NATIVE_RENDER || '')`
- `src/shared/featureFlags.ts` — add `NATIVE_RENDER: env['FEAT_RIZZOMA_NATIVE_RENDER'] === '1'`

**Verification gate**: client-side `import.meta.env.FEAT_RIZZOMA_NATIVE_RENDER === '1'` when env set. Probe via the same DOM-class trick we used to catch parity-flag-silence.

---

## 2. Phase 1 — Spike: HTML ↔ ContentArray + native renderer (3 days)

**Deliverables**:
- `src/client/native/parser.ts` (~300 LOC) — port of `share/parser.coffee`. Parses an HTML document fragment into a `ContentArray`. Handles bullets, ordered lists, bold/italic/links/etc.
- `src/client/native/serializer.ts` (~150 LOC) — inverse: ContentArray → HTML string for server save.
- `src/client/native/types.ts` (~80 LOC) — `LineEl | TextEl | BlipEl | AttachmentEl` with strict TS unions.
- `src/client/native/renderer.ts` (~300 LOC) — port of `editor/renderer.coffee:86-121`. The 30-line walk that builds DOM from ContentArray.
- `src/client/native/blip-thread.ts` (~200 LOC) — port of `blip/blip_thread.coffee`. The `<span class="blip-thread">` wrapper + `BlipThread` class. Fold/unfold via CSS class.
- `src/client/native/__tests__/parser.test.ts` — round-trip tests: HTML → ContentArray → HTML must match original (modulo formatting whitespace).

**Deliberate scope cut**: NO real-time collab in spike. NO editor mounting. Just static render of a blip's saved HTML.

**Visual verification gate**: spike harness page that renders a static depth-10 fractal from a JSON content-array fixture. Pixel-by-pixel match with rizzoma.com's same fractal (use `screenshots/260505-rizzoma-com-vs-mine/16-rizzoma-com-depth10_old-260505.png` as the reference).

**Exit criteria**:
- ✅ Parser round-trips today's existing blip HTML without data loss
- ✅ Renderer produces DOM that visually matches rizzoma.com (verified via screenshot diff against the saved reference)
- ✅ Zero React imports in `src/client/native/`

---

## 3. Phase 2 — BlipView: lifecycle + edit-mode mounting (4 days)

**Deliverables**:
- `src/client/native/blip-view.ts` (~600 LOC) — port of `blip/view.coffee` core. Owns a single blip's:
  - DOM container (the `<span class="default-text blip-container">`)
  - Read/unread state
  - Fold state (delegated to its BlipThread)
  - Child-blip map
  - Edit-mode transitions (Edit ↔ Done)
- `src/client/native/blip-editor-host.ts` (~200 LOC) — when a BlipView enters edit mode, mounts a TipTap editor INTO its DOM slot. On Done, serializes editor content → ContentArray, hands back to BlipView, unmounts editor.
  - **Key**: TipTap editor only exists for the actively-editing blip. Other blips render via the static renderer. This is how original Rizzoma worked too — no per-blip "always-on editor."
- `src/client/native/wave-view.ts` (~250 LOC) — port of `wave/view.coffee` core. Owns the topic root and its child-blip tree.
- `src/client/components/NativeWaveView.tsx` (~150 LOC) — thin React wrapper that `useEffect`-mounts a `WaveView` instance into a div ref. Behind `FEAT_RIZZOMA_NATIVE_RENDER`.

**Side-by-side toggle**: `RizzomaTopicDetail.tsx` checks `FEATURES.NATIVE_RENDER`; if true → `<NativeWaveView />`, else → existing render path. No demolition of old code yet.

**Verification gates**:
- ✅ Static rendering of an existing topic matches the React/TipTap render visually (allow 5% pixel diff for unrelated chrome)
- ✅ Click a blip → enters edit mode (TipTap editor mounted) → click Done → exits, content saved
- ✅ Ctrl+Enter inside an editor inserts a BLIP element at cursor index in the parent's ContentArray; renderer immediately wraps it in a BlipThread; cursor moves into the new child's editor; user types
- ✅ Click [+] / [-] toggles fold via CSS class; subtree DOM persists; in-progress draft text in any nested editor survives the cycle
- ✅ Existing `scripts/rizzoma_sanity_sweep.mjs` (14 checks) all pass against `?layout=rizzoma&render=native`
- ✅ Existing `scripts/verify_state_survives_collapse.mjs` passes against the native path

---

## 4. Phase 3 — Y.js collab over ContentArray (3 days)

**Deliverables**:
- `src/client/native/yjs-binding.ts` (~250 LOC) — wraps `Y.Array<Y.Map>` over each topic/blip's content array. Renderer subscribes to Y.Array events for incremental DOM updates (insert/delete/update — same API as Plotly's Plotly.react vs Plotly.newPlot).
- Per-blip TipTap editors keep their existing Y.XmlFragment-via-Collaboration extension. The TipTap fragment is converted to/from a TextEl + LineEl sequence on Done (same logic as today's `getHTML()` save, just feeding the parser).
- Awareness (presence + cursor color) stays in the per-blip TipTap editor. The native renderer doesn't need awareness — cursors are always inside an editing blip.

**Verification gate**:
- ✅ Two browser tabs open same topic; insert via Ctrl+Enter in tab A → appears in tab B within 1 second
- ✅ Edit blip text in tab A → tab B's render updates within 1 second
- ✅ Fold/unfold a blip in tab A → does NOT propagate to tab B (fold is local UI state, per original Rizzoma)
- ✅ Real-time cursor (same color as user's avatar) appears in the editor of whichever blip the other user is editing

---

## 5. Phase 4 — Auxiliary features (2 days)

Each is a small wiring exercise — feature already exists; just need to call it from the new render path.

| Feature | Port effort | Notes |
|---|---|---|
| **Wave-level playback** (`WavePlaybackModal.tsx`) | 0 hr | Reads from server endpoint; renders preview HTML; unrelated to live render path |
| **Per-blip history** (`BlipHistoryModal.tsx`) | 1 hr | Same — server-side; just need a "show history" button in BlipView's gear menu |
| **Mentions / hashtags / tasks** | 0 hr | Per-blip editor extensions; survive the port unchanged |
| **Inline comments** | 2 hr | Per-blip TipTap extension; needs to know its anchor in the new parent's content (resolved via Y.js position binding) |
| **Code blocks / gadgets** | 0 hr | Per-blip editor extensions |
| **Follow-the-Green / unread** | 1 hr | Server unread state already + per-blip event listener; rewire to BlipView's read-state setter |
| **Mobile gestures (swipe, pull-to-refresh)** | 1 hr | UI shell only — unaffected |
| **Offline queue** | 0 hr | Wraps `api()` calls — unaffected |

**Verification gate**: visual sweep `scripts/visual-feature-sweep.mjs` (the 161-row matrix) against `?render=native` — every row that pre-existed should still pass.

---

## 6. Phase 5 — Cut over + cleanup (2 days)

**Day 1 — Cut over**:
- Set `FEAT_RIZZOMA_NATIVE_RENDER=1` on dev VPS container
- Run full sanity sweep + state-survives-collapse + visual-feature-sweep + manual smoke
- Compare side-by-side with rizzoma.com depth-10 reference one more time
- Open a 24-hour soak window — me + you using it for actual work, watching for edge cases

**Day 2 — Cleanup commit**:
- Delete: `RizzomaBlip.tsx` (~2,200 LOC), `InlineHtmlRenderer.tsx` (~280 LOC), `inlineMarkers.ts` (~125 LOC), `BlipThreadNode.tsx` (~150 LOC), portions of `RizzomaTopicDetail.tsx` (~600 LOC of the topic-content-area logic)
- Net delete: ~3,500 LOC; net add: ~2,000 LOC; **net codebase reduction: ~1,500 LOC**.
- Drop the `FEAT_RIZZOMA_NATIVE_RENDER` flag — native is the only path
- Drop the `FEAT_RIZZOMA_PARITY_RENDER` flag too (parity becomes default)
- Update `CLAUDE.md` "BLB Architecture" section + create `docs/NATIVE_RENDER_ARCHITECTURE.md`

---

## 7. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **TipTap collab + Y.js position binding to native ContentArray is fiddly** | Keep TipTap collab fragment per-blip (one Y.XmlFragment per blip's text content); the native ContentArray binding is at the OUTER level only (Y.Array of {type, params, blip-ref}). No need to merge them. |
| **HTML → ContentArray parser misses edge cases in old data** | Round-trip tests on every topic in the dev DB. Bail-out path: any blip whose HTML doesn't round-trip cleanly stays on the React path until the parser is patched. |
| **Browser quirks in block-inside-paragraph layout (LI bullet break)** | Original Rizzoma had this exact quirk and lived with it (text after a BLIP element flows on the line below the rendered child); pixel-match against rizzoma.com proves we land at the same place. |
| **Subtle collab desync between tabs** | Mocha Y.js test suite that drives two `Y.Doc` instances through ops sequences and verifies convergence. Standard CRDT testing. |
| **Performance regression at 100+ blip topic** | The original handled 1000-blip topics fine. We have `scripts/perf-harness.mjs` already; gate on it. Native render is INHERENTLY faster than React reconciliation for unchanged subtrees (no diff cost). |
| **Service worker caches old bundle** | Existing `useServiceWorker.ts` + `import.meta.env.DEV` skip already handles this. |
| **One developer can't validate everything** | Each phase has automated verification gates. Manual soak with 2 users at end of phase 5. |

---

## 8. Daily verification gates (running cost)

Every commit during the port runs:
1. `npm run typecheck` (existing)
2. `node scripts/rizzoma_sanity_sweep.mjs` against `?render=native` (extended to cover native path)
3. `node scripts/verify_state_survives_collapse.mjs` against native path
4. `npm run perf:harness` for any rendering change (bigger than +5% wall time = block)

CI gates (added in phase 1):
- `npm run test:native-parser` (round-trip HTML)
- `npm run test:native-renderer` (snapshot-match against rizzoma.com fixtures)
- `npm run test:native-collab` (Y.js convergence on op sequences)

---

## 9. Calendar (one-developer estimate, in workdays)

| Phase | Days | Cumulative |
|---|---|---|
| 0. Feature-flag wiring + verify-flag-reaches-client | 0.5 | 0.5 |
| 1. Spike: parser + renderer + BlipThread (static render) | 3 | 3.5 |
| 2. BlipView lifecycle + TipTap edit-mode mounting + Ctrl+Enter | 4 | 7.5 |
| 3. Y.js collab binding + cross-tab sync | 3 | 10.5 |
| 4. Auxiliary feature wiring (playback, comments, mentions, etc.) | 2 | 12.5 |
| 5. Cut over + 24-hour soak + cleanup commit | 2 | 14.5 |
| **Total** | | **~3 calendar weeks** including buffer |

Could compress to 2 weeks with two developers in parallel after phase 1 (one on collab, one on UX features).

---

## 10. Daily progress checklist (during the port)

End-of-day checklist while porting:
- [ ] Today's commits pushed to `feature/native-fractal-port` branch
- [ ] Sanity sweep + state-survives-collapse pass on the new path
- [ ] Visual sweep diff vs reference: any new red items?
- [ ] Tana entry posted to canonical day node (HCSS workspace)
- [ ] Bundle on GDrive
- [ ] Open issues / blockers documented in `_native_port_log.md`

---

## 11. Rollback plan

If at end of phase 5's soak we find a blocking issue:
- Toggle `FEAT_RIZZOMA_NATIVE_RENDER=0` on VPS → instant revert to React path (zero downtime)
- Patch / re-soak / re-cutover

The cleanup commit (phase 5 day 2) is reversible until merged to master. Stay on `feature/native-fractal-port` branch until soak is fully clean.

---

## 12. What this DOES NOT change

Explicit non-changes (so we have a clear contract):
- ❌ Server schema, CouchDB indexes, blip storage format
- ❌ Y.js / Socket.IO / OT pipeline
- ❌ Auth (Google, FB, MS, SAML, local)
- ❌ Upload pipeline (S3, MIME, ClamAV)
- ❌ React UI shell (sidebar, header, tabs, modals)
- ❌ Mobile / PWA / service worker
- ❌ Per-blip TipTap editor + all its extensions (mentions, tags, tasks, code blocks, gadgets, inline comments)
- ❌ CI / health checks / perf budgets / visual sweep gate
- ❌ Wave-level + per-blip playback endpoints
- ❌ Follow-the-Green unread tracking
- ❌ Backups / bundle / Tana / hooks workflow

What it DOES change is exactly the fractal-render layer that's been our pain point all session.

---

## TL;DR

3 weeks. Net codebase reduction ~1,500 LOC. Every existing feature stays. The port replaces ONLY the parent-of-blips render layer with the original's content-array + linear-walk + BlipThread-CSS-class-fold model. Behind a flag the whole way; instant rollback if soak finds an issue. Phase verification gates are concrete and automated.
