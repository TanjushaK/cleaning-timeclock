export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "ct_theme";
export const DEFAULT_THEME: ThemeMode = "dark";

const THEME_SET = new Set<ThemeMode>(["dark", "light"]);

export function parseTheme(value: string | null | undefined): ThemeMode | null {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return THEME_SET.has(normalized as ThemeMode) ? (normalized as ThemeMode) : null;
}

