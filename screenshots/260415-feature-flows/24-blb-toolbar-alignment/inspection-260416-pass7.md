# 24-blb-toolbar-alignment — ✅ VERIFIED

**Category**: BLB
**Feature**: Inline child toolbar is left-aligned.
**Evidence type**: `SOURCE`

## Evidence

CSS: `.inline-child-expanded .blip-menu-container { position: relative }`.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/blip/RizzomaBlip.css` — position override for inline children. Prevents absolute-positioned toolbars from floating outside the inline child container.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
