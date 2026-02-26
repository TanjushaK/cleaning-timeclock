"use client";
import React from "react";
import { useI18n } from "./I18nProvider";

export default function LanguageSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+0rem)] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/40 px-2 py-[2px] text-[12px] backdrop-blur">
      <button
        type="button"
        onClick={() => setLang("uk")}
        className={lang === "uk" ? "text-amber-300" : "text-zinc-300 hover:text-amber-200"}
        aria-label="UA"
      >
        UA
      </button>
      <span className="text-zinc-500">|</span>
      <button
        type="button"
        onClick={() => setLang("ru")}
        className={lang === "ru" ? "text-amber-300" : "text-zinc-300 hover:text-amber-200"}
        aria-label="RU"
      >
        RU
      </button>
    </div>
  );
}
