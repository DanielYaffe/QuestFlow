import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import api from '../api/axiosInstance';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
}

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithTokens: (token: string, refreshToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadAuth(): AuthState {
  return {
    token: localStorage.getItem('token'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadAuth);

  const persist = useCallback((token: string, refreshToken: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    setAuth({ token, refreshToken });
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setAuth({ token: null, refreshToken: null });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; refreshToken: string }>('/auth/login', { email, password });
    persist(res.data.token, res.data.refreshToken);
  }, [persist]);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; refreshToken: string }>('/auth/register', { email, password });
    persist(res.data.token, res.data.refreshToken);
  }, [persist]);

  const loginWithTokens = useCallback((token: string, refreshToken: string) => {
    persist(token, refreshToken);
  }, [persist]);

  const logout = useCallback(async () => {
    const rt = localStorage.getItem('refreshToken');
    if (rt) {
      try {
        await api.post('/auth/logout', { refreshToken: rt });
      } catch {
        // ignore — clear locally regardless
      }
    }
    clear();
  }, [clear]);

  return (
    <AuthContext.Provider value={{
      token: auth.token,
      isAuthenticated: !!auth.token,
      login,
      register,
      loginWithTokens,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
