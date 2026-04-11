"use client";

import React from "react";
import type { Lang } from "@/lib/i18n-config";
import { useI18n } from "./I18nProvider";

const ITEMS: Array<{ code: string; value: Lang }> = [
  { code: "UA", value: "uk" },
  { code: "RU", value: "ru" },
  { code: "EN", value: "en" },
  { code: "NL", value: "nl" },
];

export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  const languageLabel = t("common.language");

  return (
    <div className="fixed top-[max(0.5rem,calc(env(safe-area-inset-top)-0.5rem))] right-[calc(env(safe-area-inset-right)+0.75rem)] z-50 flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/40 px-2 py-[2px] text-[12px] backdrop-blur">
      <span className="pr-1 text-zinc-400">{languageLabel}</span>

      {ITEMS.map((item, idx) => {
        const itemLabel = t(`languages.${item.value}`);
        const active = lang === item.value;

        return (
          <React.Fragment key={item.value}>
            {idx > 0 ? <span className="text-zinc-500">|</span> : null}
            <button
              type="button"
              onClick={() => setLang(item.value)}
              className={active ? "text-amber-300" : "text-zinc-300 hover:text-amber-200"}
              aria-label={`${languageLabel}: ${itemLabel}`}
              aria-pressed={active}
              title={itemLabel}
            >
              {item.code}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
