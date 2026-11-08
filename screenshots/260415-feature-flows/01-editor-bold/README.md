# 01-editor-bold

TipTap Bold mark (Ctrl+B).

**Flow captured**
1. `01-before_new.png` — baseline editor state, no selection.
2. `02-during_new.png` — substring `sample paragraph` selected.
3. `03-after_new.png` — after `Control+b`, mark applied.

**Implementation**: TipTap StarterKit / extensions, handler in `src/client/components/editor/EditorConfig.tsx`.
