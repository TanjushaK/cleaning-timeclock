"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, parseTheme, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme-config";

type ThemeCtx = {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

function detectTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const saved = parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    if (saved) return saved;
  } catch {
    // ignore
  }

  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);

  useEffect(() => {
    const initial = detectTheme();
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: DEFAULT_THEME as ThemeMode,
      setTheme: (_next: ThemeMode) => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}

