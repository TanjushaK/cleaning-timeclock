"use client";

import { useI18n } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] sm:gap-2 sm:px-3 sm:py-[4px] sm:text-[12px] ${
        isLight
          ? "border-amber-500/35 bg-white/85 text-zinc-800 hover:border-amber-600/55"
          : "border-amber-400/40 bg-black/40 text-zinc-100 hover:border-amber-300/60"
      }`}
      aria-label={t("common.themeToggle")}
      title={t("common.themeToggle")}
    >
      <span aria-hidden>{isLight ? "☀" : "🌙"}</span>
      <span className="hidden sm:inline">{isLight ? t("common.themeLight") : t("common.themeDark")}</span>
    </button>
  );
}

