# 35-blip-delete — ⚠️ PARTIAL

**Category**: GearMenu
**Feature**: Delete blip via gear dropdown.

## Flow captured (pass 4)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 4)

Pass 4: the scoped gear locator `.blip-container.active .blip-menu-container button` did NOT match — likely because the active blip's DOM classes are different from what I assumed. The fallback locator `.blip-menu-container button` matched the topic-level menu, so the topic gear opened instead of the blip gear. Pass 5 needs to actually inspect the DOM structure of an active blip and use the correct classname.
