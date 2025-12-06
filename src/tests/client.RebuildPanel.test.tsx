import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { ApiResponse } from '../client/lib/api';
import { RebuildPanel } from '../client/components/RebuildPanel';
import { api } from '../client/lib/api';
import { toast } from '../client/components/Toast';

vi.mock('../client/lib/api', () => ({
  api: vi.fn(),
}));

vi.mock('../client/components/Toast', () => ({
  toast: vi.fn(),
}));

const apiMock = api as unknown as Mock;
const toastMock = toast as unknown as Mock;

describe('client: RebuildPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderPanel = () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(<RebuildPanel waveId="w1" />); });
  };

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.mockReset();
    toastMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('polls queued job until completion and renders logs', async () => {
    const responses: ApiResponse[] = [
      { ok: true, status: 200, data: { status: 'idle', logs: [] } },
      { ok: true, status: 202, data: { status: 'queued', logs: [{ at: 1, message: 'queued', level: 'info' }], jobId: 'job1' } },
      { ok: true, status: 200, data: { status: 'running', logs: [{ at: 1, message: 'queued', level: 'info' }, { at: 2, message: 'running', level: 'info' }], jobId: 'job1', applied: 1 } },
      { ok: true, status: 200, data: { status: 'complete', logs: [{ at: 1, message: 'queued', level: 'info' }, { at: 2, message: 'running', level: 'info' }, { at: 3, message: 'done', level: 'info' }], jobId: 'job1', applied: 2 } },
    ];
    let last: ApiResponse = responses[responses.length - 1]!;
    apiMock.mockImplementation(async () => {
      const next = responses.shift();
      if (next) {
        last = next;
        return next;
      }
      return last;
    });
    renderPanel();
    await act(async () => {});
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(2100); });
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(container.textContent).toContain('Status: Complete');
    expect(container.textContent).toContain('Applied updates: 2');
    expect(container.textContent).toContain('queued');
  });

  it('shows toast when status fetch fails', async () => {
    apiMock.mockResolvedValueOnce({ ok: false, status: 500, data: { error: 'fail' } });
    renderPanel();
    await act(async () => {});
    expect(toastMock).toHaveBeenCalled();
  });

  it('renders retry button when job errors', async () => {
    apiMock
      .mockResolvedValueOnce({ ok: true, status: 200, data: { status: 'error', error: 'nope', logs: [{ at: 1, message: 'Error', level: 'error' }] } })
      .mockResolvedValueOnce({ ok: true, status: 202, data: { status: 'queued', logs: [{ at: 2, message: 'queued', level: 'info' }], jobId: 'job2' } });
    renderPanel();
    await act(async () => {});
    const retry = [...container.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Retry'));
    expect(retry).toBeTruthy();
    await act(async () => {
      retry!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
