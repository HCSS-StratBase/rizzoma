# 12-editor-highlight — ⚠️ PARTIAL

**Category**: Editor
**Feature**: Highlight mark via toolbar `Bg` button.

## Flow captured (pass 3)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 3)

Pass 3 did NOT improve this. The Bg button click appears not to fire, or the color picker closes before the swatch click reaches it. No highlight visible on the text. Pass 4 needs to use `page.locator('button').filter({ hasText: /^Bg$/ }).click()` and then wait for `[class*="color-picker"]` to be attached before clicking a swatch.
