import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ShareModal } from '../client/components/ShareModal';
import { api, ensureCsrf } from '../client/lib/api';
import { toast } from '../client/components/Toast';

vi.mock('../client/lib/api', () => ({
  api: vi.fn(),
  ensureCsrf: vi.fn(),
}));

vi.mock('../client/components/Toast', () => ({
  toast: vi.fn(),
}));

const apiMock = api as unknown as Mock;
const ensureCsrfMock = ensureCsrf as unknown as Mock;
const toastMock = toast as unknown as Mock;

describe('client: ShareModal persisted policy', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onClose: () => void;
  let onCloseSpy: Mock;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    apiMock.mockReset();
    ensureCsrfMock.mockReset();
    toastMock.mockReset();
    onCloseSpy = vi.fn();
    onClose = onCloseSpy as () => void;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderModal(): void {
    act(() => {
      root.render(
        <ShareModal
          isOpen
          onClose={onClose}
          topicId="topic-1"
          topicTitle="Policy test"
        />,
      );
    });
  }

  it('hydrates the saved policy and persists an owner change', async () => {
    apiMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          sharing: { shareLevel: 'public', allowComments: true, allowEdits: false },
          canManage: true,
        },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { sharing: { shareLevel: 'link' } } });
    ensureCsrfMock.mockResolvedValue('csrf');

    renderModal();
    await act(async () => {});

    const publicRadio = container.querySelector('input[value="public"]') as HTMLInputElement;
    const linkRadio = container.querySelector('input[value="link"]') as HTMLInputElement;
    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Save Settings')!;
    expect(publicRadio.checked).toBe(true);
    expect(save.disabled).toBe(false);

    act(() => linkRadio.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => save.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(ensureCsrfMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenLastCalledWith('/api/waves/topic-1/sharing', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ shareLevel: 'link', allowComments: true, allowEdits: false }),
    }));
    expect(toastMock).toHaveBeenCalledWith('Sharing settings updated');
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the policy cannot be loaded', async () => {
    apiMock.mockResolvedValueOnce({ ok: false, status: 503, data: { error: 'unavailable' } });
    renderModal();
    await act(async () => {});

    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Save Settings') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  });
});
