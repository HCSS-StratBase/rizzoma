# Claude Session Context (2026-02-08)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Latest Session (2026-02-08) — BLB Full Implementation (D+ → A)

### What Was Implemented

**Core BLB inline expansion** — the single most important fix in the codebase:

1. **[+] click = inline expansion, NOT navigation** (Phase 1 complete)
   - `BlipThreadNode.tsx`: dispatches `rizzoma:toggle-inline-blip` custom event instead of `window.location.hash` navigation
   - `RizzomaBlip.tsx`: listens for event + handles view-mode clicks on `.blip-thread-marker`, toggles `localExpandedInline` state
   - Marker changes from `+` to `−` when expanded, back when collapsed

2. **Portal-based positioning** — expanded child appears at marker position, not bottom of content
   - `inlineMarkers.ts`: injects `.inline-child-portal` divs inside the `<li>` after expanded markers
   - `RizzomaBlip.tsx`: uses `useLayoutEffect` + `createPortal` to render expanded `<RizzomaBlip>` into portal containers
   - Two-pass render: first pass sets innerHTML (creates portals), `useLayoutEffect` finds them, `setPortalTick` triggers synchronous re-render, `createPortal` renders children — all before browser paint

3. **Inline child display** — clean, minimal rendering
   - `isInlineChild` prop hides toolbar and expander for inline-expanded children
   - CSS: `.inline-child-expanded` has left border, indent, subtle background
   - `.inline-child-portal` container has `display: block; list-style: none`

4. **Orphaned marker handling**
   - Markers referencing children from other waves/topics get `orphaned` class
   - CSS: `display: none` — completely hidden to avoid confusion

5. **Data flow fix** — `RizzomaTopicDetail.tsx` line 894
   - Bug: `childBlips: listBlips` excluded inline children
   - Fix: `childBlips: [...listBlips, ...inlineRootBlips]`
   - Marker injection moved from TopicDetail to RizzomaBlip (needs expanded state)

6. **Service Worker dev bypass**
   - `useServiceWorker.ts`: `import.meta.env['DEV']` check skips SW registration during dev

7. **Insert shortcuts visible in edit mode only + suggestion dropdowns working** (fixed 2026-02-08)
   - `RightToolsPanel.tsx`: insert buttons wrapped in `{isEditMode && ...}` conditional; `onMouseDown={e => e.preventDefault()}` prevents focus stealing
   - `RizzomaTopicDetail.tsx`: dispatches `EDIT_MODE_EVENT` when `isEditingTopic` changes + handles insert events with `topicEditor`
   - `RizzomaBlip.tsx` + `RizzomaTopicDetail.tsx`: insert handlers use `document.execCommand('insertText')` with smart space prefix to trigger TipTap suggestion popups
   - Insert buttons (↵, @, ~, #, Gadgets) hidden in view mode, shown when editing
   - Clicking @, ~, # now properly triggers mention/task/tag suggestion dropdowns

### All 5 Plan Phases — COMPLETE

| Phase | What | Status |
|-------|------|--------|
| 1 | Core Inline Expansion ([+] = expand, not navigate) | DONE |
| 2 | [+] Marker Styling Unification (gray #b3b3b3) | DONE |
| 3 | Turquoise Button Styling (insert shortcuts, light blue) | DONE |
| 4 | Widget Styling (@mention, ~task, #tag) | DONE |
| 5 | Toolbar & Polish (declutter, dynamic badge) | DONE |

### Files Modified (This Session)

| File | Change |
|------|--------|
| `src/client/components/blip/RizzomaBlip.tsx` | `createPortal` + `useLayoutEffect` for inline children, `isInlineChild` prop |
| `src/client/components/blip/inlineMarkers.ts` | Portal container injection, orphaned marker detection, expanded state sync |
| `src/client/components/blip/RizzomaBlip.css` | `.inline-child-expanded`, `.inline-child-portal`, `.orphaned` styles |
| `src/client/components/RizzomaTopicDetail.tsx` | `childBlips` includes inline children, marker injection removed |
| `src/client/hooks/useServiceWorker.ts` | Dev mode SW skip |
| `src/client/components/RightToolsPanel.tsx` | Insert shortcuts always visible (removed edit-mode gate) |

### Architecture: BLB Inline Expansion Flow

```
[+] click in view mode
  → handleViewContentClick() finds .blip-thread-marker
  → toggleInlineChild(threadId) updates localExpandedInline Set
  → viewContentHtml recalculated via injectInlineMarkers()
  → inlineMarkers.ts: marker gets 'expanded' class, text changes to '−'
  → inlineMarkers.ts: .inline-child-portal div injected inside <li>
  → dangerouslySetInnerHTML renders new HTML (with portal containers)
  → useLayoutEffect finds .inline-child-portal elements in contentRef
  → setPortalTick triggers synchronous re-render (before paint)
  → createPortal renders <RizzomaBlip isInlineChild={true}> into each portal
  → Browser paints: child appears directly below the [+] line
```

### Screenshot Naming Convention (MANDATORY)

**Format**: `<functionality>_<new|old>-YYMMDD-hhmm.png`

- Datetime is a **SUFFIX**, NOT a prefix
- `_new` = our local implementation; `_old` = original rizzoma.com reference
- Only use `_old` when redoing a reference screenshot; primarily reuse existing ones
- Examples: `blb-inline-expanded_new-260208-0155.png`, `blb-hcss-layout_old-260208-0206.png`
- All screenshots go in `screenshots/` or `screenshots/side-by-side/`

### Key Screenshots (This Session)

| File | What |
|------|------|
| `screenshots/blb-view-with-shortcuts_new-260208-0310.png` | View mode with insert shortcuts visible in right panel |
| `screenshots/blb-inline-expanded-full_new-260208-0312.png` | [+] expanded inline — full layout with shortcuts |
| `screenshots/blb-full-layout_old-260208-0314.png` | Original Rizzoma reference — full layout |
| `screenshots/blb-portal-inline-expanded_new-260208-0155.png` | Earlier: portal positioning working |
| `screenshots/blb-edit-mode_new-260208-0157.png` | Edit mode with TipTap editor |

### Continuation Fixes (same session, later)

8. **Inline child editing enabled** (two fixes):
   - `RizzomaBlip.tsx`: removed `!isInlineChild` guard that hid BlipMenu (Edit button) for inline children
   - `topics.ts`: removed `authorId !== userId` permission check — collaborative editing model matches original Rizzoma

9. **`/read` endpoint URL fix** (`RizzomaTopicDetail.tsx:662`)
   - Was: `/api/blips/${blipId}/read` → 404
   - Fixed: `/api/waves/${id}/blips/${blipId}/read` (matches server route)
   - Added `[id]` to useCallback dependency array

10. **`/participants` endpoint added** (`waves.ts`)
    - New GET `/api/waves/:id/participants` — queries CouchDB for `WaveParticipant` docs
    - Returns `{ participants: [{ id, userId, email, role, status }] }`

11. **Ctrl+Enter expands inline instead of navigating** (`RizzomaTopicDetail.tsx:547-552`)
    - Was: `window.location.hash = '#/topic/${id}/${blipPathSegment}/'` → navigated away
    - Fixed: `load(true)` + `setTimeout` dispatching `rizzoma:toggle-inline-blip` event after 500ms
    - New [+] marker appears at cursor position, expands inline after clicking Done

12. **Topic PATCH permission fix** (`topics.ts:431`)
    - Removed `existing.authorId !== userId` → 403 check
    - All authenticated users can edit topics (collaborative editing)

13. **Portal rendering after mode switch** (`RizzomaBlip.tsx:502`)
    - Added `!!contentOverride` to `useLayoutEffect` dependency array
    - Fixes: Ctrl+Enter → new [+] → Done → portal was empty because `viewContentHtml` didn't change

### Additional Files Modified

| File | Change |
|------|--------|
| `src/client/components/blip/RizzomaBlip.tsx` | Edit button visible for inline children, `!!contentOverride` in useLayoutEffect deps |
| `src/client/components/RizzomaTopicDetail.tsx` | `/read` URL fix, Ctrl+Enter inline expansion, `[id]` dependency |
| `src/server/routes/waves.ts` | `/participants` endpoint, `WaveParticipant` import |
| `src/server/routes/topics.ts` | Removed author-only PATCH permission |

### Additional Screenshots

| File | What |
|------|------|
| `screenshots/blb-ctrl-enter-expanded_new-260208-0347.png` | Ctrl+Enter: two inline children expanded with toolbars |

### Toolbar Visibility Fix (2026-02-08, later session)

14. **Inline child toolbar showing immediately on [+] expand** — ROOT CAUSE: `useEffect` at line 1544
    - Bug: `useEffect(() => setIsActive(effectiveExpanded || isEditing), [effectiveExpanded, isEditing])` ran on mount for inline children. Since `effectiveExpanded = true` (children render expanded), this overrode `useState(false)` → toolbar immediately visible
    - Fix: Guard with `if (isInlineChild)` — only auto-activate on `isEditing`, not `effectiveExpanded`
    ```tsx
    useEffect(() => {
      if (isInlineChild) {
        if (isEditing) setIsActive(true);
      } else {
        setIsActive(effectiveExpanded || isEditing);
      }
    }, [effectiveExpanded, isEditing, isInlineChild]);
    ```

15. **CSS cascade from parent `.active` to child toolbar through portal DOM**
    - Bug: Parent's `.blip-container.active .blip-menu-container { opacity: 1 }` matched child's toolbar since portals render inside parent's DOM tree
    - Fix: CSS override in BlipMenu.css:
    ```css
    .inline-child-expanded .blip-container:not(.active) .blip-menu-container {
      opacity: 0 !important;
      pointer-events: none;
    }
    ```
    - Also: BlipMenu returns `null` when `!isActive` (line 166), making this a belt-and-suspenders fix

16. **Edit mode toolbar overlapping blip content**
    - Bug: `position: absolute; left: 0; right: 0;` on `.blip-menu-container` overlaid the text
    - Fix: `.inline-child-expanded .blip-menu-container { position: relative !important; left: 0 !important; }`

17. **Inline child toolbars enriched** — removed special-case minimal toolbars
    - Was: inline children got only "Edit | Hide" (read mode) or "Done | B/I/U" (edit mode)
    - Now: same full toolbars as regular blips, with "Hide" instead of "Collapse" and no "Expand" button
    - `inline-child-menu` CSS class adds `flex-wrap: wrap` for compact layout

18. **Click-outside handler hides inline child toolbar**
    - Added `document.addEventListener('mousedown', ...)` that checks `blipContainerRef.current.contains(e.target)`
    - Deactivates toolbar when clicking outside the inline child
    - Only applies when `isInlineChild && isActive && !isEditing`

19. **Toolbar left-alignment fix for nested inline children**
    - Bug: `.nested-blip .blip-menu-container { left: 32px }` had same specificity as the inline override and came later in CSS → won
    - Fix: `!important` on the inline child `left: 0` rule

**Three-state toolbar behavior (matching original Rizzoma):**

| State | Trigger | What Shows |
|-------|---------|------------|
| 1 | Click [+] to expand | Just text content — NO toolbar |
| 2 | Click into child blip | Read toolbar (Edit, Hide, Link, Gear, etc.) |
| 3 | Click Edit | Edit toolbar (Done, formatting) — content fully visible below |
| 4 | Click outside child | Toolbar hides, back to just text |

20. **Enhanced code block gadget** (2026-02-08)
    - Replaced bare `toggleCodeBlock()` with `@tiptap/extension-code-block-lowlight@2.27.2` + `lowlight@3`
    - React NodeView (`CodeBlockView.tsx`) with language selector (30 languages) and Copy button
    - GitHub-style syntax highlighting theme (`CodeBlockView.css`)
    - `EditorConfig.tsx`: `StarterKit.configure({ codeBlock: false })` + `CodeBlockLowlight.extend({ addNodeView() { return ReactNodeViewRenderer(CodeBlockView) } })`
    - Type augmentation for `@tiptap/react` NodeView exports (`tiptap-react-nodeview.d.ts`)

21. **Insert buttons auto-enter-edit-mode** (2026-02-08)
    - Bug: Insert buttons (↵, @, ~, #, Gadgets) only worked when already in edit mode — event listeners only registered when `isEditing`
    - Fix: Listen when `isActive` (not just `isEditing`); queue pending insert via `pendingInsertRef` + call `handleStartEdit()`; consumer `useEffect` fires insert on `requestAnimationFrame` when `inlineEditor` becomes ready
    - Added `BLIP_ACTIVE_EVENT` dispatched from `RizzomaBlip.tsx` when `isActive && canEdit` — `RightToolsPanel.tsx` shows insert buttons when `isEditMode || isBlipActiveEditable`
    - Buttons now visible in right panel when any editable blip is active (not just when editing)

### Additional Files Modified (Items 20-21)

| File | Change |
|------|--------|
| `src/client/components/editor/extensions/CodeBlockView.tsx` | NEW: React NodeView for enhanced code block |
| `src/client/components/editor/extensions/CodeBlockView.css` | NEW: GitHub-style syntax highlighting theme |
| `src/client/types/tiptap-react-nodeview.d.ts` | NEW: Type augmentation for @tiptap/react |
| `src/client/components/editor/EditorConfig.tsx` | Disabled StarterKit codeBlock, added CodeBlockLowlight |
| `src/client/components/blip/RizzomaBlip.tsx` | `pendingInsertRef`, `BLIP_ACTIVE_EVENT` dispatch, insert useEffect refactor |
| `src/client/components/RightToolsPanel.tsx` | `BLIP_ACTIVE_EVENT` listener, buttons visible when blip active+editable |
| `package.json` | Added `@tiptap/extension-code-block-lowlight@2.27.2`, `lowlight@3` |

### Current Grade: A

**What works (parity with original Rizzoma)**:
- [+] click expands inline child at correct position (portal-based)
- [−] click collapses back
- Orphaned markers hidden (`display: none`)
- [+] marker styling: gray #b3b3b3, 16x14px, white text, 3px border-radius
- Insert shortcuts (↵, @, ~, #, Gadgets) visible when blip is active+editable
- **Insert buttons auto-enter edit mode** — click @ when not editing → auto-edits + inserts
- @mention: turquoise pill with pipe delimiters `|@Name|`
- ~task: turquoise pill with checkbox `|☐ Name DD Mon|`
- #tag: plain turquoise text, no background
- Gadget palette: 11 types in grid layout
- **Enhanced code block**: 30-language syntax highlighting, language selector, Copy button
- Toolbar decluttered: Hide/Delete moved to gear overflow menu
- Dynamic badge count (not hardcoded)
- Edit mode activates TipTap with markers
- Auth-gated APIs work when logged in
- "Write a reply..." visible
- Three-panel layout matches original
- Fold/Unfold (▲/▼) buttons in right panel
- **Ctrl+Enter creates inline child at cursor position, expands inline (no navigation)**
- **Inline children can be edited (Edit button visible, canEdit permission fixed)**
- **Content persists to CouchDB (survives page reload)**
- **Portal rendering works after edit→view mode switch**
- **/participants and /read API endpoints working**
- **Three-state toolbar: [+] expand = no toolbar, click = read toolbar, Edit = full toolbar**
- **Click outside inline child hides toolbar**
- **Inline children get full toolbars (not minimal), in-flow positioning (no overlap)**

**Remaining polish (A → A+)**:
- Nested inline expansion ([+] within expanded [+]) — needs testing
- Richer test data for mid-sentence [+] markers, widget rendering, gadgets
- Edge case: multiple rapid Ctrl+Enter may need debouncing

---

## Previous Sessions

### 2026-01-20 — OAuth & Avatar Updates
- Microsoft OAuth, SAML 2.0 authentication
- User avatar from OAuth providers
- Rizzoma layout as default

### 2026-01-20 — Ctrl+Enter Fix Attempt
- Created BlipKeyboardShortcuts.ts TipTap extension
- Tab/Shift+Tab work, Ctrl+Enter partially works

### 2026-01-19 — BLB Audit & Fix
- Wired Fold button in RizzomaTopicDetail
- Persistence to localStorage + server
- Removed duplicate toolbar buttons

### 2026-01-18 — Major Upgrades & Cleanup
- Express 4→5, Redis 4→5, Vite 5→7, Vitest 1→4
- AWS SDK v3 migration, 480 files legacy cleanup
- Mobile PWA infrastructure

---

## Run/Verify

```bash
# Start infra (Docker Desktop must be running)
docker compose up -d couchdb redis

# IMPORTANT: Stop the Docker rizzoma-app container if running (conflicts with local dev ports)
docker stop rizzoma-app

# Run app
FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev

# Login (session lost on server restart — MemoryStore)
# POST /api/auth/login { email: "test3@test.com", password: "password123" }

# Tests
npm run test
npm run test:toolbar-inline
npm run test:follow-green
```

## WSL2 + Vite Gotchas

- **HMR DOES NOT work for .tsx/.ts changes** — MUST kill and restart Vite
- **ZOMBIE PROCESSES**: `ps -ef | grep vite` + `kill -9` each PID. `pkill -f` misses some
- **Always verify port**: `ss -tlnp | grep 300` — Vite configured port is 3000
- **Docker rizzoma-app conflicts**: if running, it takes ports 3000+8000
- **SW caches in dev**: bypassed via `import.meta.env['DEV']` check
- **Server startup is slow** (~15-25s for both ports)

## Key Files

| File | Purpose |
|------|---------|
| `src/client/components/blip/RizzomaBlip.tsx` | Main blip component — inline expansion, portal rendering |
| `src/client/components/blip/inlineMarkers.ts` | [+] marker injection, portal containers, orphan detection |
| `src/client/components/blip/RizzomaBlip.css` | Blip styling including inline-child-expanded |
| `src/client/components/RizzomaTopicDetail.tsx` | Topic detail — data flow, childBlips construction |
| `src/client/components/editor/extensions/BlipThreadNode.tsx` | TipTap extension for [+] markers in edit mode |
| `src/client/components/blip/collapsePreferences.ts` | localStorage fold state persistence |
| `docs/BLB_LOGIC_AND_PHILOSOPHY.md` | BLB methodology documentation |
| `screenshots/side-by-side/COMPARISON-REPORT.md` | Side-by-side analysis with original Rizzoma |

---
*Updated: 2026-02-08 — enhanced code block gadget + insert buttons auto-enter-edit-mode*
