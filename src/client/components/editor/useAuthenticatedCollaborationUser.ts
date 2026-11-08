import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  collaborationUserFromAuth,
  type CollaborationUser,
} from './collaborationIdentity';

/**
 * Resolve the production auth context into the identity placed on Yjs
 * awareness. Topic-root, nested-blip, and generic editor collaboration all
 * use this one path so their cursor identity cannot drift independently.
 */
export function useAuthenticatedCollaborationUser(): CollaborationUser | null {
  const { user } = useAuth();
  return useMemo(
    () => user ? collaborationUserFromAuth(user) : null,
    [user],
  );
}
