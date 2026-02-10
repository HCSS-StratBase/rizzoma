import { describe, it, expect } from 'vitest';

describe('client: TipTap editor integration', () => {
  it('EditorConfig exports required functions', { timeout: 30000 }, async () => {
    const module = await import('../client/components/editor/EditorConfig');
    expect(module.createYjsDocument).toBeDefined();
    expect(module.getEditorExtensions).toBeDefined();
    expect(module.defaultEditorProps).toBeDefined();
    expect(typeof module.createYjsDocument).toBe('function');
    expect(typeof module.getEditorExtensions).toBe('function');
  });
  
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
  
  it('useSocket hook exists', async () => {
    const module = await import('../client/hooks/useSocket');
    expect(module.useSocket).toBeDefined();
    expect(typeof module.useSocket).toBe('function');
  });

  it('getEditorExtensions includes TagNode and TaskWidgetNode', { timeout: 30000 }, async () => {
    const { getEditorExtensions } = await import('../client/components/editor/EditorConfig');
    const extensions = getEditorExtensions(undefined, undefined, {
      blipId: 'test-blip-id',
    });
    const names = extensions.map((e: any) => e.name);
    console.log('[TEST] Extension names:', names);
    expect(names).toContain('tag');
    expect(names).toContain('taskWidget');
    expect(names).toContain('mention');
  });

  it('TipTap editor resolves tag and taskWidget extensions', { timeout: 30000 }, async () => {
    const { getEditorExtensions } = await import('../client/components/editor/EditorConfig');
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
