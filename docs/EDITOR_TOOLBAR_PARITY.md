# Toolbar Parity Tracker

This document keeps tabs on how closely the modern TipTap/Yjs toolbars match the original Rizzoma CoffeeScript toolbar (`original-rizzoma/src/client/blip/menu/template.coffee`).

## Legacy Toolbar (CoffeeScript)

### Read-only block
- Switch to edit mode (`js-change-mode`, Ctrl+E)
- Hide/Show inline comments (Ctrl+Shift+Up / Ctrl+Shift+Down)
- Copy direct blip link (button + popup input)
- Collapse thread by default toggle (`js-is-folded-by-default`)
- Delete blip/comment
- Overflow menu (`Other` gear)
  - Copy comment
  - Paste as reply
  - Paste at cursor
  - Copy link (duplicate access)
  - Playback blip history

### Edit block
- Done / switch back to read mode (Ctrl+E / Shift+Enter)
- Undo / Redo
- Insert link (Ctrl+L)
- Insert attachment / file upload
- Insert image
- Bold / Italic / Underline / Strikethrough
- Text background color picker (7 swatches)
- Clear formatting
- Bulleted & numbered lists
- Collapse thread toggle
- Delete blip/comment
- Overflow (`Other` gear)
  - Copy comment
  - Paste as reply
  - Paste at cursor
  - Send message (submit reply)
  - Playback
  - Copy link
  - Hidden fallbacks for every toolbar control (mobile / overflow)

## Modern TipTap Toolbars

### Global editor toolbar (`src/client/components/editor/EditorToolbar.tsx`)
- Bold / Italic / Strike / Code / Underline
- Font size preset dropdown (Paragraph, Headings 1–3) + Format block dropdown (blockquote, code block)
- Highlight toggle + background color palette (`DEFAULT_BG_COLORS`)
- Text color palette picker
- Bullet / Ordered / Task lists + indent / outdent controls
- Link add / remove, horizontal rule
- Mention prompt, emoji picker
- Undo / Redo, clear formatting
- Gadget menu (image by URL, attachment placeholder, chart, poll, LaTeX), manual copy button

### Inline blip menu (`src/client/components/blip/BlipMenu.tsx`)
- Edit / Done toggles (per blip)
- Undo / Redo, Bold / Italic / Underline / Strikethrough
- Bullet / Numbered list toggles
- Clear formatting, background color palette
- Link / Attachment / Image placeholders
- Hide/Show inline comments (per blip, persisted server-side with localStorage fallback; Ctrl+Shift+Up/Down shortcuts)
- Collapse-by-default toggle (edit + read-only states; persists per user)
- Read-only actions: Edit, Hide/Show comments (wired), Collapse toggle, Get link (wired), Delete (no-op), gear placeholder

## Gap Analysis / TODO
- [x] Wire read-only Hide/Show comments controls to the inline comments plugin (per blip, stored per user). The BlipMenu hide/show button now toggles inline comments visibility for the active blip and persists the preference in `localStorage`, and both the TipTap `BlipEditor` surface and inline menu stay in sync.
- [x] Restore "Collapse this thread by default" toggle (persisted preference in Couch + localStorage fallback)
- [x] Implement Copy Comment / Paste as reply / Paste at cursor actions (per-blip clipboard store + overflow menu; copy pulls current markup/text, paste-as-reply hydrates the reply composer, paste-at-cursor inserts html through TipTap)
- [x] Bring back Playback (blip history fetcher + modal viewer)
- [x] Hook attachment button to real upload flow (backend endpoint + file picker + placeholder rendering)
- [x] Replace placeholder gadget chart/poll buttons with working TipTap custom nodes (reuse legacy gadget model)
- [x] Implement Send action in edit overflow (calls existing reply submit pipeline)
- [x] Add Delete blip API + hook BlipMenu delete button
- [x] Implement Get Direct Link button (copy + toast)
- [x] Surface inline color picker UI in BlipMenu (mirrors global toolbar)
- [x] Support comment visibility toggle shortcuts (Ctrl+Shift+Up/Down) via keymap
- [x] Consolidate legacy inline toolbar icon assets into a single sprite/gradient set and restore the folded-by-default control styling from the CoffeeScript UI.

We will update this list as each legacy capability is restored.

## File Map & Test Coverage

- `src/client/components/blip/BlipMenu.tsx` — main inline toolbar surface. Handles edit/read-only actions, overflow gear, uploads, clipboard helpers, collapse-by-default toggle, and inline comment visibility switch.
- `src/client/components/blip/BlipMenu.css` — restored folded toolbar styling, color palette, upload progress chip, and dropdown layout reusing the original gradients/sprites.
- `src/client/components/blip/clipboardStore.ts` — lightweight clipboard cache for copy comment / paste as reply / paste at cursor actions surfaced in the overflow.
- `src/client/components/editor/inlineCommentsVisibility.ts` — synchronizes inline comment visibility preference between BlipMenu and TipTap through `localStorage` + storage events.
- `src/client/components/editor/extensions/*` — gadget, underline, and color extensions wired into BlipMenu buttons so parity matches Starter Kit + custom nodes.
- `src/tests/client.BlipMenu.test.tsx` — Vitest suite covering edit/read-only states, formatting buttons, overflow actions (send/playback/copy/paste), upload progress, collapse toggles, and delete/link handlers.
- `src/tests/client.blipClipboardStore.test.ts` — exercises clipboard interactions to confirm the overflow menu correctly enables/disables paste actions.
- `src/tests/client.followGreenNavigation.test.tsx` — exercises the Follow-the-Green unread navigation hook (`useChangeTracking`) and `GreenNavigation` button so unread badges, highlight flashes, and toolbar banners stay synchronized with real content changes.
- `test-toolbar-inline-smoke.mjs` — Playwright-based smoke run (`npm run test:toolbar-inline`) that launches Chromium, exercises the inline toolbar controls (edit/read modes, formatting buttons, overflow toggles), types sample content, and confirms the inline comments nav renders for the active blip.

## Inline comment degraded states
Inline comment availability is surfaced in the toolbar itself so users notice outages without drilling into popovers:

- `InlineComments.tsx` emits status updates (`loadError`, `canComment`, `hasComments`) which `RizzomaBlip.tsx` forwards to `BlipMenu` via `inlineCommentsNotice`. When commenting is disabled or the API fails, the inline toolbar prepends a red `blip-menu-banner` mirroring the popover messaging.
- The popover renders the same status banner with retry controls, so Alt+Arrow navigation and toolbar toggles never leave the user guessing about degraded states.
- `client.BlipMenu.test.tsx` and `client.inlineCommentsPopover.test.tsx` assert both surfaces show the expected banners. The new Follow-the-Green regression test keeps unread highlights in sync with these banners so inline comment visibility cues cannot drift from the actual editor state.

## File Creation & Editing Steps

1. **Extend the menu surface** (`src/client/components/blip/BlipMenu.tsx`). Add new buttons/overflow entries and wire them to TipTap commands or REST helpers. When introducing asynchronous actions (uploads/delete/playback) ensure disabled/loading states mirror the existing handlers so tests can assert deterministically.
2. **Style the action** (`src/client/components/blip/BlipMenu.css`). Reuse the restored CoffeeScript gradients and icon sprite helpers; new controls should define explicit `:hover`, `:focus-visible`, and `[data-state]` selectors so the toolbar keeps parity in both edit/read-only blocks.
3. **Share stateful helpers**. If the feature touches clipboard, collapse defaults, or inline comment visibility, add logic in the relevant helper (`clipboardStore.ts`, `collapsePreferences.ts`, `inlineCommentsVisibility.ts`) instead of duplicating state inside `BlipMenu`. This keeps shortcuts/localStorage sync working.
4. **Update editor extensions**. Color, underline, gadget, and upload buttons depend on the `extensions/` directory. When adding a new control, either reuse an existing extension or create a new TipTap extension under `src/client/components/editor/extensions/` with schema + command wiring, then import it through `EditorConfig.tsx`.
5. **Cover with tests**. Extend `src/tests/client.BlipMenu.test.tsx` for UI changes and add/adjust targeted suites (`client.blipClipboardStore.test.ts`, `client.copyBlipLink.test.ts`, upload route tests, etc.) so regressions are caught. Tests should exercise both read-only and edit states and verify overflow/shortcut behavior when applicable.
6. **Document and flag follow-ups**. When the toolbar gains new capabilities or flags, update this doc, `docs/EDITOR.md`, and `RESTORE_POINT.md` with the status plus any outstanding Playwright/Vitest coverage so future passes know where to continue.

### Manual Validation Checklist

1. Toggle between Edit/Done and ensure undo/redo enabled states follow TipTap history.
2. Click Hide/Show comments to confirm TipTap decorations mirror BlipMenu state across tabs.
3. Use gear overflow to send, playback, copy/paste, and delete; verify disabled states when clipboard empty or delete in progress.
4. Trigger attachment/image uploads and observe inline progress/state changes on buttons.
5. Confirm collapse-by-default toggles persist per blip via CouchDB/localStorage and update the UI on initial render.

### Related Docs

- `docs/EDITOR.md` — high-level editor roadmap/flags.
- `docs/RESTORE_POINT.md` — backlog entry for inline toolbar Playwright smoke run once browser automation is ready.
