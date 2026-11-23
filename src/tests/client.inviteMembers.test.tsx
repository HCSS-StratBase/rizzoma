import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  ensureCsrf: vi.fn(async () => 'csrf'),
  toast: vi.fn(),
}));

vi.mock('../client/lib/api', () => ({ api: mocks.api, ensureCsrf: mocks.ensureCsrf }));
vi.mock('../client/components/Toast', () => ({ toast: mocks.toast }));

import { InviteModal } from '../client/components/InviteModal';

const members = [
  { id: 'p-owner', name: 'Owner One', email: 'owner@example.com', role: 'owner', status: 'accepted' },
  { id: 'p-two', name: 'Member Two', email: 'two@example.com', role: 'editor', status: 'accepted' },
  { id: 'p-nameless', name: '', email: 'nobody@example.com', role: 'editor', status: 'pending' },
  { id: 'p-gone', name: 'Gone Three', email: 'three@example.com', role: 'editor', status: 'declined' },
];

function routeApi(canManage: boolean) {
  mocks.api.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (url.includes('/contacts/suggest')) return { ok: true, status: 200, data: { contacts: [] } };
    if (url.includes('/sharing')) return { ok: true, status: 200, data: { sharing: { shareLevel: 'private' } } };
    if (url.endsWith('/participants') && !init?.method) return { ok: true, status: 200, data: { participants: members, canManage } };
    return { ok: true, status: 200, data: {} };
  });
}

describe('Invite dialog: Select role and Remove', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function open(canManage: boolean) {
    routeApi(canManage);
    await act(async () => root.render(<InviteModal isOpen onClose={vi.fn()} topicId="t1" topicTitle="T" />));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  }
  const tick = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  const checkboxFor = (name: string) =>
    Array.from(container.querySelectorAll('.invite-member-row'))
      .find((row) => row.textContent?.includes(name))!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

  it('does not list a declined (removed) member', async () => {
    await open(true);
    expect(container.textContent).toContain('Member Two');
    expect(container.textContent).not.toContain('Gone Three');
  });

  it('names a member without a display name by the e-mail local part, never "Participant"', async () => {
    await open(true);
    const row = Array.from(container.querySelectorAll('.invite-member-row')).find((r) => r.textContent?.includes('nobody@example.com'))!;
    expect(row.querySelector('.invite-member-name')?.textContent).toBe('nobody');
  });

  it('hides Select role and Remove from anyone who is not allowed to manage members', async () => {
    await open(false);
    expect(container.querySelector('[data-testid="invite-select-role"]')).toBeNull();
    expect(container.querySelector('[data-testid="invite-remove"]')).toBeNull();
  });

  it('sets the role of the ticked member with a PATCH and reloads the list', async () => {
    await open(true);
    await act(async () => checkboxFor('Member Two').click());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="invite-select-role"]')!.click());
    const menu = container.querySelector('[data-testid="invite-role-menu"]')!;
    expect(Array.from(menu.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Editor', 'Commenter', 'Reader']);
    await act(async () => menu.querySelector<HTMLButtonElement>('[data-role="viewer"]')!.click());
    await tick();
    const patch = mocks.api.mock.calls.find((c) => c[1]?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/waves/t1/participants/p-two');
    expect(JSON.parse(patch![1].body)).toEqual({ role: 'viewer' });
    const listCalls = mocks.api.mock.calls.filter((c) => String(c[0]).endsWith('/participants') && !c[1]?.method);
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('never sends the owner to the server and says so', async () => {
    await open(true);
    await act(async () => checkboxFor('Owner One').click());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="invite-remove"]')!.click());
    expect(mocks.api.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith('The owner cannot be removed', 'error');
  });

  it('removes the ticked member with a DELETE after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await open(true);
    await act(async () => checkboxFor('Member Two').click());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="invite-remove"]')!.click());
    await tick();
    const del = mocks.api.mock.calls.find((c) => c[1]?.method === 'DELETE');
    expect(del?.[0]).toBe('/api/waves/t1/participants/p-two');
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('does nothing when the confirmation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open(true);
    await act(async () => checkboxFor('Member Two').click());
    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="invite-remove"]')!.click());
    expect(mocks.api.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
    confirm.mockRestore();
  });
});
