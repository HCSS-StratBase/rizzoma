# Feature Flow Sweep — Analysis pass 2 (2026-04-16)

**Pass 2 bottom line: 21 / 84 features (25%) are now VERIFIED, 16 are PARTIAL, 47 are NOT DEMONSTRATED.**

Pass 1 → Pass 2 delta: **12 → 21 verified** (+9), **6 → 16 partial** (+10), **66 → 47 not-demo** (-19).

## Per-category totals (pass 2)

| Category | Total | ✅ | ⚠️ | ❌ |
|---|---:|---:|---:|---:|
| Editor | 16 | 13 | 1 | 2 |
| BLB | 10 | 1 | 3 | 6 |
| Widgets | 6 | 3 | 1 | 2 |
| GearMenu | 8 | 0 | 7 | 1 |
| Playback | 8 | 0 | 0 | 8 |
| FtG | 8 | 0 | 0 | 8 |
| Comments | 5 | 0 | 0 | 5 |
| Collab | 5 | 0 | 0 | 5 |
| Uploads | 4 | 0 | 0 | 4 |
| Search | 2 | 1 | 1 | 0 |
| Mobile | 6 | 1 | 0 | 5 |
| UI | 6 | 2 | 3 | 1 |
| **TOTAL** | **84** | **21** | **16** | **47** |


## What's now VERIFIED (21)

- **01-editor-bold** — TipTap Bold mark (Ctrl+B).
- **02-editor-italic** — TipTap Italic mark (Ctrl+I).
- **03-editor-underline** — TipTap Underline mark (Ctrl+U).
- **04-editor-strikethrough** — TipTap Strike mark (Ctrl+Shift+X).
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
- **28-widget-task-pill** — |☐ Name DD Mon| pill via typing `~`.
- **29-widget-tag** — #tag turquoise text.
- **30-widget-right-panel-buttons** — ↵ @ ~ # ▦ Gadgets right-panel insert buttons.
- **71-search-fulltext** — Full-text topics search (Mango regex).
- **73-mobile-responsive** — Responsive layout via viewport resize.
- **82-ui-share-modal** — Share modal with privacy levels.
- **83-ui-invite-modal** — Invite modal with contacts.

## What's PARTIAL (16)

- **12-editor-highlight** — Highlight mark via toolbar `Bg` button.
- **17-blb-collapsed-toc** — BLB collapsed view via `short` mode toggle.
- **18-blb-section-expanded** — Section expanded view.
- **23-blb-click-outside-hide** — Click outside inline child hides its toolbar.
- **27-widget-mention-pill** — |@Name| pill via typing `@`.
- **34-blip-edit** — Edit mode via pencil button.
- **35-blip-delete** — Delete blip via gear dropdown.
- **36-blip-duplicate** — Duplicate blip via gear dropdown.
- **37-blip-cut** — Cut blip via gear dropdown.
- **38-blip-paste** — Paste at cursor / Paste as reply.
- **39-blip-copy-link** — Copy direct link via gear dropdown.
- **40-blip-history-modal** — Playback history modal (BlipHistoryModal).
- **72-search-snippet** — 150-char snippet with highlight span.
- **79-ui-three-panel** — Three-panel layout (nav / topic / tools).
- **80-ui-nav-tabs** — Topics / Mentions / Tasks / Publics / Store / Teams nav.
- **81-ui-topics-list** — Topics list with unread bars.

## Pass 1 → Pass 2 upgrades (23)

- **01-editor-bold** — ⚠️ PARTIAL → ✅ VERIFIED
- **02-editor-italic** — ⚠️ PARTIAL → ✅ VERIFIED
- **03-editor-underline** — ⚠️ PARTIAL → ✅ VERIFIED
- **04-editor-strikethrough** — ⚠️ PARTIAL → ✅ VERIFIED
- **12-editor-highlight** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **18-blb-section-expanded** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **27-widget-mention-pill** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **28-widget-task-pill** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **29-widget-tag** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **30-widget-right-panel-buttons** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **34-blip-edit** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **35-blip-delete** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **36-blip-duplicate** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **37-blip-cut** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **38-blip-paste** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **39-blip-copy-link** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **40-blip-history-modal** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **72-search-snippet** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **79-ui-three-panel** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **80-ui-nav-tabs** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **81-ui-topics-list** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **82-ui-share-modal** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **83-ui-invite-modal** — ❌ NOT DEMONSTRATED → ✅ VERIFIED

## What pass 2 fixed

1. **Clipped screenshots for subtle marks (01–04)** — `page.screenshot({ clip: boundingBox })` on the affected paragraph made bold/italic/underline/strike unambiguously visible. All 4 upgraded from PARTIAL → VERIFIED.
2. **Real Bg button click for highlight (12)** — selector now matches the button by its exact text `Bg` instead of a fuzzy title-attr search. The color picker opens cleanly.
3. **Widget popup triggers (28, 29, 30)** — `page.keyboard.type('~')` and `type('#')` now trigger the task and tag suggestion popups cleanly. The right-panel button cluster is captured via a clipped screenshot.
4. **Gear menu dropdown (34–40)** — driver now clicks the blip's `⚙️` button and waits for the menu, then takes the after-screenshot with the menu open. All 7 gear items upgraded from NOT-DEMO → PARTIAL (menu visible but actions not executed).
5. **Share modal (82) and Invite modal (83)** — real button clicks open both modals cleanly in pass 2.
6. **Nav tabs (80)** — Mentions tab click fires and the content panel updates.
7. **Three-panel layout (79)** — Collapse tools button click visibly collapses the right panel.
8. **Search (71, 72)** — fulltext still VERIFIED; snippet upgraded to PARTIAL (filter works, highlight span unclear at capture resolution).

## What pass 2 did NOT fix (and why)

1. **Overlay contamination (13, 14, 17, 18, 79, 80, 81)** — the `dismissOverlays()` helper (Escape + Cancel button click) is not strong enough to close the TipTap bubble-menu color picker or the persistent gadget palette. Features 13 (link), 14 (image), 17, 18 BLB, 79–81 UI shell all captured with the color picker still open on top.
2. **Gear menu action execution (34–40)** — the dropdown opens, but the menu items aren't clicked through. All 7 remain PARTIAL.
3. **BLB inline-expand family (19, 20, 21, 22, 24, 25)** — not attempted in pass 2. Need pre-seeded inline markers.
4. **Multi-user flows (49–56 FtG, 57–61 comments, 62–66 collab)** — need a second user / second browser context. Not attempted.
5. **Modal drill-down (41–48 playback)** — need to click gear → Playback history, wait for modal, then capture its controls. Not attempted.
6. **Uploads (67–70)** — need `page.setInputFiles()` and intercepted POST. Not attempted. Likely best handled as README-only documentation + reference to `test-collab-smoke.mjs` or uploads route tests.
7. **Mobile gestures (74–78)** — need synthetic touch events and offline-state forcing. Not attempted.
8. **Playback modals (41–48)** — not attempted.

## Recommended pass 3 scope

**Highest leverage fixes (targeting ~30 more features to upgrade)**:

1. **Stronger `dismissOverlays()` helper** — click the editor area at a known-safe coordinate + press Escape 3 times + evaluate-based close-button sweep + wait 200ms. Fixes 13, 14, 17, 18, 79, 80, 81.
2. **Seed an inline child blip** in `createSeedTopic()` so BLB 19, 20, 25 have a marker to interact with.
3. **Click through the gear menu item** for 34–40 instead of stopping at "menu open". Verify the resulting state (edit mode, blip removed, blip duplicated, etc.).
4. **Open the playback modals** for 40 → 41–48. Use `gear → Playback history`, wait for `.blip-history-modal` selector, capture, then drill into speed/diff/play/pause controls.
5. **Seed a second user + post one blip** for FtG 49–56. Use the API pattern from `test-collab-smoke.mjs` (`createTopicAndBlip` from user B).
6. **Click 💬+ on selected text** for comments 57–61. Capture the inline comments panel open state.
7. **Stub README with curl output** for uploads 67–70, collab 62–66, mobile gestures 74–78. These are better proven by the existing CI smoke tests than by screenshots.

**Low leverage (skip unless requested)**:
- Mobile gestures 74–78 (hard to automate meaningfully).
- Collab two-context 62–66 (covered by `test-collab-smoke.mjs` already).
- Backend-only uploads 69, 70 (not visually observable).

## Projected pass 3 numbers

If the pass 3 fixes land cleanly: approximately **50 / 84 VERIFIED** (60%), 12 PARTIAL, 22 NOT DEMO. The remaining 22 NOT DEMO would mostly be backend features and mobile gestures that need README-only treatment rather than PNG captures.
