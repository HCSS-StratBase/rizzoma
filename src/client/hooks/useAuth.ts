import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import { offlineQueue } from '../lib/offlineQueue';
import { yjsDocManager } from '../components/editor/YjsDocumentManager';
import {
  announceAuthChange,
  AUTH_CHANGE_CHANNEL,
  AUTH_CHANGE_STORAGE_KEY,
  AUTH_TAB_ID,
} from '../lib/authSessionSignal';
import {
  disconnectSocketForAuthTransition,
  reconnectSocketAfterAuthTransition,
} from '../lib/socket';

export interface User {
  id: string;
  email?: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  /**
   * Optional controlled auth state. The production shell already owns the
   * `/api/auth/me` bootstrap so it passes that exact user here instead of
   * starting a second, divergent auth request inside the provider.
   */
  user?: User | null;
  /** Controlled auth-bootstrap state owned by the production shell. */
  loading?: boolean;
  onUserChange?: (user: User | null) => void;
}

export function AuthProvider({
  children,
  user: controlledUser,
  loading: controlledLoading,
  onUserChange,
}: AuthProviderProps) {
  const isControlled = controlledUser !== undefined;
  const [internalUser, setInternalUser] = useState<User | null>(null);
  const [internalLoading, setInternalLoading] = useState(!isControlled);
  const user = isControlled ? controlledUser : internalUser;
  const loading = isControlled ? (controlledLoading ?? false) : internalLoading;
  const previousCollaborationOwnerRef = useRef<string | null>(null);

  const updateUser = useCallback((nextUser: User | null) => {
    if (!isControlled) setInternalUser(nextUser);
    onUserChange?.(nextUser);
  }, [isControlled, onUserChange]);

  const refresh = useCallback(async () => {
    try {
      const response = await api('/api/auth/me');
      if (response.ok) {
        updateUser(response.data as User);
      } else {
        updateUser(null);
      }
    } catch {
      updateUser(null);
    } finally {
      if (!isControlled) setInternalLoading(false);
    }
  }, [isControlled, updateUser]);

  const login = useCallback(async (email: string, password: string) => {
    disconnectSocketForAuthTransition();
    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        updateUser(response.data as User);
        announceAuthChange({ resetSocket: false });
      } else {
        throw new Error(response.data.error || 'Login failed');
      }
    } finally {
      reconnectSocketAfterAuthTransition();
    }
  }, [updateUser]);

  const logout = useCallback(async () => {
    const currentUserId = user?.id || null;
    // Abort replay before invalidating the server session. The persisted
    // partition remains available if this same account signs in again.
    offlineQueue.deactivateUser();
    disconnectSocketForAuthTransition();
    try {
      const response = await api('/api/auth/logout', { method: 'POST' });
      // A 401 means the server session is already gone, which is the desired
      // postcondition. Retriable/CSRF failures keep the old local identity.
      if (!response.ok && response.status !== 401) throw new Error('Logout failed');
      updateUser(null);
      announceAuthChange({ resetSocket: false });
    } catch (error) {
      if (currentUserId) offlineQueue.activateUser(currentUserId);
      throw error;
    } finally {
      reconnectSocketAfterAuthTransition();
    }
  }, [updateUser, user?.id]);

  useEffect(() => {
    if (!isControlled) {
      disconnectSocketForAuthTransition();
      void refresh().finally(reconnectSocketAfterAuthTransition);
    }
  }, [isControlled, refresh]);

  useEffect(() => {
    const rebootstrap = () => {
      disconnectSocketForAuthTransition();
      void refresh().finally(reconnectSocketAfterAuthTransition);
    };
    const onBroadcast = (event: MessageEvent<{ sourceTabId?: string }>) => {
      if (event.data?.sourceTabId !== AUTH_TAB_ID) rebootstrap();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_CHANGE_STORAGE_KEY) rebootstrap();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('rizzoma:auth-session-mismatch', rebootstrap);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(AUTH_CHANGE_CHANNEL);
      channel.addEventListener('message', onBroadcast);
    } catch {}
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rizzoma:auth-session-mismatch', rebootstrap);
      channel?.removeEventListener('message', onBroadcast);
      channel?.close();
    };
  }, [refresh]);

  // AuthProvider is the single bridge between session bootstrap and offline
  // persistence. A queue partition is never loaded while auth is unresolved.
  useEffect(() => {
    offlineQueue.initialize();
    if (loading) {
      offlineQueue.deactivateUser();
      return;
    }
    offlineQueue.activateUser(user?.id || null);
  }, [loading, user?.id]);

  // CRDT documents are just as identity-sensitive as the REST mutation queue.
  // Child collaboration providers react to the new owner first; this parent
  // effect then destroys the previous owner's live docs and quarantines only
  // its unresolved snapshots under that same owner key.
  useEffect(() => {
    const nextOwnerId = loading ? null : (user?.id || null);
    const previousOwnerId = previousCollaborationOwnerRef.current;
    if (previousOwnerId && previousOwnerId !== nextOwnerId) {
      yjsDocManager.deactivateOwner(previousOwnerId);
    }
    previousCollaborationOwnerRef.current = nextOwnerId;
  }, [loading, user?.id]);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return (
    React.createElement(AuthContext.Provider, { value },
      children
    )
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Return a mock context for components that don't have AuthProvider
    return {
      user: null,
      loading: false,
      login: async () => {},
      logout: async () => {},
      refresh: async () => {}
    };
  }
  return context;
}
