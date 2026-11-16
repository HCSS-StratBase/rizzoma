import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ErrorBoundary } from '../client/components/ErrorBoundary';
import { PollGadgetView } from '../client/components/editor/extensions/PollGadgetView';
import { computeDiff } from '../client/lib/htmlDiff';

describe('Milestone 1 safety hardening', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
    vi.restoreAllMocks();
  });

  it('catches subtree render crashes in ErrorBoundary without unmounting the shell', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('boom_gadget');
    };

    await act(async () => {
      root.render(
        <ErrorBoundary fallbackTitle="Widget crashed">
          <Boom />
        </ErrorBoundary>,
      );
    });

    const alert = host.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Widget crashed');
    expect(alert?.textContent).toContain('boom_gadget');
  });

  it('does not crash PollGadgetView when options JSON is malformed or non-array', async () => {
    const fakeProps = {
      node: { attrs: { question: 'Q?', options: '{not-valid-json' } },
      updateAttributes: vi.fn(),
      selected: false,
      editor: { isEditable: true },
    };

    await act(async () => {
      root.render(
        <MantineProvider>
          <PollGadgetView {...fakeProps} />
        </MantineProvider>,
      );
    });

    const questionInput = host.querySelector('input') as HTMLInputElement | null;
    expect(questionInput?.value).toBe('Q?');
    expect(host.textContent).toContain('0 total votes');
  });

  it('escapes HTML entities in computeDiff output', () => {
    const diff = computeDiff('<p>hello &lt;script&gt;</p>', '<p>hello <b>world</b> &lt;img&gt;</p>');
    expect(diff).not.toContain('<img');
    expect(diff).toContain('&lt;img&gt;');
  });
});
