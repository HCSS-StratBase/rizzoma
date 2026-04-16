# 27-widget-mention-pill — ❌ NOT DEMONSTRATED

**Category**: Widgets
**Feature**: |@Name| pill via typing `@`.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

`@` was typed after a space, but the mention popup did not render in the captured frame — possibly because the editor lost focus after the undo chain from the previous feature. Working demo is in feature 15.
