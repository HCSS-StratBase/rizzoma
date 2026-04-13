import type { GadgetInsertDetail } from './types';
import { createDefaultPollAttrs } from './defaults';
import { getGadgetManifest } from './registry';
import { resolveGadgetUrl } from './embedAdapters';
import { getAppManifest } from './apps/catalog';

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
      return editor.chain().focus().insertContent({
        type: 'embedFrameGadget',
        attrs: {
          title: 'YouTube',
          provider: 'youtube',
          width: '560',
          height: '315',
          src: youtube.normalizedUrl,
        },
      }).run();
    }
    case 'code':
      return editor.chain().focus().toggleCodeBlock().run();
    case 'poll':
      return editor.chain().focus().insertContent({
        type: 'pollGadget',
        attrs: createDefaultPollAttrs(),
      }).run();
    case 'latex':
      return editor.chain().focus().insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: '$$  $$' }],
      }).run();
    case 'iframe':
    case 'spreadsheet': {
      if (!url) return false;
      const embed = resolveGadgetUrl(manifest.type, url);
      return editor.chain().focus().insertContent({
        type: 'embedFrameGadget',
        attrs: {
          title: manifest.type === 'spreadsheet' ? 'Spreadsheet' : 'Embedded content',
          provider: manifest.type,
          width: manifest.type === 'spreadsheet' ? '720' : '600',
          height: manifest.type === 'spreadsheet' ? '420' : '400',
          src: embed.normalizedUrl,
        },
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
