export interface Theme {
  name: string;
  colors: ThemeColors;
  borders: BorderStyle;
}

export interface ThemeColors {
  bg: string;
  fg: string;
  border: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  highlight: string;
  userMessage: string;
  assistantMessage: string;
  systemMessage: string;
}

export interface BorderStyle {
  type: 'line' | 'bg' | 'none';
  fg: string;
  bg: string;
}

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    bg: '#0a0a0a',
    fg: '#eeeeee',
    border: '#333333',
    primary: '#fab283',
    secondary: '#89b4fa',
    success: '#a6e3a1',
    warning: '#f9e2af',
    error: '#f38ba8',
    muted: '#6c7086',
    highlight: '#1e1e2e',
    userMessage: '#89b4fa',
    assistantMessage: '#a6e3a1',
    systemMessage: '#f9e2af',
  },
  borders: {
    type: 'line',
    fg: '#333333',
    bg: '#0a0a0a',
  },
};

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    bg: '#ffffff',
    fg: '#1a1a1a',
    border: '#e0e0e0',
    primary: '#d97706',
    secondary: '#2563eb',
    success: '#16a34a',
    warning: '#ca8a04',
    error: '#dc2626',
    muted: '#6b7280',
    highlight: '#f3f4f6',
    userMessage: '#2563eb',
    assistantMessage: '#16a34a',
    systemMessage: '#ca8a04',
  },
  borders: {
    type: 'line',
    fg: '#e0e0e0',
    bg: '#ffffff',
  },
};

let currentTheme: Theme = darkTheme;

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
}

export function getColors(): ThemeColors {
  return currentTheme.colors;
}

export function getBorders(): BorderStyle {
  return currentTheme.borders;
}

export function styleBox(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const theme = getTheme();
  return {
    style: {
      fg: theme.colors.fg,
      bg: theme.colors.bg,
      border: {
        fg: theme.borders.fg,
        bg: theme.borders.bg,
      },
      focus: {
        border: {
          fg: theme.colors.primary,
        },
      },
      ...overrides,
    },
  };
}
