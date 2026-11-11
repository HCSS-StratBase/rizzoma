# Architecture

**Status:** AUTHORITATIVE. Supersedes `deprecated/ARCHITECTURE.md`,
`deprecated/NATIVE_RENDER_ARCHITECTURE.md`, `deprecated/arch-old-vs-new.md`,
`deprecated/TECH_STACK_OLD_VS_NEW.md`, `deprecated/EDITOR.md`,
`deprecated/EDITOR_REALTIME.md`, `deprecated/TOPIC_RENDER_UNIFICATION.md`,
`deprecated/RIZZOMA_COMPARISON.md`, `deprecated/RIZZOMA_FULL_COMPARISON.md`.
**Last reviewed:** 2026-07-14.

Current state (branch, deployment, gates, open failures) is **generated** into
[`../STATUS.md`](../STATUS.md) — never hand-write status here.

---

## 1. Stack

| Layer | Old rizzoma.com (2013, vendored in `original-rizzoma-src/`) | This app |
|---|---|---|
| Language | CoffeeScript | TypeScript |
| Client | Backbone-ish views + jQuery, direct DOM | React 18 + Vite (shell) |
| Content render | **content-array + one linear walk** (see §2) | React/TipTap hybrid (see §3) — *being replaced* |
| Editor | `editor_v2.coffee` | TipTap / ProseMirror, one editor per *actively-editing* blip |
| Realtime | Share.js OT | Y.js CRDT + Socket.IO relay; awareness for cursors/typing |
| Store | CouchDB | CouchDB (unchanged schema; blip = `parentId` + HTML body) |
| Server | Node + Express | Node + Express + Zod, session in Redis (MemoryStore on the current live process — see STATUS) |

## 2. The original's content model — the thing we are converging on

A blip's content is a **flat array of typed records**, not a DOM tree and not a document model:

```
content = [
  {type: LINE, params: {bulleted: 0}},
  {type: TEXT, text: "First label", params: {bold: true}},
  {type: BLIP, params: {THREAD_ID: "…", ID: "child-blip-id"}},   ← a child, anchored HERE
  {type: TEXT, text: " by Claude"},
  {type: LINE, …},
  …
]
```

Three element types — `LINE`, `TEXT`, `BLIP` — and **the BLIP element's array index IS its
anchor**. There is no numeric character offset, therefore **drift is impossible by
construction**. Rendering is **one linear walk** over the array: `LINE` → `<p>`, `TEXT` →
text node, `BLIP` → a `<span class="blip-thread">` whose `js-blips-container` is filled by
recursively walking the child's own content array. Fold/unfold is a **CSS class on a DOM node
that is never destroyed** — so drafts, scroll and focus survive a collapse cycle.

Full analysis, with the original CoffeeScript quoted:
**[`ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md`](./ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md)** — read it before touching the render layer (a hook enforces this).

## 3. What we built instead, and why it keeps cracking

Seven indirection layers sit between a keystroke and a rendered child:

`parentId` + numeric `anchorPosition` (server) → `RizzomaBlip.tsx` React state →
`inlineMarkers.ts` (injects marker spans) → `InlineHtmlRenderer.tsx` (walks saved HTML) →
`BlipThreadNode.tsx` (TipTap NodeView) → `ReactDOM.createPortal` → `useLayoutEffect` DOM scans —
plus **two separate create-child handlers** (topic-root in `RizzomaTopicDetail.tsx`, nested in
`RizzomaBlip.tsx`).

Every pair of layers can disagree, and each bug fix is a patch over one of those seams. The
analysis doc lists ten such bugs from a single day in May; **2026-07-14 added two more of the
same family** (the fractal dying at depth 3 because the child's mount lived in a portal that
the parent's edit-close unmounted; nested blips persisting as `<p>` because the editor
initialised before the seeded content propagated). Both were literally items 8 and 10 on that
May list.

> **Rule:** do not add another retry loop, content guard or portal patch without reading the
> analysis first. The prescribed fix is §4.

## 4. The native port — the prescribed fix

Replace the parent-of-blips render layer with a direct TS port of the original's model.
Plan (phases, gates, rollback): **[`NATIVE_RENDER_PORT_PLAN.md`](./NATIVE_RENDER_PORT_PLAN.md)**.

**Non-goals** (explicitly unchanged): server schema, Y.js/Socket.IO transport, per-blip TipTap
editor and its extensions (mentions, tags, tasks, gadgets, inline comments), auth, uploads,
playback, the React UI shell, mobile/PWA.

Code lives in `src/client/native/`:

| File | Role |
|---|---|
| `types.ts` | `ContentArray = Array<LineEl \| TextEl \| BlipEl \| AttachmentEl>` |
| `parser.ts` / `serializer.ts` | HTML ⇄ ContentArray (server stays HTML-per-blip; no DB migration) |
| `renderer.ts` | the single linear walk → DOM |
| `blip-thread.ts` | `<span class="blip-thread">`, CSS-class fold, DOM never destroyed |
| `blip-view.ts` / `wave-view.ts` | one blip's / the topic's lifecycle |
| `blip-editor-host.ts` | mounts TipTap into the *actively editing* blip; **Ctrl+Enter inserts a BLIP element at the cursor's array index** |
| `yjs-binding.ts` / `awareness.ts` | collab over the ContentArray |

Wired behind `FEAT_RIZZOMA_NATIVE_RENDER`, opt-in per session via `?render=native`.
**Its true state is measured, not asserted — see [`../STATUS.md`](../STATUS.md).**

## 5. Editor

One TipTap editor exists **only for the blip currently being edited** (this matches the
original; it is not a per-blip always-on editor). Single-active-editor is an invariant: a blip
entering edit mode broadcasts `rizzoma:active-blip-claim`, and any other surface holding the
slot **finishes and auto-saves** its edit. The topic-level editor participates in the same
protocol under the id `topic-editor:<topicId>`; a claim carrying the topic root's own id is a
click *inside* that editor and re-asserts, rather than releasing (releasing on those killed
the edit session — 2026-07-09).

Toolbar parity reference: [`EDITOR_TOOLBAR_PARITY.md`](./EDITOR_TOOLBAR_PARITY.md).
Body-structure rules (bullets are **imposed** in our app): [`BLB.md` §5](./BLB.md).

## 6. Verification architecture

Three enforcement layers — none of them optional:

1. **Gate chain** — `npm run visual:sweep` → `visual:coverage` → `parity:gate`
   ([`VISUAL_SCREENSHOT_SWEEP.md`](./VISUAL_SCREENSHOT_SWEEP.md)). Coverage gaps, a legacy
   archive below floor, too few comparison sheets, or a missing `PARITY_AUDIT.md` all FAIL.
2. **Hand-build acceptance** — `scripts/handbuild_acceptance.mjs`. Fixture-expansion and gate
   counts are **not** acceptance ([`BLB.md` §8](./BLB.md)). `parity:gate` requires fresh
   hand-build evidence newer than the last UI commit.
3. **Mandatory-docs gate** (user-scope hook `rizzoma-app-docs-gate.sh`) — touching
   `src/**` is DENIED until this file, the analysis, the port plan, the sweep doc and
   `BLB.md` have been read *this session*.
