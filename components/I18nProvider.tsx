"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "uk" | "ru" | "en" | "nl";
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

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "uk";
  const saved = window.localStorage.getItem("ct_lang");
  if (saved === "uk" || saved === "ru" || saved === "en" || saved === "nl") return saved;
  const nav = String(navigator.language || "").toLowerCase();
  if (nav.startsWith("ru")) return "ru";
  if (nav.startsWith("uk") || nav.startsWith("ua")) return "uk";
  if (nav.startsWith("nl")) return "nl";
  if (nav.startsWith("en")) return "en";
  return "uk";
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uk");

  useEffect(() => {
    setLangState(detectInitialLang());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("ct_lang", l);
    } catch {}
  };

  const t = useMemo(() => {
    return (key: string) => {
      const dict = DICTS[lang] || DICTS.uk;
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
      lang: "uk" as Lang,
      setLang: (_l: Lang) => {},
      t: (k: string) => DICTS.uk[k] ?? k,
    };
  }
  return ctx;
}
