import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'LIGHT' | 'DARK';

export interface ThemeContextValue {
  theme: ThemeMode;
  fontScalePercent: number;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  setFontScalePercent: (scale: number) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_THEME_KEY = 'gt_theme_preference';
const STORAGE_FONT_SCALE_KEY = 'gt_font_scale_percent';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    return saved === 'LIGHT' || saved === 'DARK' ? saved : 'DARK';
  });

  const [fontScalePercent, setFontScaleState] = useState<number>(() => {
    const saved = Number(localStorage.getItem(STORAGE_FONT_SCALE_KEY));
    return Number.isInteger(saved) && saved >= 80 && saved <= 150 ? saved : 100;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const clamped = Math.min(150, Math.max(80, Math.round(fontScalePercent)));
    document.documentElement.style.fontSize = `${clamped}%`;
    localStorage.setItem(STORAGE_FONT_SCALE_KEY, String(clamped));
  }, [fontScalePercent]);

  const setTheme = useCallback((mode: ThemeMode): void => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback((): void => {
    setThemeState((prev) => (prev === 'DARK' ? 'LIGHT' : 'DARK'));
  }, []);

  const setFontScalePercent = useCallback((scale: number): void => {
    const clamped = Math.min(150, Math.max(80, Math.round(scale)));
    setFontScaleState(clamped);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      fontScalePercent,
      setTheme,
      toggleTheme,
      setFontScalePercent,
    }),
    [theme, fontScalePercent, setTheme, toggleTheme, setFontScalePercent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
