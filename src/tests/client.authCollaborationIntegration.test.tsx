import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthProvider, type User } from '../client/hooks/useAuth';
import { collaborationColorForUserId } from '../client/components/editor/collaborationIdentity';
import { useAuthenticatedCollaborationUser } from '../client/components/editor/useAuthenticatedCollaborationUser';

type Surface = 'topic-root' | 'nested-blip' | 'generic-editor';

function CollaborationSurfaceProbe({ surface }: { surface: Surface }): JSX.Element {
  const identity = useAuthenticatedCollaborationUser();
  return (
    <output data-surface={surface}>
      {identity ? JSON.stringify(identity) : 'none'}
    </output>
  );
}

describe('client: production auth to collaboration integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });

  it('propagates the shell-owned signed-in user to every collaboration surface', () => {
    const signedInUser: User = {
      id: 'account-alice-42',
      email: 'alice@example.test',
      name: 'Alice Production',
    };
    let setShellUser: (user: User | null) => void = () => {};

    function ProductionShellHarness(): JSX.Element {
      const [me, setMe] = useState<User | null>(signedInUser);
      setShellUser = setMe;
      return (
        <AuthProvider user={me} onUserChange={setMe}>
          <CollaborationSurfaceProbe surface="topic-root" />
          <CollaborationSurfaceProbe surface="nested-blip" />
          <CollaborationSurfaceProbe surface="generic-editor" />
        </AuthProvider>
      );
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<ProductionShellHarness />));

    const expected = {
      id: signedInUser.id,
      name: signedInUser.name,
      color: collaborationColorForUserId(signedInUser.id),
    };
    for (const surface of ['topic-root', 'nested-blip', 'generic-editor'] as const) {
      const probe = container.querySelector(`[data-surface="${surface}"]`);
      expect(JSON.parse(probe?.textContent || '{}')).toEqual(expected);
    }

    act(() => setShellUser(null));
    for (const surface of ['topic-root', 'nested-blip', 'generic-editor'] as const) {
      expect(container.querySelector(`[data-surface="${surface}"]`)?.textContent).toBe('none');
    }
  });

  it('uses the authenticated email consistently when an account has no display name', () => {
    const user: User = { id: 'account-email-fallback', email: 'fallback@example.test' };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <AuthProvider user={user}>
          <CollaborationSurfaceProbe surface="topic-root" />
        </AuthProvider>,
      );
    });

    const rendered = JSON.parse(
      container.querySelector('[data-surface="topic-root"]')?.textContent || '{}',
    );
    expect(rendered.name).toBe('fallback@example.test');
    expect(rendered.name).not.toMatch(/^User \d+$/);
  });
});
