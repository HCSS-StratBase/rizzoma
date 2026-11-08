# 13-editor-link — ❌ NOT DEMONSTRATED

**Category**: Editor
**Feature**: Link via toolbar 🔗 button.

## Flow captured (pass 2)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 2)

Pass 2 did NOT improve this. The 🔗 button click apparently fired, but the highlight color picker from feature 12 was still open and contaminates the capture. Pass 3 needs a stronger `dismissOverlays()` helper that forcibly closes TipTap bubble menus (probably via clicking elsewhere AND pressing Escape multiple times).
