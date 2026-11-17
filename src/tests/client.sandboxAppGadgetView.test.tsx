import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import {
  GADGET_START_TIMEOUT_MS,
  SandboxAppGadgetView,
} from '../client/components/editor/extensions/SandboxAppGadgetView';

/**
 * A sandboxed gadget frame that is blocked (CSP/CORS/CORP/404) never runs its script and
 * never talks to the host. That used to leave an empty white box (live Kanban gadget,
 * 2026-11-17). The host must tell the reader instead, as the original Rizzoma did
 * (.gadget-error + retry), and must treat the first authenticated frame message as "started".
 */
describe('SandboxAppGadgetView start watchdog', () => {
  let host: HTMLDivElement;
  let root: Root;

  const props = {
    node: {
      attrs: {
        appId: 'kanban-board',
        instanceId: 'app-1',
        title: 'Kanban Board',
        src: '/gadgets/apps/kanban-board/index.html',
        height: '430',
        data: JSON.stringify({ columns: [{ id: 'todo', title: 'To do', cards: ['a', 'b'] }] }),
      },
    },
    selected: false,
    editor: null,
    getPos: () => 1,
  };

  async function mount() {
    await act(async () => {
      root.render(
        <MantineProvider>
          <SandboxAppGadgetView {...props} />
        </MantineProvider>,
      );
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it('renders the sandboxed iframe without allow-same-origin', async () => {
    await mount();
    const frame = host.querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('/gadgets/apps/kanban-board/index.html');
    expect(frame?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(host.querySelector('[data-testid="gadget-app-error"]')).toBeNull();
  });

  it('shows an error with Retry when the frame never talks to the host, instead of a blank box', async () => {
    await mount();
    await act(async () => { vi.advanceTimersByTime(GADGET_START_TIMEOUT_MS + 50); });
    const error = host.querySelector('[data-testid="gadget-app-error"]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('did not start');
    expect(error?.textContent).toContain('Retry');
  });

  it('Retry reloads the frame and hides the error', async () => {
    await mount();
    await act(async () => { vi.advanceTimersByTime(GADGET_START_TIMEOUT_MS + 50); });
    const before = host.querySelector('iframe');
    const retry = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Retry'));
    expect(retry).toBeTruthy();
    await act(async () => { retry!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.querySelector('[data-testid="gadget-app-error"]')).toBeNull();
    // keyed iframe: a fresh element, so the page is fetched again
    expect(host.querySelector('iframe')).not.toBe(before);
  });

  it('does not show the error once the frame has sent an authenticated host message', async () => {
    await mount();
    const frame = host.querySelector('iframe') as HTMLIFrameElement;
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'null',
        source: frame.contentWindow,
        data: { scope: 'rizzoma-gadget', type: 'host.getNodeData', requestId: '1' },
      }));
    });
    await act(async () => { vi.advanceTimersByTime(GADGET_START_TIMEOUT_MS + 50); });
    expect(host.querySelector('[data-testid="gadget-app-error"]')).toBeNull();
  });

  it('ignores messages from another source or origin (they do not prove the frame started)', async () => {
    await mount();
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://evil.example',
        source: window,
        data: { scope: 'rizzoma-gadget', type: 'host.getNodeData', requestId: '1' },
      }));
    });
    await act(async () => { vi.advanceTimersByTime(GADGET_START_TIMEOUT_MS + 50); });
    expect(host.querySelector('[data-testid="gadget-app-error"]')).not.toBeNull();
  });
});
