'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ThemeVars } from '@/lib/themes';

const ThemeContext = createContext<ThemeVars | null>(null);

export function useTheme(): ThemeVars {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

interface ThemeProviderProps {
  vars:      ThemeVars;
  children:  ReactNode;
  className?: string;
}

/**
 * Wraps children in a div that injects CSS custom properties.
 * Applied once at the tenant layout level so all descendant components
 * can use `var(--color-primary)` etc. in Tailwind arbitrary values or
 * plain CSS.
 */
export function ThemeProvider({ vars, children, className }: ThemeProviderProps) {
  const style = vars as unknown as React.CSSProperties;
  return (
    <ThemeContext.Provider value={vars}>
      <div style={style} className={className ?? 'min-h-screen'}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
