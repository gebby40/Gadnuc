'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  type AuthUser,
  loadAuthState,
  saveAuthState,
  clearAuthState,
} from '../lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [token, setToken]       = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    const saved = loadAuthState();
    if (saved) {
      setToken(saved.token);
      setUser(saved.user);
    }
    setLoading(false);
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    saveAuthState(newToken, newUser);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearAuthState();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
