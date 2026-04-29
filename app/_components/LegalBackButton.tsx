"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";

export default function LegalBackButton() {
  const router = useRouter();
  const { t } = useI18n();
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
      className={
        isLight
          ? "mb-6 inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-amber-600/35 bg-white/85 px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:border-amber-700/50 hover:bg-white"
          : "mb-6 inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-amber-400/35 bg-black/35 px-3 py-2 text-sm font-medium text-amber-100 shadow-sm hover:border-amber-300/45 hover:bg-black/50"
      }
      aria-label={t("common.back")}
    >
      {t("common.back")}
    </button>
  );
}
