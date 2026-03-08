// =============================================================================
// auth.tsx — Auth context and provider
// =============================================================================
// Manages authentication state across the app:
//   - On mount, tries to refresh the access token (using httpOnly cookie)
//   - Provides user object and login/logout functions to all components
//   - Stores user info in localStorage so it persists across page reloads
// =============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from './types.ts';
import * as api from './api.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const USER_STORAGE_KEY = 'grimoire-user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  // On mount, try to restore the session via refresh token
  useEffect(() => {
    async function restoreSession() {
      if (!localStorage.getItem(USER_STORAGE_KEY)) {
        setLoading(false);
        return;
      }
      const success = await api.tryRefresh();
      if (!success) {
        // Refresh failed — session expired
        setUser(null);
        localStorage.removeItem(USER_STORAGE_KEY);
      }
      setLoading(false);
    }
    restoreSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    setUser(data.user);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
