# 14-editor-image — ❌ NOT DEMONSTRATED

**Category**: Editor
**Feature**: Image insert (🖼️).

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

Button search matched the emoji but no picker modal opened in the captures. The click may have fired but the after frame was taken before the modal rendered, or the image node insertion pathway needs a URL prompt that wasn't answered.
