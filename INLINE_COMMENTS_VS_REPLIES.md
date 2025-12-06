# Understanding Rizzoma: Inline Comments vs Replies

## 1. REPLIES (What we have now)
- Appear UNDERNEATH the blip as separate blips
- Form a threaded conversation below the original content
- Example:
  ```
  [Original Blip]
  This is the main content of a blip.
  
  ↩ Reply
  
    [Reply 1]
    This is a reply to the whole blip
    
      [Nested Reply]
      This is a reply to Reply 1
    
    [Reply 2]
    Another reply to the main blip
  ```

## 2. INLINE COMMENTS (What we need)
- Attached to SPECIFIC TEXT within a blip
- Highlighted/underlined text shows there's a comment
- Comments appear in margin/sidebar or as popups
- Example:
  ```
  [Original Blip]
  This is the main content with [some highlighted text]¹ that has
  a comment attached to it.
  
  ¹ Comment: "This text needs clarification"
  ```

## Key Differences:
1. **Location**: Inline comments are ON the text, replies are BELOW the blip
2. **Scope**: Inline comments refer to specific text selections, replies refer to the whole blip
3. **Display**: Inline comments show as annotations on text, replies show as separate blips
4. **Interaction**: Click highlighted text to see inline comment, click Reply button to add reply

## Current Implementation Issues:
- The "Add inline comment" button creates a regular reply with quoted text
- No visual indication of which text has comments
- Comments don't stay attached to the selected text
- Missing the annotation/highlight system

## What Needs to be Fixed:
1. Store inline comments with text range/position data
2. Render highlights/underlines on commented text
3. Show comments in margin or popup when hovering/clicking
4. Keep inline comments separate from replies in the data model

## Current Progress
- ✅ View-mode selections now open a floating inline comment composer (`RizzomaBlip.tsx`) that persists range `{ start, end, text }` via `/api/comments`, replacing the old reply fallback.
- ✅ TipTap edit mode already renders inline decorations via `InlineComments.tsx`; highlights will appear wherever the editor mounts with `FEATURES.INLINE_COMMENTS`.
- ✅ Hovering or clicking highlighted ranges now reveals a pinned inline comment popover with grouped threads, underline styling, and real-time resolve controls.
- ✅ Inline comments are kept separate from replies with threaded inline replies, parent/root tracking, and resolve/reopen actions surfaced directly in the inline comments popover.
- ✅ Per-blip inline comment visibility is persisted per user on the server with localStorage + storage-event sync for offline usage, and preferences are hydrated on load without clobbering local choices.
- ✅ Navigation surface with resolved/open filters and Alt+Arrow shortcuts jumps between inline anchors without dropping selection context.
- ✅ Decorations stay attached across multi-block selections and reflow/resizing with degraded-state banners when the comments API is unreachable or unauthenticated.

## Degraded-state UI surfaces
- **Inline toolbar banner** (`src/client/components/blip/BlipMenu.tsx`). Whenever `InlineComments` reports `canComment: false` or a load error string, the toolbar mirrors that status with the same red `blip-menu-banner` used for read-only sessions. This keeps degraded states visible without opening the popover. `src/tests/client.BlipMenu.test.tsx` covers the edit/read surfaces and ensures the banner toggles with commenting permissions and failure callbacks.
- **Popover banner + retry** (`src/client/components/editor/InlineComments.tsx`). The popover renders a persistent banner with contextual messaging (`read-only`, `unauthorized`, `network`) plus a Retry control when fetches fail. The keyboard navigation chips remain usable so degraded states do not trap focus. See `src/tests/client.inlineCommentsPopover.test.tsx` for coverage of read-only banners and retry success paths.
- **Status propagation**. `InlineComments` emits `onStatusChange` events which `RizzomaBlip.tsx` forwards into BlipMenu via the `inlineCommentsNotice` prop. This ensures inline toolbar banners, popover states, and Alt+Arrow navigation stay synchronized even when degraded states occur off-screen.

## File Creation & Editing Map

- `src/client/components/editor/InlineComments.tsx` — renders inline decorations + popover threads, orchestrates hover/pinned states, Alt+Arrow navigation, resolve/reopen actions, and degraded banners.
- `src/client/components/editor/InlineComments.css` — popover/anchor styling, hover affordances, and accessibility states aligned with restored toolbar.
- `src/client/components/editor/inlineCommentDecorations.ts` — TipTap decoration helper that keeps comment ranges attached while editing.
- `src/client/components/editor/inlineCommentsVisibility.ts` — shared helper used by BlipMenu + InlineComments to persist visibility across tabs with storage events.
- `src/server/routes/inlineComments.ts` — CRUD + resolve endpoints backed by CouchDB; emits socket events so other clients refresh threads.
- `src/tests/client.inlineCommentAnchoring.test.ts`, `client.inlineCommentsPopover.test.tsx`, `client.inlineCommentsVisibilityShortcuts.test.ts`, and `client.inlineCommentsVisibilityStorage.test.ts` — Vitest coverage for anchoring, popover interactions, keyboard shortcuts, and persistence.
- `src/tests/routes.comments.inline.test.ts` — exercises the API surface (create/list/resolve) with mocked CouchDB failures.

## File Creation & Editing Steps

1. **Schema + API**. Define any new inline comment payload fields in `src/shared/types/comments.ts` and `src/server/schemas/wave.ts`, then update `src/server/routes/inlineComments.ts` to validate input, persist to CouchDB, and emit socket events so other clients refresh threads.
2. **Client storage helpers**. Adjust `src/client/components/editor/inlineCommentDecorations.ts` for new anchor metadata and keep selection tracking resilient. Visibility or preference logic should live in `inlineCommentsVisibility.ts` so BlipMenu + InlineComments stay synchronized across tabs/storage events.
3. **UI surfaces**. Update `InlineComments.tsx` + `InlineComments.css` to render new states (resolved badges, degraded banners, navigation chips). For actions originating from the inline toolbar, coordinate with `src/client/components/blip/BlipMenu.tsx` so quick toggles and shortcuts remain aligned.
4. **Tests**. Extend the Vitest suites listed above plus any API coverage (`src/tests/routes.comments.inline.test.ts`). Snapshot real-world anchor payloads and assert storage-event sync, keyboard shortcuts, and optimistic resolve flows behave.
5. **Docs**. Reflect feature deltas here, in `docs/EDITOR_TOOLBAR_PARITY.md`, and in `RESTORE_POINT.md` whenever you introduce gating flags, additional commands, or follow-up verification work (browser smoke, manual QA, etc.).

### Editing Workflow Notes

1. Toggle inline comments via BlipMenu or Ctrl+Shift+Up/Down; `inlineCommentsVisibility.ts` broadcasts changes so editor + menu stay in sync.
2. Hover/click highlights to open the popover. Resolving a comment issues `PATCH /api/comments/:id/resolve` and optimistic UI applies resolved state until server confirms.
3. Selection decorator refresh is debounced in `inlineCommentDecorations.ts` to avoid flicker during rapid edits; tests guard that multi-block ranges stay highlighted.
4. Popover navigation uses Alt+Arrow; tests ensure focus/selection follow anchors without losing editing context.
