# 13-editor-link — ❌ NOT DEMONSTRATED

**Category**: Editor
**Feature**: Link via Ctrl+K.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

A synthetic `KeyboardEvent('keydown', {ctrlKey:true, key:'k'})` dispatched through the editor element does NOT fire TipTap's CommandManager. Need to use `page.keyboard.press('Control+k')` or click the 🔗 toolbar button.
