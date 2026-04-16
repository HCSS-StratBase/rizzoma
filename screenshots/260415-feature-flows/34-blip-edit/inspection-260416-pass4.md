# 34-blip-edit — ⚠️ PARTIAL

**Category**: GearMenu
**Feature**: Edit mode via pencil button.

## Flow captured (pass 4)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 4)

Pass 4: `activateFirstReplyBlipLocator` activates the blip, but the Edit button locator `.blip-menu-container button:hasText('Edit')` doesn't reliably find the right button — there are multiple Edit-labeled buttons in the DOM (topic Edit mode vs blip Edit).
