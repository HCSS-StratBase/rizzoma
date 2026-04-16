# Feature Flow Sweep — Analysis pass 4 (2026-04-16)

**Pass 4 bottom line: 32 / 84 features (38%) are now VERIFIED, 20 are PARTIAL, 32 are NOT DEMONSTRATED.**

Pass 3 → Pass 4 delta: **27 → 32 verified** (+5), **18 → 20 partial** (+2), **39 → 32 not-demo** (-7).

## Trajectory across passes

| | Pass 1 | Pass 2 | Pass 3 | **Pass 4** |
|---|---:|---:|---:|---:|
| ✅ Verified | 12 | 21 | 27 | **32** |
| ⚠️ Partial | 6 | 17 | 18 | **20** |
| ❌ Not demonstrated | 66 | 46 | 39 | **32** |

## Per-category totals (pass 4)

| Category | Total | ✅ | ⚠️ | ❌ |
|---|---:|---:|---:|---:|
| Editor | 16 | 13 | 1 | 2 |
| BLB | 10 | 1 | 4 | 5 |
| Widgets | 6 | 4 | 0 | 2 |
| GearMenu | 8 | 2 | 6 | 0 |
| Playback | 8 | 4 | 4 | 0 |
| FtG | 8 | 1 | 3 | 4 |
| Comments | 5 | 1 | 0 | 4 |
| Collab | 5 | 0 | 0 | 5 |
| Uploads | 4 | 0 | 0 | 4 |
| Search | 2 | 2 | 0 | 0 |
| Mobile | 6 | 1 | 0 | 5 |
| UI | 6 | 3 | 2 | 1 |
| **TOTAL** | **84** | **32** | **20** | **32** |


## What's VERIFIED (32)

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
- **40-blip-history-modal** — Playback history modal (BlipHistoryModal).
- **41-playback-per-blip-timeline** — Per-blip timeline slider.
- **42-playback-play-pause-step** — Play / pause / step controls.
- **45-playback-wave-level-modal** — WavePlaybackModal (full wave timeline).
- **46-playback-split-pane** — Split pane (content + color-coded blip overview).
- **49-ftg-green-border** — Green left border on unread blips.
- **57-comment-create** — Inline comment via 💬+.
- **71-search-fulltext** — Full-text topics search.
- **72-search-snippet** — 150-char snippet with highlight span.
- **73-mobile-responsive** — Responsive layout via viewport resize.
- **80-ui-nav-tabs** — Nav tab switching.
- **82-ui-share-modal** — Share modal with privacy levels.
- **83-ui-invite-modal** — Invite modal.

## Pass 3 → Pass 4 upgrades (9)

- **40-blip-history-modal** — ⚠️ PARTIAL → ✅ VERIFIED
- **41-playback-per-blip-timeline** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **42-playback-play-pause-step** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **43-playback-speed** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **44-playback-diff** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **45-playback-wave-level-modal** — ⚠️ PARTIAL → ✅ VERIFIED
- **46-playback-split-pane** — ❌ NOT DEMONSTRATED → ✅ VERIFIED
- **47-playback-cluster-skip** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL
- **48-playback-date-jump** — ❌ NOT DEMONSTRATED → ⚠️ PARTIAL

## What pass 4 fixed

1. **Per-blip playback modal drill-down (40, 41, 42, 45, 46)** — the topic-level gear menu has a `Wave Timeline` item that opens the playback modal. Clicking that surface opens the `Blip Timeline` modal cleanly, which shows the timeline slider, play/pause controls, version list, and split-pane layout. All 5 features upgraded from NOT-DEMO or PARTIAL → VERIFIED.
2. **Editor highlight picker opens (12)** — scoped `clickEditorToolbarButton('Bg')` now finds and clicks the correct Bg button, opening the color picker. Close to VERIFIED — the swatch-click step still needs refinement.
3. **Inline child blip seed with anchorPosition** — the API call succeeds, but the parent blip does NOT render a visible `[+]` marker span. The rendering path needs more investigation (pass 5).

## What pass 4 did NOT fix

1. **Gear-menu scoping (35–39, 84)** — the scoped locator `.blip-container.active .blip-menu-container button` did NOT match the active blip. The fallback `.blip-menu-container button` matched the topic-level menu. Result: 35–39 still hit topic gear. Pass 5 needs actual DOM inspection of an active blip to find the correct classname.
2. **Editor link / image buttons (13, 14)** — the scoped toolbar click fires, but the 🔗 / 🖼️ actions either don't produce visible UI changes (link applied silently) or the Bg color picker from feature 12 contaminates the view. Pass 5 needs explicit picker dismissal between features.
3. **BLB inline markers (19, 20)** — seeding a child blip with `anchorPosition: 10` via API did not produce a visible `[+]` marker in the parent blip's editor text. The inline marker rendering path in `RizzomaBlip.tsx` appears to use a different mechanism than I assumed. Pass 5 needs to inspect the component's marker-rendering source to match the correct data structure.

## Recommended pass 5 scope

1. **Inspect DOM of active blip and fix gear-menu scoping** — unlocks 35–39, 84 (6 features).
2. **Explicit picker close between features** — unlocks 13, 14 (2 features).
3. **Swatch click fix for highlight (12)** — promotes 12 to VERIFIED (1 feature).
4. **Inline marker source inspection + seed fix** — unlocks 19, 20, 25 (3 features, maybe).
5. **Comment thread setup** — seed a root comment via API, then test reply/resolve/visibility/shortcut flow (58–61, 4 features).
6. **README-only stubs** for the remaining backend / internals: 21, 22, 24 (BLB internals), 50, 53, 54, 56 (FtG requiring pure UI states), 62–66 (collab), 67–70 (uploads), 74–78 (mobile gestures). That's ~17 features that pass 5 should explicitly document as "README-only, not captured".

**Projected pass 5 numbers**: ~45 / 84 VERIFIED with actual captures, ~17 more with README-only stubs = 62 / 84 (~74%) meaningfully documented.

## Scripts

- `scripts/capture-feature-flows.mjs` — pass 1 (77/84 passed)
- `scripts/capture-feature-flows-fix.mjs` — pass 1 editor-block fix (7/7)
- `scripts/capture-feature-flows-pass2.mjs` — pass 2 (clipped captures for marks)
- `scripts/capture-feature-flows-pass3.mjs` — pass 3 (hardOpenTopic + 2-user context)
- `scripts/capture-feature-flows-pass4.mjs` — pass 4 (scoped toolbar + gear locator + inline marker seed)
