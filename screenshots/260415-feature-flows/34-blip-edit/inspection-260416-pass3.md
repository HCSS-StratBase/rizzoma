# 34-blip-edit — ⚠️ PARTIAL

**Category**: GearMenu
**Feature**: Edit mode via pencil button.

## Flow captured (pass 3)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 3)

Pass 3 partial: `activateFirstReplyBlip` clicks the blip successfully, but the Edit button click isn't finding the right button (there are multiple 'Edit' buttons in the DOM). Pass 4 needs `page.locator('.blip-menu-container button', { hasText: 'Edit' })` scoped to the active blip.
