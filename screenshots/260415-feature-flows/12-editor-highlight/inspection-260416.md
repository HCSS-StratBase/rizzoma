# 12-editor-highlight — ❌ NOT DEMONSTRATED

**Category**: Editor
**Feature**: Highlight mark via toolbar `Bg` button.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

Button selector did not find the Highlight/Bg button in the current DOM — the evaluate block searched for specific markup that doesn't match. Need to bind to the real button via role/accessible-name.
