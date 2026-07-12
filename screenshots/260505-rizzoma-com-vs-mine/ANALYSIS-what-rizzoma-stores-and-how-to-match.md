# What rizzoma.com actually stores for a depth-10 BLB tree, and how we should match it

Captured 2026-05-05 from rizzoma.com Try topic at depth 10. The full rendered HTML is 26,382 chars; the structural pattern is ~5 lines and repeats identically at every level. Annotated structure in `depth10-rizzoma-com-rendered.html`.

## The structural pattern

```html
<!-- ONE recursive cell, repeats at every level: -->
<ul class="js-editor editor" contenteditable="false">         ← editor at level N
  <li class="bulleted bulleted-type0" style="margin-left:22px">  ← bullet (one per label)
    <span>Label text</span>                                    ← the label
    <span class="blip-thread">                                ← INLINE-CHILD slot
      <div class="fold-button-container">                     ← [+]/[-] toggle
        <span class="js-fold-button">[+]</span>
      </div>
      <div class="js-blips-container">
        <span class="default-text blip-container">            ← child blip (same component!)
          <div class="js-blip-info-container">                ← compact avatar+date (~30px)
            <span class="contributor avatar"></span>
            <div class="edit-date">12:19 AM</div>
          </div>
          <div class="js-editor-container">
            <ul class="js-editor editor">                     ← editor at level N+1
              ...recursive: same pattern, repeating
            </ul>
          </div>
          <div class="js-bottom-blip-menu">                   ← only when this blip is editing
            <button class="js-finish-edit">Done</button>
            <button class="js-blip-reply-button">Write a reply...</button>
          </div>
        </span>
      </div>
    </span>
  </li>
</ul>
```

That's it. The whole depth-10 fractal is ten copies of that cell, each nested INSIDE the previous one's `.js-blips-container`. **The DOM tree IS the blip tree, 1:1.**

## a) What's wrong with our current approach

### A1. We use React.createPortal — Rizzoma uses inline DOM nesting

**Rizzoma**: `<li>` contains `<span class="blip-thread">` which contains the child blip directly. The child blip's UL is INSIDE the parent's LI, in the natural DOM flow.

**Ours** (`RizzomaBlip.tsx:2057-2086`): the parent renders `<div class="blip-text" dangerouslySetInnerHTML={...}>` with `<div class="inline-child-portal" data-portal-child="X">` placeholders, and React `createPortal`s the `<RizzomaBlip blip={X}>` component INTO those placeholders at runtime.

Why it matters:
- Portal teleports the React tree into a DOM slot; CSS scoping flows through React parents but DOM rendering happens at the slot. This creates a "this is a separate widget" visual contract.
- Inherent overhead: portal lookups via `useLayoutEffect` scanning anchors, render-tick updates, mount/unmount choreography.
- Edit-mode/view-mode split (now unified in #47, but still uses portal).

**Mismatch**: Rizzoma's render is structural ("the child IS part of the parent's body"); ours is compositional ("the child is a popup teleported into a slot in the parent's body").

### A2. We render each blip as a fully-fledged React component (~80px chrome)

**Rizzoma**: a child blip is just `<span class="default-text blip-container">` with a tight info-row (avatar 24×24 + 8-char timestamp + nothing else, ~24px tall). The "Write a reply..." button only renders when the blip is currently being edited (in `js-bottom-blip-menu`).

**Ours** (`RizzomaBlip.tsx:1905-2098`): every `<RizzomaBlip>` renders a `BlipMenu` toolbar, a `BlipContributorsStack`, a `blip-author-date` row, and an inline-comment overlay area. Each blip wrapper has a `min-height: 24px` rule plus the toolbar adds ~30px plus the `Write a reply...` form is always reserved space. Cumulative: ~80px per blip.

Why it matters: at depth 10, original Rizzoma packs 10 levels in ~440px. Ours would need ~800px of vertical for the same structure. Information density is the whole point of BLB.

**Mismatch**: we render persistent affordances (toolbar, reply input, author/date row) at every level always; original renders them lazily and minimally.

### A3. Our list rendering uses `<ul>/<li>` cascade with browser bullets

**Rizzoma**: each `<li>` has class `bulleted bulleted-type0` with `style="margin-left: 22px"`. Same disc bullet glyph at every depth. Indentation is from margin-left, NOT from the `<ul>` container's `padding-left`.

**Ours** (`RizzomaBlip.css` view-mode rules): use browser `list-style-type` cascade — disc → circle → square per nesting level. Indent is from `<ul>`'s `padding-left: 1.5em`.

Why it matters: at depth 10, browser `list-style-type` runs out (square is the deepest standard glyph; level 4+ falls back to disc). Rizzoma's `bulleted-type0` works at any depth.

**Mismatch**: cosmetic but visible — at depth 10 our bullets become inconsistent; Rizzoma's stay disc forever.

### A4. We use TipTap (modern rich-text editor) — Rizzoma uses a custom legacy editor with `contenteditable="false"` + hidden input

**Rizzoma**: the visible `.js-editor` UL has `contenteditable="false"`, but a hidden offscreen `<div contenteditable="true">` (~2×17px at -10000,-10000) collects keystrokes. Their JS routes input events to mutate the visible UL. Browsers see this as ONE editor with 10 nested `<ul>`s, but each nested UL has its own keyboard handler scope.

**Ours**: each `<RizzomaBlip>` has its own TipTap editor instance with its own ProseMirror document. Nested edit-mode means N independent ProseMirror editors, each with its own state, each potentially with a Y.js collaboration provider.

Why it matters: Rizzoma's depth-10 has ONE keyboard event loop and ONE selection state to manage. Ours has 10 separate ProseMirror instances, each with its own focus/blur/save lifecycle. Hence the cascade-Done bug (#47), the seeding race bug (CLAUDE.md memory M5), and various focus-management workarounds.

**Mismatch**: rendering complexity scales linearly per editor instance; original scales O(1) per editor with content scaling.

### A5. Our save format is per-blip JSON; Rizzoma's looks like one document with embedded threads

**Rizzoma**: based on the rendered DOM, the save format appears to be the single root blip's HTML with `<span class="blip-thread">` markers EMBEDDING child blip references. Blips are addressable by ID but the rendering walks the recursive HTML.

**Ours**: each blip is a separate document in CouchDB with `parentId` + `anchorPosition`. The renderer fetches the blip tree separately and stitches via portals at render time.

Why it matters: rizzoma.com fetches one wave snapshot and renders top-down; ours has to assemble the tree from N+1 documents, then walk inlineChildren arrays per parent to figure out which goes where. More fetches, more state, more places for things to drift.

**Mismatch**: their storage matches their rendering (recursive HTML); ours splits storage from rendering, then has to reconcile.

## b) How to make it the same with our new stack

Three approaches, ordered by cost:

### B1. Re-skin only — match the visual without changing architecture (low effort, high payoff)

Don't restructure the React tree. Just make our render LOOK like Rizzoma's via CSS + small render trims.

Concrete diffs:

```css
/* RizzomaBlip.css — match Rizzoma's visual density */

.inline-child-expanded {
  /* Was: solid lavender background + rounded border + 8-12px padding */
  background: transparent !important;
  border: none !important;
  border-left: 1px solid #e0e0e0 !important;  /* thin guide line, not card panel */
  padding: 0 0 0 8px !important;
  margin: 0 !important;
}

.blip-text ul,
.blip-text li {
  /* Match Rizzoma's bulleted-type0 + margin-left:22px */
  list-style-type: disc !important;  /* disc at every level */
  margin-left: 22px !important;
  padding-left: 0 !important;
}
.blip-text ul ul,
.blip-text ul ul ul,
.blip-text ul ul ul ul {
  list-style-type: disc !important;  /* override the browser cascade */
}

/* Per-blip chrome — collapse from ~80px to ~24px */
.blip-author-date {
  /* Single line, smaller font, near-zero margin */
  font-size: 11px !important;
  line-height: 16px !important;
  margin: 0 !important;
}
.blip-contributors-info {
  /* Avatars 16×16 not 40×40 */
  --avatar-size: 16px;
}
.blip-reply-form,
.blip-reply-button {
  /* Hidden until user clicks into the blip; show via .active class */
  display: none;
}
.blip-container.active.edit-mode .blip-reply-button {
  display: flex;  /* show only when this specific blip is editing */
}

/* [+] marker → chat-bubble glyph */
.blip-thread-marker::before {
  content: "💬";  /* or the 16x16 sprite per CLAUDE.md memory */
  font-size: 12px;
}
.blip-thread-marker {
  background: transparent;  /* drop the gray pill */
  color: #666;
}

/* Date display — show full minute precision */
.blip-author-date {
  /* date format change is in the React component, not CSS */
}
```

```tsx
// RizzomaBlip.tsx — collapse author-date to single line
- <span className="blip-author-date">
-   {new Date(blip.updatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
- </span>
+ <span className="blip-author-date" title={new Date(blip.updatedAt).toLocaleString()}>
+   {new Date(blip.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
+ </span>
```

**Estimated effort**: 2-4 hours, mostly CSS + 1-2 React tweaks.
**Result**: closes ~70% of the visual gap. Card-stack look → guide-line look. Per-blip chrome ~80px → ~30px. Bullets become consistent. Date becomes useful.

### B2. Restructure inline-child rendering to match Rizzoma's nested-LI approach (medium effort, high payoff)

Replace React.createPortal with direct nested rendering: when a blip has expanded inline children, render them INSIDE its `<li>` (not via portal teleport).

Concrete approach:

```tsx
// RizzomaBlip.tsx — new render path for blips with expanded inline children
const renderInlineExpansion = (markerId: string) => {
  const child = inlineChildren.find(c => c.id === markerId);
  if (!child || !localExpandedInline.has(markerId)) return null;
  return (
    <span className="blip-thread-expanded">
      <RizzomaBlip
        blip={{ ...child, isCollapsed: false }}
        isInlineChild={true}
        depth={depth + 1}
        // ... same props
      />
    </span>
  );
};

// In the render:
// Instead of:
//   <div dangerouslySetInnerHTML={{ __html: viewContentHtml }} />
//   {portalRenders}
// Do:
//   <div>
//     {parseAndRenderContentWithInlineChildren(blip.content, inlineChildren, localExpandedInline)}
//   </div>
//
// Where the parser walks the saved HTML, replaces each <span class="blip-thread-marker" data-blip-thread="X">
// with either just the marker (if collapsed) or the marker + nested <RizzomaBlip child={X}> (if expanded).
```

This eliminates `createPortal` entirely. The DOM tree matches Rizzoma's verbatim.

Side benefits:
- React DevTools shows the actual blip tree (currently it shows one flat top-level blip with portal teleports).
- React reconciliation works naturally for tree edits (currently we manually scan portal anchors via useLayoutEffect).
- `useLayoutEffect` portal-anchor scanning code can be deleted entirely.
- CSS scoping becomes intuitive (descendant selectors work as expected).

**Estimated effort**: 1-2 days. Mostly rewriting the view-mode render branch in RizzomaBlip.tsx (~50 lines) + deleting injectInlineMarkers + the portal scan useLayoutEffect.
**Result**: closes the remaining 30% structural gap. Edit-mode behavior simplifies too (no separate render paths).

### B3. Reskin the editor itself to match Rizzoma's single-DOM-tree approach (high effort, marginal payoff)

Replace TipTap's per-blip editor instances with ONE TipTap editor that holds the whole blip tree as nested NodeViews. Each blip becomes a TipTap NodeView; recursion via `<NodeViewContent>` containing nested blip nodes.

Concrete: define a `BlipNode` TipTap extension that:
- Renders as `<span class="default-text blip-container">` with NodeViewWrapper
- Has a child content area that's another ProseMirror editable region
- Recursive: a BlipNode can contain other BlipNodes

This matches Rizzoma's "one editor with 10 nested ULs" but stays modern (TipTap/ProseMirror underneath).

**Estimated effort**: 1-2 weeks. Major rewrite of editor wiring. Would also need to redesign the save format (maybe move to one-document-per-wave like Rizzoma has).
**Result**: solves the cascade-Done bug, seeding races, focus management forever. But also high risk and high regression surface.

**Don't recommend B3 right now** — too risky for marginal gain. B1+B2 together get us 95% of the way there in 1-2 days, vs B3's 1-2 weeks.

## Recommended path forward

1. **Land B1 (CSS reskin)** as a quick first PR — visible improvement, low risk, ~2-4 hours.
2. **Land B2 (inline render restructure)** as a second PR — closes the structural gap, ~1-2 days.
3. **Defer B3** indefinitely. Only revisit if cascade-Done / seeding-race bugs become user-visible blockers.
4. **Add a pixel-diff visual sweep gate** so future regressions on the visual axis (not just functional) are caught — currently `visual:coverage` only checks "does the screenshot exist", not "does it look right".

After B1+B2, the depth-10 sweep screenshot should be visually within ~10% of Rizzoma's. The remaining gap is the legacy editor's hand-tuned typography that we won't easily replicate.
