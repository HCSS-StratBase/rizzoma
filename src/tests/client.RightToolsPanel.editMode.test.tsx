import type { JSX } from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import {
  RightToolsPanel,
  EDIT_MODE_EVENT,
  BLIP_ACTIVE_EVENT,
} from '../client/components/RightToolsPanel';

vi.mock('../client/components/Toast', () => ({
  toast: vi.fn(),
}));

function renderElement(element: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe('client: RightToolsPanel edit-mode & active-blip isolation', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps active-blip-controls visible when a child blip mounts with isEditing=false while root is editing', () => {
    const { container, root } = renderElement(<RightToolsPanel isAuthed={true} />);

    expect(container.querySelector('.active-blip-controls')).toBeNull();

    // Topic root enters edit mode
    act(() => {
      window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, {
        detail: { isEditing: true, blipId: 'topic-root' },
      }));
    });
    expect(container.querySelector('.active-blip-controls')).not.toBeNull();
    expect(container.querySelector('[data-testid="right-tools-insert-gadget"]')).not.toBeNull();

    // Newly mounted inline child blips dispatch isEditing=false and active=false on mount
    act(() => {
      window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, {
        detail: { isEditing: false, blipId: 'topic-root:child-1' },
      }));
      window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
        detail: { active: false, blipId: 'topic-root:child-1' },
      }));
    });

    // Root's edit controls MUST remain visible
    expect(container.querySelector('.active-blip-controls')).not.toBeNull();
    expect(container.querySelector('.active-blip-control.insert-mention')).not.toBeNull();
    expect(container.querySelector('[data-testid="right-tools-insert-gadget"]')).not.toBeNull();

    // Only when the editing blip itself exits edit mode should controls hide
    act(() => {
      window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, {
        detail: { isEditing: false, blipId: 'topic-root' },
      }));
    });
    expect(container.querySelector('.active-blip-controls')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it('does not clear active editable state when a different non-active blip dispatches active=false', () => {
    const { container, root } = renderElement(<RightToolsPanel isAuthed={true} />);

    act(() => {
      window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
        detail: { active: true, blipId: 'blip-a' },
      }));
    });
    expect(container.querySelector('.active-blip-controls')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
        detail: { active: false, blipId: 'blip-b' },
      }));
    });
    expect(container.querySelector('.active-blip-controls')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
        detail: { active: false, blipId: 'blip-a' },
      }));
    });
    expect(container.querySelector('.active-blip-controls')).toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
