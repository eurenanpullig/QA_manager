import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { useTheme } from '../hooks/useTheme.js';
import { apiClient, triggerSessionRefresh } from '../services/apiClient.js';

import type { ThemeMode } from './ThemeContext.js';

export type UserRole = 'ADM' | 'LIDER_TESTES' | 'QA' | 'DEV';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  theme_preference: ThemeMode;
  font_scale_percent: number;
  is_active: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  savePreferences: (theme: ThemeMode, fontScalePercent: number) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Proactively refresh token every 50 minutes (before 1h TTL expires)
const PROACTIVE_REFRESH_INTERVAL_MS = 50 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { setTheme, setFontScalePercent } = useTheme();

  const applyUserPreferences = useCallback(
    (u: AuthUser): void => {
      setTheme(u.theme_preference);
      setFontScalePercent(u.font_scale_percent);
    },
    [setTheme, setFontScalePercent],
  );

  const refreshProfile = useCallback(async (): Promise<void> => {
    try {
      const res = await apiClient.get<{ user: AuthUser }>('/auth/profile');
      setUser(res.data.user);
      applyUserPreferences(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyUserPreferences]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const timer = window.setInterval(() => {
      void triggerSessionRefresh();
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [user]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const res = await apiClient.post<{ user: AuthUser }>('/auth/login', { email, password });
      const loggedUser = res.data.user;
      setUser(loggedUser);
      applyUserPreferences(loggedUser);
      return loggedUser;
    },
    [applyUserPreferences],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const savePreferences = useCallback(
    async (theme: ThemeMode, fontScalePercent: number): Promise<void> => {
      if (!user) {
        return;
      }
      try {
        const res = await apiClient.put<{ user: AuthUser }>('/auth/profile', {
          theme_preference: theme,
          font_scale_percent: fontScalePercent,
        });
        setUser(res.data.user);
      } catch {
        // Local UI preferences remain applied even if network call fails
      }
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshProfile,
      savePreferences,
    }),
    [user, loading, login, logout, refreshProfile, savePreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
