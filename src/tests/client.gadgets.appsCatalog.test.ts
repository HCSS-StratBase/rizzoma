import { describe, expect, it } from 'vitest';
import { GADGET_APP_CATALOG, getAppManifest } from '../client/gadgets/apps/catalog';
import { describeSandboxedApp, createNoopHostApi } from '../client/gadgets/apps/runtime';

describe('client: gadget app runtime boundary', () => {
  it('keeps app catalog ids unique', () => {
    const ids = GADGET_APP_CATALOG.map((manifest) => manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes sandboxed apps with iframe runtime flags', () => {
    const manifest = getAppManifest('kanban-board');
    expect(manifest).toBeDefined();
    const descriptor = describeSandboxedApp(manifest!);
    expect(descriptor.sandbox).toContain('allow-scripts');
    expect(descriptor.allow).toContain('fullscreen');
  });

  it('stores default height and initial data on preview app manifests', () => {
    const manifest = getAppManifest('focus-timer');
    expect(manifest).toBeDefined();
    expect(manifest?.defaultHeight).toBe('420');
    expect(manifest?.initialData).toMatchObject({
      session: { label: 'Modernization sprint', duration: 25, state: 'ready' },
    });
  });

  it('provides a no-op host api contract', async () => {
    const hostApi = createNoopHostApi();
    await expect(hostApi.getNodeData()).resolves.toBeNull();
    await expect(hostApi.getUserContext()).resolves.toEqual({ userId: 'unknown', canEdit: false });
  });
});
