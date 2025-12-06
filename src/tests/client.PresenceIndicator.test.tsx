import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PresenceIndicator } from '../client/components/PresenceIndicator';

describe('client: PresenceIndicator', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  it('renders loading, error, and empty ready states', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<PresenceIndicator label="Wave" status="loading" users={[]} />);
    });
    expect(container.textContent).toContain('Loading presence');

    act(() => {
      root.render(<PresenceIndicator label="Wave" status="error" users={[]} />);
    });
    expect(container.textContent).toContain('Presence offline');

    act(() => {
      root.render(<PresenceIndicator label="Wave" status="ready" users={[]} />);
    });
    expect(container.textContent).toContain('No one editing');
  });

  it('shows avatar initials and overflow counter', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const users = [
      { userId: 'u1', name: 'Alice Beta' },
      { userId: 'u2', name: 'Bob Carl' },
      { userId: 'u3', name: 'Chan' },
    ];

    act(() => {
      root.render(<PresenceIndicator label="Wave" status="ready" users={users} maxVisible={2} />);
    });
    const avatars = container.querySelectorAll('.presence-avatar');
    expect(avatars.length).toBe(2);
    expect(avatars[0]?.textContent).toBe('AB');
    expect(avatars[1]?.textContent).toBe('BC');
    expect(container.textContent).toContain('+1');
    expect(container.textContent).toContain('3');
  });
});
