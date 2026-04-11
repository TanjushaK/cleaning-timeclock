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

export type { Lang };

type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = {
  uk: {
    login: "Вхід",
    email: "Електронна пошта",
    password: "Пароль",
    jobs: "Зміни",
    profile: "Профіль",
    accept: "Прийняти",
    start: "Почати",
    stop: "Завершити",
    admin_panel: "Панель адміністратора",
    workers: "Працівники",
    create_shift: "Створити зміну",
    filters: "Фільтри",
    logout: "Вийти",
    navigation: "Навігація",
    language: "Мова",
  },
  ru: {
    login: "Вход",
    email: "Электронная почта",
    password: "Пароль",
    jobs: "Смены",
    profile: "Профиль",
    accept: "Принять",
    start: "Старт",
    stop: "Стоп",
    admin_panel: "Панель администратора",
    workers: "Работники",
    create_shift: "Создать смену",
    filters: "Фильтры",
    logout: "Выйти",
    navigation: "Навигация",
    language: "Язык",
  },
  en: {
    login: "Sign in",
    email: "Email",
    password: "Password",
    jobs: "Shifts",
    profile: "Profile",
    accept: "Accept",
    start: "Start",
    stop: "Stop",
    admin_panel: "Admin panel",
    workers: "Workers",
    create_shift: "Create shift",
    filters: "Filters",
    logout: "Log out",
    navigation: "Navigation",
    language: "Language",
  },
  nl: {
    login: "Inloggen",
    email: "E-mail",
    password: "Wachtwoord",
    jobs: "Diensten",
    profile: "Profiel",
    accept: "Accepteren",
    start: "Start",
    stop: "Stop",
    admin_panel: "Beheerpaneel",
    workers: "Medewerkers",
    create_shift: "Dienst maken",
    filters: "Filters",
    logout: "Uitloggen",
    navigation: "Navigatie",
    language: "Taal",
  },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function readCookieLang(): Lang | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === LANG_STORAGE_KEY) {
      try {
        return parseLang(decodeURIComponent(v));
      } catch {
        return parseLang(v);
      }
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
    const p = parseLang(saved);
    if (p) return p;
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

  const setLang = (l: Lang) => {
    if (!SUPPORTED_LANGS.includes(l)) return;
    setLangState(l);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      // ignore
    }
    writeCookieLang(l);
  };

  const t = useMemo(() => {
    return (key: string) => {
      const dict = DICTS[lang] || DICTS[DEFAULT_LANG];
      return dict[key] ?? key;
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
      setLang: (_l: Lang) => {},
      t: (k: string) => DICTS[DEFAULT_LANG][k] ?? k,
    };
  }
  return ctx;
}
