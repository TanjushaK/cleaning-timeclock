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
      className={`fixed top-[max(0.5rem,calc(env(safe-area-inset-top)-0.5rem))] left-[calc(env(safe-area-inset-left)+0.75rem)] z-50 flex items-center gap-2 rounded-full border px-3 py-[4px] text-[12px] backdrop-blur ${
        isLight
          ? "border-amber-500/35 bg-white/85 text-zinc-800 hover:border-amber-600/55"
          : "border-amber-400/40 bg-black/40 text-zinc-100 hover:border-amber-300/60"
      }`}
      aria-label={t("common.themeToggle")}
      title={t("common.themeToggle")}
    >
      <span aria-hidden>{isLight ? "☀" : "🌙"}</span>
      <span>{isLight ? t("common.themeLight") : t("common.themeDark")}</span>
    </button>
  );
}

