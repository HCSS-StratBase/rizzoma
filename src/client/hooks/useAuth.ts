import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';

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
  onUserChange?: (user: User | null) => void;
}

export function AuthProvider({ children, user: controlledUser, onUserChange }: AuthProviderProps) {
  const isControlled = controlledUser !== undefined;
  const [internalUser, setInternalUser] = useState<User | null>(null);
  const [internalLoading, setInternalLoading] = useState(!isControlled);
  const user = isControlled ? controlledUser : internalUser;
  const loading = isControlled ? false : internalLoading;

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
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      updateUser(response.data as User);
    } else {
      throw new Error(response.data.error || 'Login failed');
    }
  }, [updateUser]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    updateUser(null);
  }, [updateUser]);

  useEffect(() => {
    if (!isControlled) void refresh();
  }, [isControlled, refresh]);

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
