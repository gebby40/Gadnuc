/**
 * Theme engine — maps a theme name to a set of CSS custom-property values.
 * The tenant's `storefront_settings.primary_color` and `accent_color` are
 * merged in at runtime to override the theme defaults.
 */

export type ThemeName = 'default' | 'dark' | 'minimal' | 'bold' | 'clean';

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
  '--color-nav-bg':      string;
  '--color-nav-text':    string;
  '--color-footer-bg':   string;
  '--color-footer-text': string;
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
    '--color-nav-bg':       '#0070f3',
    '--color-nav-text':     '#ffffff',
    '--color-footer-bg':    '#f5f5f5',
    '--color-footer-text':  '#6b7280',
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
    '--color-nav-bg':       '#0f0f0f',
    '--color-nav-text':     '#f0f0f0',
    '--color-footer-bg':    '#0a0a0a',
    '--color-footer-text':  '#888888',
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
    '--color-nav-bg':       '#fafafa',
    '--color-nav-text':     '#1f2937',
    '--color-footer-bg':    '#18181b',
    '--color-footer-text':  '#9ca3af',
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
    '--color-nav-bg':       '#7c3aed',
    '--color-nav-text':     '#ffffff',
    '--color-footer-bg':    '#000000',
    '--color-footer-text':  '#fef08a',
    '--radius-card':        '0px',
    '--shadow-card':        '4px 4px 0 #000',
    '--font-heading':       '"Impact", "Arial Black", sans-serif',
    '--font-body':          'system-ui, sans-serif',
  },
  clean: {
    '--color-bg':           '#ffffff',
    '--color-bg-secondary': '#f9fafb',
    '--color-surface':      '#ffffff',
    '--color-border':       '#f3f4f6',
    '--color-text':         '#111827',
    '--color-text-muted':   '#9ca3af',
    '--color-primary':      '#111827',
    '--color-primary-fg':   '#ffffff',
    '--color-accent':       '#111827',
    '--color-accent-fg':    '#ffffff',
    '--color-nav-bg':       '#ffffff',
    '--color-nav-text':     '#111827',
    '--color-footer-bg':    '#111827',
    '--color-footer-text':  '#d1d5db',
    '--radius-card':        '0px',
    '--shadow-card':        'none',
    '--font-heading':       "'Inter', system-ui, sans-serif",
    '--font-body':          "'Inter', system-ui, sans-serif",
  },
};

/**
 * Resolve theme variables, merging in tenant custom colours.
 */
export function resolveTheme(
  themeName: string | undefined,
  primaryColor?: string | null,
  accentColor?: string | null,
  navBgColor?: string | null,
  navTextColor?: string | null,
  footerBgColor?: string | null,
  footerTextColor?: string | null,
): ThemeVars {
  const base = themes[(themeName as ThemeName) ?? 'default'] ?? themes.default;
  return {
    ...base,
    ...(primaryColor    ? { '--color-primary':     primaryColor    } : {}),
    ...(accentColor     ? { '--color-accent':      accentColor     } : {}),
    ...(navBgColor      ? { '--color-nav-bg':      navBgColor      } : {}),
    ...(navTextColor    ? { '--color-nav-text':     navTextColor    } : {}),
    ...(footerBgColor   ? { '--color-footer-bg':   footerBgColor   } : {}),
    ...(footerTextColor ? { '--color-footer-text': footerTextColor } : {}),
  };
}

/**
 * Convert theme vars to an inline style object for React.
 */
export function themeToStyle(vars: ThemeVars): Record<string, string> {
  return vars as unknown as Record<string, string>;
}

/** Theme metadata for the appearance editor */
export const THEME_META: Record<ThemeName, { label: string; description: string }> = {
  default: { label: 'Default',   description: 'Classic blue with rounded cards' },
  dark:    { label: 'Dark',      description: 'Dark background with blue accent' },
  minimal: { label: 'Minimal',   description: 'Clean serif headings, subtle style' },
  bold:    { label: 'Bold',      description: 'High contrast with sharp edges' },
  clean:   { label: 'Clean',     description: 'Flat, borderless, modern e-commerce' },
};

export const THEME_NAMES: ThemeName[] = ['default', 'dark', 'minimal', 'bold', 'clean'];
