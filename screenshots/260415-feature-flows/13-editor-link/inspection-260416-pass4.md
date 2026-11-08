# 13-editor-link — ❌ NOT DEMONSTRATED

**Category**: Editor
**Feature**: Link via toolbar 🔗 button.

## Flow captured (pass 4)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 4)

Pass 4 did NOT fix. The scoped toolbar click fired but no link prompt or applied link is visible. The color picker from feature 12 contaminates the view (it remained open despite hardOpenTopic — likely a TipTap bubble-menu React state that survives navigation). Pass 5 fix: close the Bg picker explicitly between features, and use `page.keyboard.press('Control+k')` instead of button click to reach TipTap's link command.
