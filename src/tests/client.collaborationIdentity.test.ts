import { describe, expect, it } from 'vitest';
import {
  anonymousCollaborationUser,
  collaborationColorForUserId,
  collaborationUserFromAuth,
} from '../client/components/editor/collaborationIdentity';

describe('client: collaboration identity', () => {
  it('builds a named cursor identity from the authenticated user', () => {
    const identity = collaborationUserFromAuth({
      id: 'user-alice-42',
      email: 'alice@example.com',
      name: 'Alice Example',
    });

    expect(identity).toEqual({
      id: 'user-alice-42',
      name: 'Alice Example',
      color: collaborationColorForUserId('user-alice-42'),
    });
    expect(identity.name).not.toMatch(/^User \d+$/);
  });

  it('falls back to the authenticated email and keeps colour deterministic', () => {
    const first = collaborationUserFromAuth({
      id: 'opaque:9e124f70-identity',
      email: 'bob@example.com',
    });
    const second = collaborationUserFromAuth({
      id: 'opaque:9e124f70-identity',
      email: 'bob@example.com',
    });

    expect(first.name).toBe('bob@example.com');
    expect(first.color).toBe(second.color);
    expect(first.name).not.toMatch(/^User \d+$/);
  });

  it('uses an honest anonymous label instead of inventing a numbered user', () => {
    const anonymous = anonymousCollaborationUser(123456);
    expect(anonymous.name).toBe('Anonymous');
    expect(anonymous.name).not.toMatch(/^User \d+$/);
  });
});
