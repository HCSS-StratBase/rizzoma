# 35-blip-delete — ⚠️ PARTIAL

**Category**: GearMenu
**Feature**: Delete blip via gear dropdown.

## Flow captured (pass 3)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 3)

Pass 3: `openBlipGearMenu` clicked the LAST ⚙️ button in the DOM, which turns out to be the TOPIC-level gear (showing 'Mark topic as read / Follow topic / Print / Export topic / Wave Timeline'), not the blip-level gear (which shows 'Delete blip / Duplicate blip / etc.'). Pass 4 fix: scope the selector to `.rizzoma-blip.active .blip-menu-container button`.
