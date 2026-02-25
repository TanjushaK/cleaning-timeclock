"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "uk" | "ru";
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
  if (saved === "uk" || saved === "ru") return saved;
  const nav = String(navigator.language || "").toLowerCase();
  if (nav.startsWith("ru")) return "ru";
  return "uk";
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("uk");

  useEffect(() => {
    setLangState(detectInitialLang());
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem("ct_lang", l); } catch {}
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
      t: (k: string) => (DICTS.uk[k] ?? k),
    };
  }
  return ctx;
}
