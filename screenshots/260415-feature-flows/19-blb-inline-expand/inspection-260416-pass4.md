# 19-blb-inline-expand — ❌ NOT DEMONSTRATED

**Category**: BLB
**Feature**: [+] click = inline expansion.

## Flow captured (pass 4)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 4)

Pass 4 seed approach FAILED: seeding a child blip with `anchorPosition: 10` in the parent blip's text DID create the DB record (confirmed via API response), but the parent blip does NOT render a `[+]` inline marker span in the editor. Inline markers are rendered by the editor state's anchor positions, which are tracked differently from simple child-blip anchorPosition. Pass 5 needs to inspect how RizzomaBlip reads inline markers and match that structure.
