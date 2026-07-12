# Original Rizzoma's fractal blip-nesting logic — and why our React/TipTap hybrid keeps cracking against it

**Written**: 2026-05-05 evening, after a day of "fix one edge case → another pops up" on Ctrl+Enter, bullets, drift, collapse-state, marker placement.
**Source-of-truth files**: `original-rizzoma-src/src/{client,share}/...` (the Rizzoma 2017-era CoffeeScript checked into our repo for reference).
**Verdict**: our current architecture (React component tree + TipTap/ProseMirror editor + numeric `anchorPosition` field + portal-rendered children) is fundamentally incompatible with the original's elegance. We are doing a clean port of the original CoffeeScript model to TypeScript next, instead of patching React seams.

---

## 1. The original's content model (one idea, applied recursively)

A Rizzoma blip's content is a **flat array of typed elements**, NOT a DOM tree, NOT a React tree, NOT a JSON document model. From `share/parser.coffee` + `client/editor/parser.coffee`:

```
content = [
  {type: LINE, params: {...}},                  # paragraph break with optional list params
  {type: TEXT, text: "First label by ", params: {bold: yes, ...}},
  {type: BLIP, params: {THREAD_ID: "...", ID: "child-blip-id"}},
  {type: TEXT, text: "Claude", params: {...}},
  {type: LINE, params: {bulleted: 0}},
  {type: TEXT, text: "Second label by Claude", ...},
  {type: BLIP, params: {THREAD_ID: "...", ID: "another-child-blip-id"}},
  ...
]
```

Three element types matter:
- **LINE** — line break / paragraph boundary, carries list-level params (bulleted/numbered + nesting depth)
- **TEXT** — a styled run of plain text (with its own `params` like bold, italic, color, url)
- **BLIP** — a reference to a child blip by ID; positioned BETWEEN the surrounding LINE/TEXT elements

The `BLIP` element type IS the structural anchor. Its **position in the array** is its anchor position. There is no separate numeric offset. There can never be drift.

A child blip's content is itself the same flat array. **Rendering is recursive**: the child blip is rendered into a `<div class="js-blips-container">` inside its parent's content stream, sandwiched between the surrounding LINE elements.

That's the whole model. Three element types, recursive.

---

## 2. The original's render flow (one walk, no virtual DOM)

From `editor/renderer.coffee:86-121`:

```coffee
renderContent: (@_container, content) ->
    $container = $(@_container); $container.empty()
    $curPar = null; lastEl = null; lastThread = null
    for element in content                                          # walk the flat array once
        params = element[ModelField.PARAMS]
        node = @_renderElement(element[ModelField.TEXT], params)
        switch params[ParamsField.TYPE]
            when ModelType.LINE                                     # → start a new <p>
                $curPar = $(node); $container.append(node); lastThread = null
            when ModelType.BLIP                                     # → open or extend a BlipThread
                if (threadId = params[ParamsField.THREAD_ID]) and lastThread \
                        and threadId is lastThread.getId()
                    lastThread.appendBlipElement(node)              # same thread → append into existing
                else
                    threadId = params[ParamsField.THREAD_ID] || params[ParamsField.ID]
                    lastThread = new BlipThread(threadId, node)     # new thread → wrap node
                    $last = $curPar.children().last()
                    $last = $last.prev() if $last[0].tagName.toLowerCase() isnt 'br'
                    $last.before(lastThread.getContainer())          # insert BEFORE trailing <br>
            else                                                    # TEXT / IMG / etc.
                $last = $curPar.children().last()
                $last = $last.prev() if $last[0].tagName.toLowerCase() isnt 'br'
                $last.before(node)
                lastThread = null
```

That's the entire main render loop. It walks the array once, building a real DOM tree:
- LINE → `<p>`
- TEXT → text node inserted into the current `<p>` before its trailing `<br>`
- BLIP → wrap in a `BlipThread` span, insert into the current `<p>` (before its `<br>`); subsequent BLIP elements with the same `THREAD_ID` append into that same thread

A `BlipThread` (from `blip/blip_thread.coffee`) is just:

```coffee
@_container = document.createElement('span')
@_container.contentEditable = 'false'
@_container.className = 'blip-thread'
@_container.innerHTML = renderBlipThread()    # fold-button-container + js-blips-container
```

Inside the `js-blips-container` you append child blip DOM nodes. **Each child blip is itself rendered by the SAME `renderContent` walk over its own content array.** Recursion all the way down.

There is no createPortal. No virtual DOM. No keyboard-event-handler-passes-anchor-offset-to-API. Just: walk the array, build the DOM, attach handlers.

---

## 3. The original's collapse/expand: a CSS class on a persistent DOM node

`blip_thread.coffee:35-63`:

```coffee
_toggleFold: =>
    if @_folded then @_unfold() else @_fold(no)

_unfold: ->
    @_folded = no
    DomUtils.removeClass(@_container, FOLDED_CLASS)    # 'folded' off
    @emit('unfold')

_fold: (animated) ->
    return if @_folded
    @_folded = yes
    DomUtils.addClass(@_container, FOLDED_CLASS)       # 'folded' on
```

That's it. The DOM never gets destroyed. The whole subtree (with all its draft input, scroll position, focus, child editors) remains attached. CSS `.folded { display: none }` (or animated equivalent) hides it. Re-expand is the inverse class toggle.

Our preserve-on-fold trick (commit `71cdf0a1`) tries to imitate this in React — but React's reconciliation is fundamentally about diffing virtual trees, not "leave it alone." Every tweak to the parent's render risks unmounting the child accidentally. We've already had to work around it three times today.

---

## 4. The original's Ctrl+Enter: insert a BLIP element at cursor index

`editor/editor_v2.coffee:1312-1333` (the editor consumes content arrays):

```coffee
when ModelType.BLIP
    if not lastThread or lastBlipThreadId isnt params[ParamsField.THREAD_ID]
        lastBlipThreadId = params[ParamsField.THREAD_ID]
        lastThread = new BlipThread(Math.random())
```

When the user hits Ctrl+Enter:
1. The editor's keystroke handler creates a new BLIP element with a fresh random THREAD_ID
2. **Inserts it into the content array at the cursor's current array index** (not a character offset)
3. The renderer immediately sees the new element on its next pass and inserts a BlipThread span at that array position, inside the current `<p>`
4. The new child blip's content (also a content array, initially empty) starts being rendered into the `BlipThread`'s `js-blips-container`
5. Cursor moves into the new child's editor. User starts typing.

The position is NEVER expressed as a numeric character offset. It's the array index of the BLIP element. When the user edits parent text BEFORE the BLIP, the array shifts — but the BLIP element's index relative to its surrounding LINE elements is preserved automatically because LINE elements stay in place too. **No drift is possible by construction.**

---

## 5. What we built instead, and why it keeps cracking

Our model:

| Layer | What it does |
|---|---|
| Server (`server/routes/blips.ts`) | Stores each blip with `parentId` + numeric `anchorPosition` field |
| `RizzomaBlip.tsx` | React component, has its own state for `localExpandedInline` + `everMountedInline` |
| `InlineHtmlRenderer.tsx` | Walks parent's saved HTML, finds marker spans, renders child blips inline via React JSX |
| `inlineMarkers.ts` | Legacy renderer that injects marker spans based on `anchorPosition` |
| `BlipThreadNode.tsx` | TipTap NodeView that renders the marker + a portal anchor inside the editor |
| `BlipKeyboardShortcuts.ts` (Mod-Enter) | Captures cursor PM-position, computes a text-offset, calls a callback |
| `RizzomaTopicDetail.tsx` / `RizzomaBlip.tsx` | Each has its OWN createInlineChildBlip handler (topic-root vs nested) |
| `ReactDOM.createPortal` | Teleports React JSX into BlipThreadNode's portal anchor span (in edit mode) |
| `useLayoutEffect` (RizzomaBlip:765+) | Imperatively scans for portal anchors after each render to populate the portal-target map |

Every one of these layers is an interpretation step that can disagree with another. The bugs we've shipped today, in chronological order:

1. **Parity flag silently inactive** (4 hours wasted) — `vite.config.ts` define missing → client never read FEAT_RIZZOMA_PARITY_RENDER → my entire B1+B2+preserve-fold work was running by accident on the OLD non-parity code path. (`2e3d6fd1`)
2. **LI bullet broken** — block-level inline-child div rendered inside `<p>` inside `<li>` → browser closes `<p>` early → text after the marker becomes orphaned non-list-item content. (`2e3d6fd1`)
3. **Bullets jump out of editor box** — `.rizzoma-parity .blip-text ul { padding-left: 0 }` matched the editor's UL because the editor lives inside an outer parent's `.blip-text`. (`e47c56de`)
4. **Click `[+]` renders child TWICE** — `mountedMarkersInside(li)` and `mountedMarkersInside(p)` both found the same marker because `childrenAlreadyPlaced.add()` ran AFTER walking children. (`48a53931`)
5. **New child contenteditable=false** — `useEditor`'s `editable: isEditing` doesn't propagate via `setOptions()`; needed an explicit `setEditable()` useEffect. (`fb6cba9c`)
6. **Marker drift** — Ctrl+Enter sent ProseMirror's `selection.from` (counts node tokens) but renderer interpreted it as text-offset. (`d9785604`)
7. **Drop the numeric anchorPosition entirely** — even after the conversion, the field could drift. Made it a sentinel-only. (`be9c7a95`)
8. **Auto-edit not firing** — new child mounted with `isEditing=false` and stayed there. Needed external `rizzoma:enter-edit-blip` event. (`34e3ff62`)
9. **Render-outside-editor flat-stack** — earlier "fix" to avoid the LI-bullet break placed new children below the editor instead of at cursor → user "doesn't open inline AS IN THE ORIGINAL". (`cc7caf4b` revert)
10. **Sanity sweep gap** — only tested topic-root Ctrl+Enter, missed the nested-blip case. (`cc7caf4b` doc note)

Every one of these is a symptom of the same disease: **our content model fights React's reconciliation model.** The original puts content in an array of typed records and renders linearly. We put content in HTML strings + numeric offsets + React component trees + portal anchors + TipTap NodeViews, and try to keep them all in sync.

Each "fix" is a patch over the seam between two of those layers. Patching seams forever is a losing strategy.

---

## 6. Why "just port the CoffeeScript to TypeScript" is the right move

The original codebase is **~3,973 lines** for the four core files (`blip_thread.coffee` + `blip/view.coffee` + `blip/index_base.coffee` + `editor/renderer.coffee`) plus its parser (`share/parser.coffee` ~376 lines) and its editor (`editor/editor_v2.coffee` ~2,300 lines). Call it **~6,500 lines** for the whole content/render/editor stack. We've already touched a comparable amount in our current React/TipTap hybrid.

A direct port would replace:
- `RizzomaBlip.tsx` (~2,200 lines, mixes view + editor + collab + portal + state)
- `InlineHtmlRenderer.tsx` + `inlineMarkers.ts` + `BlipThreadNode.tsx` (~400 lines combined)
- `RizzomaTopicDetail.tsx` (~1,500 lines, owns the topic-root editor + its own create-inline-child handler)
- `BlipKeyboardShortcuts.ts` + `EditorConfig.tsx` + parts of TipTap config

with:
- A `ContentArray` type: `Array<LineElement | TextElement | BlipElement>` (same as original's content model)
- A `Renderer` class that walks the array and builds DOM (port of `editor/renderer.coffee`'s 200 lines) — still uses real DOM, not React, for the editable content
- A `BlipThread` class wrapping the `<span class="blip-thread">` + fold/unfold via CSS class (direct port of 182-line `blip_thread.coffee`)
- A `Blip` view class managing one blip's content + handlers (port of `view.coffee` ~1,000 lines)
- A `Wave` view class managing the topic + its children (port of `wave/view.coffee`)
- React only for the OUTER chrome (sidebar, tabs, modals) — not for the content itself

The wins:
- **No portal + portal-anchor + useLayoutEffect imperative DOM mutation chain.** Just direct DOM rendering driven by the content array.
- **No anchorPosition drift.** Position is array-index + structural placement.
- **No "block-inside-paragraph breaks the LI" issue.** Original Rizzoma had this same browser quirk and lived with it (text after a BLIP element flows on the line below the rendered child); our React-portal approach made it worse.
- **No two-Tana-day-node, two-render-paths, two-edit-states class of bug.** Single render path. Single content model.
- **Collaboration via Y.js / OT** can still wrap the content array (the original used Share.js which is the same family).

The losses:
- We give up React's nice DX for the content area — instead of `<RizzomaBlip blip={blip} />` we'd have `new BlipView(content).render(container)`.
- We give up TipTap's nice rich-text features for free — would need to port the editor commands too (or keep TipTap on a per-blip basis but stop conflating it with the parent's content model).
- ~2-3 weeks of focused porting work, vs the trickle of patches we've been shipping.

---

## 7. What I'd actually do next

If you green-light it, I'd:

1. **Spike (1-2 days)**: port `share/parser.coffee` + `editor/renderer.coffee` + `blip/blip_thread.coffee` to TypeScript, render a single static topic from a JSON content array. Verify the cascading nest looks identical to today's React output, with NONE of the React/portal machinery.
2. **Behind a flag**: gate the new render path under `FEAT_RIZZOMA_NATIVE_RENDER=1` (separate from the parity flag), wired through `vite.config.ts` define this time so we don't repeat today's silent-inactive disaster. Side-by-side with today's build until parity is proven.
3. **Port editor (3-5 days)**: bring `editor/editor_v2.coffee` over (the keystroke handler + cursor management + content array mutation). Wire Ctrl+Enter to insert a BLIP element at cursor index — no more numeric anchorPosition, no more separate handlers for topic-root vs nested.
4. **Cut over (1 day)**: switch the dev VPS to native render, run sanity sweep + state-survives-collapse, verify pixel-by-pixel match with rizzoma.com.
5. **Delete React-portal + InlineHtmlRenderer + inlineMarkers + BlipThreadNode** in a final cleanup commit.

Realistic estimate: **2-3 weeks** of focused work for a clean replacement. Versus the steady drip we've had for months.

---

## TL;DR

Original Rizzoma's fractal nesting works because **content is a flat typed-array, BLIP elements sit between LINE elements at array indices, and the renderer is one linear walk that recursively renders child blips into wrapping spans inside the parent's contentEditable DOM**.

Our React/TipTap hybrid keeps cracking because we've layered seven indirection levels (HTML strings + numeric offsets + portal anchors + React state + TipTap NodeViews + per-component create-handlers + …) on top of that single elegant idea.

The honest answer to "why don't we just replicate and modernize the original CS in TS?" is: **we should, and I've been wrong to keep patching seams instead.**
