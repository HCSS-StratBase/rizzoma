// A picture pasted or dropped into a blip (a screenshot from the clipboard, an image file) is UPLOADED and inserted as
// an <img> that points at the stored file. Before, the browser inserted the picture as a data: URI inside the blip text:
// a normal screenshot (a few hundred KB to several MB) made the blip body larger than the server accepts (PUT /api/blips
// answered 413, express.json limit), the save failed silently, the picture showed until the next reload and then vanished
// (Liliia, 19 Nov 2026: "the screenshot ended elsewhere"). The insert position is tracked through every transaction while
// the upload runs, so a picture lands where the caret was, not where it is when the upload ends.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { uploadFile } from '../../../lib/upload';

export type ImagePasteUploadOptions = {
  blipId?: string;
  onError?: (message: string) => void;
};

type Pending = { id: number; pos: number };
const key = new PluginKey<Pending[]>('imagePasteUpload');

export function imageFilesOf(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const f of Array.from(data.files || [])) if (f.type.startsWith('image/')) files.push(f);
  if (!files.length) {
    for (const it of Array.from(data.items || [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) files.push(f); }
    }
  }
  return files;
}

export const ImagePasteUpload = Extension.create<ImagePasteUploadOptions>({
  name: 'imagePasteUpload',
  addOptions() { return { blipId: undefined, onError: undefined }; },
  addProseMirrorPlugins() {
    const opts = this.options;
    const editor = this.editor;
    let nextId = 1;
    const start = (view: import('@tiptap/pm/view').EditorView, files: File[], pos: number) => {
      if (!opts.blipId) return false;
      for (const file of files) {
        const id = nextId++;
        view.dispatch(view.state.tr.setMeta(key, { add: { id, pos } }));
        uploadFile(file, opts.blipId).then((res) => {
          const pending = key.getState(view.state)?.find((p) => p.id === id);
          const at = pending ? Math.min(pending.pos, view.state.doc.content.size) : view.state.selection.from;
          view.dispatch(view.state.tr.setMeta(key, { remove: id }));
          editor.chain().insertContentAt(at, { type: 'image', attrs: { src: res.url, alt: res.originalName || file.name } }).run();
        }).catch(() => {
          view.dispatch(view.state.tr.setMeta(key, { remove: id }));
          opts.onError?.('Failed to upload the picture');
        });
      }
      return true;
    };
    return [
      new Plugin<Pending[]>({
        key,
        state: {
          init: () => [],
          apply(tr, value) {
            let next = value.map((p) => ({ id: p.id, pos: tr.mapping.map(p.pos) }));
            const meta = tr.getMeta(key) as { add?: Pending; remove?: number } | undefined;
            if (meta?.add) next = [...next, meta.add];
            if (meta?.remove) next = next.filter((p) => p.id !== meta.remove);
            return next;
          },
        },
        props: {
          handlePaste: (view, event) => {
            const files = imageFilesOf(event.clipboardData);
            if (!files.length || !opts.blipId) return false;
            event.preventDefault();
            return start(view, files, view.state.selection.from);
          },
          handleDrop: (view, event) => {
            const files = imageFilesOf((event as DragEvent).dataTransfer);
            if (!files.length || !opts.blipId) return false;
            event.preventDefault();
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
            return start(view, files, at);
          },
        },
      }),
    ];
  },
});
