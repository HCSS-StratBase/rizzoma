import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const inviteMocks = vi.hoisted(() => ({
  api: vi.fn(),
  ensureCsrf: vi.fn(async () => 'csrf'),
  toast: vi.fn(),
}));

vi.mock('../client/lib/api', () => ({ api: inviteMocks.api, ensureCsrf: inviteMocks.ensureCsrf }));
vi.mock('../client/components/Toast', () => ({ toast: inviteMocks.toast }));

import { CreateTopicModal } from '../client/components/CreateTopicModal';
import { InviteModal } from '../client/components/InviteModal';

describe('client invitation delivery feedback', () => {
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

  function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('clears the create-topic busy state after a network rejection', async () => {
    inviteMocks.api.mockRejectedValue(new Error('offline'));
    await act(async () => root.render(
      <CreateTopicModal isOpen onClose={vi.fn()} onTopicCreated={vi.fn()} />,
    ));
    await act(async () => setValue(container.querySelector('#topic-title')!, 'Secure topic'));
    const button = container.querySelector<HTMLButtonElement>('.btn-primary')!;

    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Create Topic');
    expect(inviteMocks.toast).toHaveBeenCalledWith('Topic creation could not reach the server. Please try again.', 'error');
  });

  it('reports partial invite delivery after creating the topic', async () => {
    inviteMocks.api.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        id: 'topic-1',
        invitations: [
          { email: 'sent@example.test', ok: true, status: 'sent' },
          { email: 'failed@example.test', ok: false, status: 'delivery_failed' },
        ],
      },
    });
    const onClose = vi.fn();
    const onTopicCreated = vi.fn();
    await act(async () => root.render(
      <CreateTopicModal isOpen onClose={onClose} onTopicCreated={onTopicCreated} />,
    ));
    await act(async () => {
      setValue(container.querySelector('#topic-title')!, 'Partial topic');
      setValue(container.querySelector('#participants')!, 'sent@example.test, failed@example.test, sent@example.test');
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-primary')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(inviteMocks.api).toHaveBeenCalledWith('/api/topics', expect.objectContaining({
      body: expect.stringContaining('"participants":["sent@example.test","failed@example.test"]'),
    }));
    const createBody = JSON.parse(inviteMocks.api.mock.calls.find(([path]) => path === '/api/topics')?.[1]?.body as string);
    expect(createBody.content).toBe('<h1>Partial topic</h1><ul><li><p></p></li></ul>');
    expect(inviteMocks.toast).toHaveBeenCalledWith(expect.stringContaining('1 invitation(s) delivered and 1 failed'), 'error');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onTopicCreated).toHaveBeenCalledWith('topic-1');
  });

  it('keeps InviteModal open with only failed recipients and labels private links honestly', async () => {
    inviteMocks.api.mockImplementation(async (path: string) => {
      if (path.endsWith('/sharing')) {
        return { ok: true, status: 200, data: { sharing: { shareLevel: 'private' } } };
      }
      return {
        ok: true,
        status: 200,
        data: {
          invited: [
            { email: 'sent@example.test', ok: true, status: 'pending' },
            { email: 'failed@example.test', ok: false, status: 'delivery_failed' },
          ],
        },
      };
    });
    const onClose = vi.fn();
    await act(async () => {
      root.render(<InviteModal isOpen onClose={onClose} topicId="topic-1" topicTitle="Topic" />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('does not grant access; invitation required');
    const emailInput = container.querySelector<HTMLInputElement>('#invite-emails')!;
    await act(async () => setValue(emailInput, 'sent@example.test, failed@example.test, sent@example.test'));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.modal-footer .btn-primary')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(emailInput.value).toBe('failed@example.test');
    expect(container.querySelector<HTMLButtonElement>('.modal-footer .btn-primary')!.disabled).toBe(false);
    expect(inviteMocks.toast).toHaveBeenCalledWith(expect.stringContaining('1 invitation(s) succeeded; 1 failed'), 'error');
  });
});
