"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANG,
  type Lang,
  LANG_STORAGE_KEY,
  langFromNavigatorLanguage,
  parseLang,
  SUPPORTED_LANGS,
} from "@/lib/i18n-config";
import { formatMessage } from "@/lib/format-message";
import { getMessage, messages } from "@/messages";

export type { Lang };

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function readCookieLang(): Lang | null {
  if (typeof document === "undefined") return null;

  const parts = document.cookie.split(";");

  for (const part of parts) {
    const index = part.indexOf("=");
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key !== LANG_STORAGE_KEY) continue;

    try {
      return parseLang(decodeURIComponent(value));
    } catch {
      return parseLang(value);
    }
  }

  return null;
}

function writeCookieLang(lang: Lang) {
  if (typeof document === "undefined") return;

  try {
    const secure = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = `${LANG_STORAGE_KEY}=${encodeURIComponent(lang)};path=/;max-age=${60 * 60 * 24 * 400};SameSite=Lax${secure ? ";Secure" : ""}`;
  } catch {
    // ignore
  }
}

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;

  const fromCookie = readCookieLang();
  if (fromCookie) return fromCookie;

  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    const parsed = parseLang(saved);
    if (parsed) return parsed;
  } catch {
    // ignore
  }

  return langFromNavigatorLanguage(navigator.language || "");
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const next = detectInitialLang();
    setLangState(next);
    writeCookieLang(next);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (nextLang: Lang) => {
    if (!SUPPORTED_LANGS.includes(nextLang)) return;

    setLangState(nextLang);

    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    } catch {
      // ignore
    }

    writeCookieLang(nextLang);
  };

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      const currentMessages = messages[lang] ?? messages[DEFAULT_LANG];
      const fallbackMessages = messages[DEFAULT_LANG];
      const raw = getMessage(currentMessages, key) ?? getMessage(fallbackMessages, key) ?? key;
      return formatMessage(raw, vars);
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);

  if (!ctx) {
    return {
      lang: DEFAULT_LANG as Lang,
      setLang: (_lang: Lang) => {},
      t: (key: string, vars?: Record<string, string | number>) => {
        const fallbackMessages = messages[DEFAULT_LANG];
        const raw = getMessage(fallbackMessages, key) ?? key;
        return formatMessage(raw, vars);
      },
    };
  }

  return ctx;
}