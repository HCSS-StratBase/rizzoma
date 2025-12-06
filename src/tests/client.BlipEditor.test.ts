import { describe, it, expect } from 'vitest';

describe('client: TipTap editor integration', () => {
  it('EditorConfig exports required functions', { timeout: 15000 }, async () => {
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
});
