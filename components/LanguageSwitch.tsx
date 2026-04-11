"use client";
import React from "react";
import { useI18n } from "./I18nProvider";

const ITEMS = [
  { code: "UA", value: "uk" as const },
  { code: "RU", value: "ru" as const },
  { code: "EN", value: "en" as const },
  { code: "NL", value: "nl" as const },
];

export default function LanguageSwitch() {
  const { lang, setLang } = useI18n();

  return (
    <div
      data-no-translate="true"
      className="fixed top-[max(0.5rem,calc(env(safe-area-inset-top)-0.5rem))] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/40 px-2 py-[2px] text-[12px] backdrop-blur"
    >
      {ITEMS.map((item, idx) => (
        <React.Fragment key={item.value}>
          {idx > 0 ? <span className="text-zinc-500">|</span> : null}
          <button
            type="button"
            onClick={() => setLang(item.value)}
            className={lang === item.value ? "text-amber-300" : "text-zinc-300 hover:text-amber-200"}
            aria-label={item.code}
          >
            {item.code}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
