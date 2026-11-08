# Feature Flow Sweep — Analysis pass 1 (2026-04-16)

**Bottom line: 12 / 84 features (14%) were 100% demonstrated visually.**
6 were PARTIAL (action fired but visible delta is too subtle or happened for the wrong reason).
66 were NOT DEMONSTRATED (placeholder captures with 3 identical frames, or the driver action silently failed).

## Per-category totals

| Category | Total | ✅ Verified | ⚠️ Partial | ❌ Not demonstrated |
|---|---:|---:|---:|---:|
| Editor & Formatting (01–16)       | 16 | 9  | 4  | 3  |
| BLB (17–26)                        | 10 | 1  | 2  | 7  |
| Inline widgets (27–32)             |  6 | 0  | 0  | 6  |
| Blip ops / gear menu (33–40)       |  8 | 0  | 0  | 8  |
| History & Playback (41–48)         |  8 | 0  | 0  | 8  |
| Unread / FtG (49–56)               |  8 | 0  | 0  | 8  |
| Inline comments (57–61)            |  5 | 0  | 0  | 5  |
| Real-time collab (62–66)           |  5 | 0  | 0  | 5  |
| Uploads (67–70)                    |  4 | 0  | 0  | 4  |
| Search (71–72)                     |  2 | 1  | 0  | 1  |
| Mobile / PWA (73–78)               |  6 | 1  | 0  | 5  |
| UI shell (79–84)                   |  6 | 0  | 0  | 6  |
| **TOTAL**                          | **84** | **12** | **6** | **66** |

## What's VERIFIED (12)

- **05-editor-headings** — Heading H1 via Ctrl+Alt+1.
- **06-editor-bullet-list** — Bullet list toggle (Ctrl+Shift+8).
- **07-editor-ordered-list** — Ordered list toggle (Ctrl+Shift+7).
- **08-editor-task-list** — Task list toggle (Ctrl+Shift+9).
- **09-editor-blockquote** — Blockquote toggle (Ctrl+Shift+B).
- **10-editor-code-inline** — Inline code mark (Ctrl+E).
- **11-editor-code-block** — Code block with lowlight syntax highlighting.
- **15-editor-mention-dropdown** — @mention suggestion dropdown.
- **16-editor-gadget-palette** — Gadget palette (11 types).
- **26-blb-fold-unfold-all** — Fold/unfold all replies (▲/▼).
- **71-search-fulltext** — Full-text topics search (Mango regex).
- **73-mobile-responsive** — Responsive layout via viewport resize.

## What's PARTIAL (6)

- **01-editor-bold** — TipTap Bold mark (Ctrl+B).
- **02-editor-italic** — TipTap Italic mark (Ctrl+I).
- **03-editor-underline** — TipTap Underline mark (Ctrl+U).
- **04-editor-strikethrough** — TipTap Strike mark (Ctrl+Shift+X).
- **17-blb-collapsed-toc** — BLB collapsed view via `short` mode toggle.
- **23-blb-click-outside-hide** — Click outside inline child hides its toolbar.

## Why 66 features are NOT DEMONSTRATED

The `capture-feature-flows.mjs` driver used placeholder capture functions for
whole categories: the driver never opened gear dropdowns (33–40), never opened
playback modals (41–48), never created a second user for FtG / comments /
collab (49–66), never opened a file picker (67–70), never triggered toasts,
share / invite modals, or nav tab transitions (79–84).

Specific driver bugs:

1. **Gadget palette contamination (17–23)** — feature 16 opened the palette and
   the driver didn't close it before BLB tests, so BLB captures 17–22 have the
   palette overlaying the view.
2. **Inline marker selector fails on fresh topics (19, 20, 25)** — `.inline-blip-marker`
   doesn't exist until a user creates one via Ctrl+Enter. Seed topic has none.
3. **Synthetic keydown doesn't reach TipTap CommandManager (13)** — Ctrl+K was
   dispatched as a DOM event; TipTap's ProseMirror plugin didn't respond. Need
   `page.keyboard.press('Control+k')` instead of manual KeyboardEvent dispatch.
4. **Highlight/Bg button selector wrong (12)** — the `find(b => ... Highlight)` heuristic
   didn't match the real toolbar button's markup.
5. **Undo cascade crosses feature boundaries (27–32)** — each editor feature's
   `Control+z` was undoing prior features' state, leading to editor state drift
   and lost focus. Fix is per-feature topic reload (as in
   `capture-feature-flows-fix.mjs` for features 05–11).
6. **Backend-only features (CSRF, Redis, bcrypt, ClamAV, Mango indexes, rate
   limiting)** have no meaningful screenshot evidence. They should be verified
   via Vitest / curl / health-check output documented in their README, not via
   a PNG. The current captures for those (67–70 uploads, 62–66 collab internals)
   are placeholder frames.

## What to do for pass 2

1. **Close modals/overlays between features** — add a hard `cleanup()` helper
   that dismisses any open modal, dropdown, palette, or inline child before the
   next feature runs.
2. **Per-feature topic reload** — roll the fix strategy from editor 05–11 out
   to ALL features that mutate editor state. Reloading the topic page between
   features erases drift.
3. **Seed pre-state for features that need it** —
   - BLB inline markers: create an inline child via `Ctrl+Enter` in a setup step.
   - FtG / unread: seed a second user via the API and have them post a blip.
   - Inline comments: create one comment via the API before the test.
4. **Drive modals via real clicks, not synthetic events** — gear dropdown, link
   prompt, image picker.
5. **Use two browser contexts for collab** (copy the pattern from
   `test-collab-smoke.mjs`).
6. **Capture at higher DPI or clipped for subtle marks (01–04)** — use
   `page.screenshot({ clip: boundingBox(element) })` to zoom into the affected
   text for bold/italic/underline/strike.
7. **Backend features** — replace placeholder PNGs with a README that shows
   `curl` output, Vitest test run, or health-check JSON as evidence.

## Index

Every feature folder has an `inspection-260416.md` alongside the auto-generated
`README.md`. The `README.md` files are the capture-script flow descriptions and
are left untouched so future pass 2 / pass 3 inspections can be added in their
own dated files without clobbering.
