"use client";
import React from "react";
import { useI18n } from "./I18nProvider";

export default function LanguageSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-50 flex items-center gap-2 rounded-full border border-amber-400/40 bg-black/40 px-3 py-1 text-xs backdrop-blur">
      <button type="button" onClick={() => setLang("uk")} className={lang === "uk" ? "text-amber-300" : "text-zinc-300 hover:text-amber-200"}>
        UA
      </button>
      <span className="text-zinc-500">|</span>
      <button type="button" onClick={() => setLang("ru")} className={lang === "ru" ? "text-amber-300" : "text-zinc-300 hover:text-amber-200"}>
        RU
      </button>
    </div>
  );
}
