import type { GadgetInsertDetail } from './types';
import { createDefaultPollAttrs } from './defaults';
import { getGadgetManifest } from './registry';
import { resolveGadgetUrl } from './embedAdapters';
import { getAppManifest } from './apps/catalog';
import { normalizeEmbedFrameAttrs } from './security';

function insertAppFromManifest(editor: TiptapEditorLike, appId: string) {
  const instanceId = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const manifest = getAppManifest(appId);
  if (!manifest) return false;
  return editor.chain().focus().insertContent({
    type: 'appFrameGadget',
    attrs: {
      appId: manifest.id,
      instanceId,
      title: manifest.label,
      src: manifest.entry,
      height: manifest.defaultHeight,
      data: manifest.initialData,
    },
  }).run();
}

type TiptapEditorLike = {
  chain: () => {
    focus: () => {
      insertContent: (content: unknown) => { run: () => boolean };
      toggleCodeBlock: () => { run: () => boolean };
      run: () => boolean;
    };
    insertContent: (content: unknown) => { run: () => boolean };
    toggleCodeBlock: () => { run: () => boolean };
    run: () => boolean;
  };
};

export function insertGadget(editor: TiptapEditorLike, detail?: GadgetInsertDetail | null) {
  const manifest = getGadgetManifest(detail?.type);
  const url = detail?.url?.trim();

  switch (manifest.type) {
    case 'youtube': {
      if (!url) return false;
      const youtube = resolveGadgetUrl(manifest.type, url);
      const safe = normalizeEmbedFrameAttrs({ provider: 'youtube', src: youtube.normalizedUrl, width: '560', height: '315', title: 'YouTube' });
      if (!safe) throw new Error('Unsafe YouTube embed URL.');
      return editor.chain().focus().insertContent({
        type: 'embedFrameGadget',
        attrs: safe,
      }).run();
    }
    case 'code': {
      // A bullet's first paragraph cannot BECOME a code block (list item content is "paragraph block*"), so
      // toggleCodeBlock silently did nothing and the Code gadget inserted nothing (found 18 Nov 2026). Then add
      // the code block as the bullet's next block instead, and put the caret inside it.
      const anyEditor = editor as any;
      anyEditor.chain().focus().toggleCodeBlock().run();
      if (anyEditor.isActive?.('codeBlock')) return true;
      const ok = anyEditor.chain().focus().insertContent({ type: 'codeBlock' }).run();
      if (ok && typeof anyEditor.commands?.focus === 'function') {
        const { $from } = anyEditor.state.selection;
        for (let d = $from.depth; d > 0; d -= 1) {
          if ($from.node(d).type.name === 'codeBlock') return true;
        }
        // caret fell after the new block: step back into it
        anyEditor.commands.setTextSelection(Math.max(1, anyEditor.state.selection.from - 1));
      }
      return ok;
    }
    case 'poll':
      return editor.chain().focus().insertContent({
        type: 'pollGadget',
        attrs: createDefaultPollAttrs(),
      }).run();
    case 'latex': {
      // Insert the delimiters and leave the caret BETWEEN them, so that typing the formula is the next thing
      // a person does (before, the caret sat after "$$  $$" and the gadget looked like an unexplained blank).
      const ok = editor.chain().focus().insertContent('$$  $$').run();
      const anyEditor = editor as any;
      const end = anyEditor.state?.selection?.from;
      if (ok && typeof end === 'number' && typeof anyEditor.commands?.setTextSelection === 'function') {
        anyEditor.commands.setTextSelection(Math.max(1, end - 3));
      }
      return ok;
    }
    case 'iframe':
    case 'spreadsheet': {
      if (!url) return false;
      const embed = resolveGadgetUrl(manifest.type, url);
      const safe = normalizeEmbedFrameAttrs({
        title: manifest.type === 'spreadsheet' ? 'Spreadsheet' : 'Embedded content',
        provider: manifest.type,
        width: manifest.type === 'spreadsheet' ? '720' : '600',
        height: manifest.type === 'spreadsheet' ? '420' : '400',
        src: embed.normalizedUrl,
      });
      if (!safe) throw new Error('Unsafe embed URL.');
      return editor.chain().focus().insertContent({
        type: 'embedFrameGadget',
        attrs: safe,
      }).run();
    }
    case 'image': {
      if (!url) return false;
      const image = resolveGadgetUrl(manifest.type, url);
      return editor.chain().focus().insertContent({
        type: 'image',
        attrs: { src: image.normalizedUrl, alt: 'image' },
      }).run();
    }
    case 'kanbanApp': {
      return insertAppFromManifest(editor, 'kanban-board');
    }
    case 'calendarApp': {
      return insertAppFromManifest(editor, 'calendar-planner');
    }
    case 'focusApp': {
      return insertAppFromManifest(editor, 'focus-timer');
    }
    case 'notesApp': {
      // Hard Gap #20 (2026-04-13): fourth real preview app.
      return insertAppFromManifest(editor, 'notes-scratchpad');
    }
    default:
      return false;
  }
}
