# Feature Flow Sweep — Analysis pass 3 (2026-04-16)

**Pass 3 bottom line: 27 / 84 features (32%) are now VERIFIED, 18 are PARTIAL, 39 are NOT DEMONSTRATED.**

Pass 2 → Pass 3 delta: **21 → 27 verified** (+6), **17 → 18 partial** (+1), **46 → 39 not-demo** (-7).

## Trajectory across passes

| | Pass 1 | Pass 2 | Pass 3 |
|---|---:|---:|---:|
| ✅ Verified | 12 | 21 | 27 |
| ⚠️ Partial | 6 | 16 | 18 |
| ❌ Not demonstrated | 66 | 47 | 39 |

## Per-category totals (pass 3)

| Category | Total | ✅ | ⚠️ | ❌ |
|---|---:|---:|---:|---:|
| Editor | 16 | 13 | 1 | 2 |
| BLB | 10 | 1 | 4 | 5 |
| Widgets | 6 | 4 | 0 | 2 |
| GearMenu | 8 | 1 | 7 | 0 |
| Playback | 8 | 0 | 1 | 7 |
| FtG | 8 | 1 | 3 | 4 |
| Comments | 5 | 1 | 0 | 4 |
| Collab | 5 | 0 | 0 | 5 |
| Uploads | 4 | 0 | 0 | 4 |
| Search | 2 | 2 | 0 | 0 |
| Mobile | 6 | 1 | 0 | 5 |
| UI | 6 | 3 | 2 | 1 |
| **TOTAL** | **84** | **27** | **18** | **39** |


## What's now VERIFIED (27)

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
- **27-widget-mention-pill** — |@Name| pill via typing `@`.
- **28-widget-task-pill** — |☐ Name DD Mon| pill via typing `~`.
- **29-widget-tag** — #tag turquoise text.
- **30-widget-right-panel-buttons** — ↵ @ ~ # ▦ Gadgets right-panel insert buttons.
- **33-blip-reply** — Reply via `Write a reply...`.
- **49-ftg-green-border** — Green left border on unread blips.
- **57-comment-create** — Inline comment via 💬+.
- **71-search-fulltext** — Full-text topics search.
- **72-search-snippet** — 150-char snippet with highlight span.
- **73-mobile-responsive** — Responsive layout via viewport resize.
- **80-ui-nav-tabs** — Nav tab switching.
- **82-ui-share-modal** — Share modal with privacy levels.
- **83-ui-invite-modal** — Invite modal.

## What's PARTIAL (18)

- **12-editor-highlight** — Highlight mark via toolbar `Bg` button.
- **17-blb-collapsed-toc** — BLB collapsed view via `short` mode toggle.
- **18-blb-section-expanded** — Section expanded view.
- **23-blb-click-outside-hide** — Click outside inline child hides its toolbar.
- **25-blb-ctrl-enter-child** — Ctrl+Enter creates inline child at cursor.
- **34-blip-edit** — Edit mode via pencil button.
- **35-blip-delete** — Delete blip via gear dropdown.
- **36-blip-duplicate** — Duplicate blip via gear dropdown.
- **37-blip-cut** — Cut blip via gear dropdown.
- **38-blip-paste** — Paste at cursor / Paste as reply.
- **39-blip-copy-link** — Copy direct link via gear dropdown.
- **40-blip-history-modal** — Playback history modal (BlipHistoryModal).
- **45-playback-wave-level-modal** — WavePlaybackModal.
- **51-ftg-sidebar-badge** — Topic list unread badges.
- **52-ftg-mark-read** — Mark single / batch read endpoints.
- **55-ftg-ctrl-space** — Ctrl+Space triggers Next Topic button.
- **79-ui-three-panel** — Three-panel layout.
- **81-ui-topics-list** — Topics list with unread bars.

## Pass 2 → Pass 3 upgrades (10)

- **25-blb-ctrl-enter-child** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **27-widget-mention-pill** — ⚠️ PARTIAL → ✅ VERIFIED
- **33-blip-reply** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **49-ftg-green-border** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **51-ftg-sidebar-badge** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **52-ftg-mark-read** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **55-ftg-ctrl-space** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **57-comment-create** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **72-search-snippet** — ⚠️ PARTIAL → ✅ VERIFIED
- **80-ui-nav-tabs** — ⚠️ PARTIAL → ✅ VERIFIED

## What pass 3 fixed

1. **Stronger cleanup via `hardOpenTopic()`** — `page.goto('about:blank')` + re-navigate forces a full React remount so TipTap bubble menus and gadget palette can't leak between features. Every feature's capture is now clean of overlay contamination from prior features.
2. **Seeded second user for FtG (49)** — user B (via separate browser context) posts a blip, user A then sees it as unread. Clean demonstration of the multi-user flow.
3. **Reply click-through (33)** — the `Write a reply...` placeholder is now clicked and typed into successfully. Reply text visible in after-frame.
4. **Inline comment create (57)** — clicking `💬+` with text selected opens the inline-comment composer, typed text visible.
5. **Nav tab transition (80)** — clean capture of Mentions tab active with (empty) Mentions view rendered.
6. **Search snippet (72)** — clipped topic-list capture shows `formatting` search filtering to matching topics.

## What pass 3 did NOT fix (key remaining bugs)

### Gear-menu scoping bug (affects 34–40, 41–48, 84) — 15 features blocked

`openBlipGearMenu()` used `querySelectorAll('button').filter(textContent === '⚙️')` and clicked `gears[gears.length - 1]`. Intended: the last gear = the active blip's gear. Actual: the last gear in DOM order is still the topic-level gear (the topic toolbar's ⚙️). Evidence: every gear-menu capture shows a dropdown with topic-level items `Mark topic as read / Follow topic / Print / Export topic / Wave Timeline`.

**Fix for pass 4**: scope the gear selector to `'.rizzoma-blip.active .blip-menu-container button'` or use a testid-based selector.

### Editor highlight/link/image buttons (12, 13, 14) — 3 features blocked

The generic `button.textContent === 'Bg' / '🔗' / '🖼️'` search matches multiple buttons across the topic/blip toolbars (and possibly the link-add vs link-remove pair for 13). The click fires on the wrong one.

**Fix for pass 4**: scope to the topic-root editor toolbar via `page.locator('.topic-root-editor .editor-toolbar button').filter({ hasText: /^Bg$/ })`.

### BLB inline-expand needs seed (19, 20, 25) — 3 features blocked

Inline markers (`[+]` rendered spans inside blip text) are created by user interaction (Ctrl+Enter), not by the API. The `createSeedTopic()` function POSTs blip content as HTML; inline markers only exist as React-rendered overlays on blip text that contains embedded `data-inline-child-id` attributes. The seed blip HTML has no such attributes.

**Fix for pass 4**: either (a) seed blip content with explicit `<span data-inline-child-id="...">+</span>` markup, OR (b) run Ctrl+Enter as a setup action before the BLB tests to create a real inline child in the editor state.

### Features better documented than captured (21, 22, 24, 62–66, 67–70, 74–78)

These features are either backend-only (storage backends, ClamAV, collab internals) or are implementation details (React portal rendering, CSS alignment) that are more rigorously verified by source code + existing Vitest/Playwright smokes than by full-page screenshots. Pass 4 should replace their placeholder PNG captures with README.md files referencing the relevant code and test files.

## Recommended pass 4 scope

1. **Fix the gear-menu scoping** — unlocks 15 features (34–40 gear items, 41–48 playback modals, 84 toast).
2. **Scope editor-toolbar selectors** — unlocks 3 features (12 highlight, 13 link, 14 image).
3. **Seed inline markers in blip HTML** — unlocks 3 features (19 inline expand, 20 collapse back, 25 ctrl-enter child).
4. **README-only stubs** for 15 features (21, 22, 24 BLB internals; 62–66 collab; 67–70 uploads; 74–78 mobile gestures).
5. **Optional**: 2-user FtG drill-down for 50, 51, 52, 53, 54, 56 — would need extra setup.

**Projected pass 4 numbers**: if all the above land cleanly, ~48 / 84 VERIFIED (57%), ~20 PARTIAL, ~16 NOT-DEMO. The remaining 16 NOT-DEMO would be explicitly deferred to README-only treatment.

## Scripts

- `scripts/capture-feature-flows.mjs` — pass 1 driver (77/84 passed)
- `scripts/capture-feature-flows-fix.mjs` — pass 1 editor-block fix (7/7 passed)
- `scripts/capture-feature-flows-pass2.mjs` — pass 2 driver with clipped captures
- `scripts/capture-feature-flows-pass3.mjs` — pass 3 driver with hardOpenTopic + 2-user context
