import { useContext } from 'react';

import { ThemeContext } from '../contexts/ThemeContext.js';

import type { ThemeContextValue } from '../contexts/ThemeContext.js';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return ctx;
}
