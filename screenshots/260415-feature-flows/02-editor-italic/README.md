# 02-editor-italic

TipTap Italic mark (Ctrl+I).

**Flow captured**
1. `01-before_new.png` — baseline editor state, no selection.
2. `02-during_new.png` — substring `sample paragraph` selected.
3. `03-after_new.png` — after `Control+i`, mark applied.

**Implementation**: TipTap StarterKit / extensions, handler in `src/client/components/editor/EditorConfig.tsx`.
