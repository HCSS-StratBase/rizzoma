import { describe, it, expect, beforeAll } from 'vitest';

describe('client: TipTap editor integration', () => {
  // Warm the EditorConfig module once up-front with a generous timeout.
  // On WSL2 /mnt/c the cold transform of the full TipTap + lowlight +
  // Y.js dependency tree can take 60s+ the first time Vite encounters
  // it in a session; individual tests that import it afterwards run in
  // sub-second time. Without this warm-up the first test that imports
  // EditorConfig flakes against a 60s per-test timeout whenever the
  // suite is run from a cold transform cache.
  let editorConfigModule: typeof import('../client/components/editor/EditorConfig');
  beforeAll(async () => {
    editorConfigModule = await import('../client/components/editor/EditorConfig');
  }, 180000);

  it('YjsDocumentManager exports class', async () => {
    const module = await import('../client/components/editor/YjsDocumentManager');
    expect(module.YjsDocumentManager).toBeDefined();
    expect(module.yjsDocManager).toBeDefined();
    
    const manager = new module.YjsDocumentManager();
    expect(manager.getDocument).toBeDefined();
    expect(manager.removeDocument).toBeDefined();
    expect(manager.syncDocument).toBeDefined();
    expect(manager.getDocumentState).toBeDefined();
    expect(manager.applyUpdate).toBeDefined();
    expect(manager.destroy).toBeDefined();
  });
  
  it('CollaborativeProvider exports class', async () => {
    const module = await import('../client/components/editor/CollaborativeProvider');
    expect(module.SocketIOProvider).toBeDefined();
  });
  
  it('useSocket hook exists', { timeout: 60000 }, async () => {
    const module = await import('../client/hooks/useSocket');
    expect(module.useSocket).toBeDefined();
    expect(typeof module.useSocket).toBe('function');
  });

  it('EditorConfig exports required functions', () => {
    expect(editorConfigModule.createYjsDocument).toBeDefined();
    expect(editorConfigModule.getEditorExtensions).toBeDefined();
    expect(editorConfigModule.defaultEditorProps).toBeDefined();
    expect(typeof editorConfigModule.createYjsDocument).toBe('function');
    expect(typeof editorConfigModule.getEditorExtensions).toBe('function');
  });

  it('getEditorExtensions includes TagNode and TaskWidgetNode', () => {
    const { getEditorExtensions } = editorConfigModule;
    const extensions = getEditorExtensions(undefined, undefined, {
      blipId: 'test-blip-id',
    });
    const names = extensions.map((e: any) => e.name);
    console.log('[TEST] Extension names:', names);
    expect(names).toContain('tag');
    expect(names).toContain('taskWidget');
    expect(names).toContain('mention');
  });

  it('TipTap editor resolves tag and taskWidget extensions', { timeout: 60000 }, async () => {
    const { getEditorExtensions } = editorConfigModule;
    const tiptap = await import('@tiptap/core');
    const Editor = (tiptap as any).Editor;

    const extensions = getEditorExtensions(undefined, undefined, {
      blipId: 'test-blip-id',
    });

    // Create a headless TipTap editor
    const editor = new Editor({
      extensions,
      content: '<p>Hello world</p>',
    });

    const resolvedNames = editor.extensionManager.extensions.map((e: any) => e.name);
    console.log('[TEST] Resolved extension names:', resolvedNames);
    console.log('[TEST] Schema nodes:', Object.keys(editor.schema.nodes));

    expect(resolvedNames).toContain('tag');
    expect(resolvedNames).toContain('taskWidget');
    expect(Object.keys(editor.schema.nodes)).toContain('tag');
    expect(Object.keys(editor.schema.nodes)).toContain('taskWidget');

    editor.destroy();
  });
});
