/**
 * Theme engine — maps a theme name to a set of CSS custom-property values.
 * The tenant's `storefront_settings.primary_color` and `accent_color` are
 * merged in at runtime to override the theme defaults.
 */

export type ThemeName = 'default' | 'dark' | 'minimal' | 'bold';

export interface ThemeVars {
  '--color-bg':          string;
  '--color-bg-secondary':string;
  '--color-surface':     string;
  '--color-border':      string;
  '--color-text':        string;
  '--color-text-muted':  string;
  '--color-primary':     string;
  '--color-primary-fg':  string;
  '--color-accent':      string;
  '--color-accent-fg':   string;
  '--radius-card':       string;
  '--shadow-card':       string;
  '--font-heading':      string;
  '--font-body':         string;
}

const themes: Record<ThemeName, ThemeVars> = {
  default: {
    '--color-bg':           '#ffffff',
    '--color-bg-secondary': '#f5f5f5',
    '--color-surface':      '#ffffff',
    '--color-border':       '#e5e7eb',
    '--color-text':         '#111827',
    '--color-text-muted':   '#6b7280',
    '--color-primary':      '#0070f3',
    '--color-primary-fg':   '#ffffff',
    '--color-accent':       '#ff4f4f',
    '--color-accent-fg':    '#ffffff',
    '--radius-card':        '12px',
    '--shadow-card':        '0 2px 8px rgba(0,0,0,0.08)',
    '--font-heading':       'system-ui, sans-serif',
    '--font-body':          'system-ui, sans-serif',
  },
  dark: {
    '--color-bg':           '#0f0f0f',
    '--color-bg-secondary': '#1a1a1a',
    '--color-surface':      '#1e1e1e',
    '--color-border':       '#2d2d2d',
    '--color-text':         '#f0f0f0',
    '--color-text-muted':   '#888888',
    '--color-primary':      '#3b82f6',
    '--color-primary-fg':   '#ffffff',
    '--color-accent':       '#f97316',
    '--color-accent-fg':    '#ffffff',
    '--radius-card':        '10px',
    '--shadow-card':        '0 2px 12px rgba(0,0,0,0.4)',
    '--font-heading':       'system-ui, sans-serif',
    '--font-body':          'system-ui, sans-serif',
  },
  minimal: {
    '--color-bg':           '#fafafa',
    '--color-bg-secondary': '#f0f0f0',
    '--color-surface':      '#ffffff',
    '--color-border':       '#d1d5db',
    '--color-text':         '#1f2937',
    '--color-text-muted':   '#9ca3af',
    '--color-primary':      '#18181b',
    '--color-primary-fg':   '#ffffff',
    '--color-accent':       '#22c55e',
    '--color-accent-fg':    '#ffffff',
    '--radius-card':        '4px',
    '--shadow-card':        'none',
    '--font-heading':       'Georgia, serif',
    '--font-body':          'system-ui, sans-serif',
  },
  bold: {
    '--color-bg':           '#ffffff',
    '--color-bg-secondary': '#fef08a',
    '--color-surface':      '#ffffff',
    '--color-border':       '#000000',
    '--color-text':         '#000000',
    '--color-text-muted':   '#444444',
    '--color-primary':      '#7c3aed',
    '--color-primary-fg':   '#ffffff',
    '--color-accent':       '#dc2626',
    '--color-accent-fg':    '#ffffff',
    '--radius-card':        '0px',
    '--shadow-card':        '4px 4px 0 #000',
    '--font-heading':       '"Impact", "Arial Black", sans-serif',
    '--font-body':          'system-ui, sans-serif',
  },
};

/**
 * Resolve theme variables, merging in tenant custom colours.
 */
export function resolveTheme(
  themeName: string | undefined,
  primaryColor?: string | null,
  accentColor?: string | null,
): ThemeVars {
  const base = themes[(themeName as ThemeName) ?? 'default'] ?? themes.default;
  return {
    ...base,
    ...(primaryColor ? { '--color-primary': primaryColor } : {}),
    ...(accentColor  ? { '--color-accent':  accentColor  } : {}),
  };
}

/**
 * Convert theme vars to an inline style object for React.
 */
export function themeToStyle(vars: ThemeVars): Record<string, string> {
  return vars as unknown as Record<string, string>;
}
