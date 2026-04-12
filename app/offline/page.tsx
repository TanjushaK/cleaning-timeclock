"use client";

import { useI18n } from "@/components/I18nProvider";

export default function OfflinePage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-[#120805] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-black/40 p-6 shadow-xl">
        <div className="text-2xl font-semibold text-amber-400">{t("offlinePage.title")}</div>
        <div className="mt-3 text-sm text-white/80">{t("offlinePage.body")}</div>
        <button
          className="mt-5 w-full rounded-xl bg-amber-500 px-4 py-3 font-semibold text-black hover:bg-amber-400 active:scale-[0.99]"
          onClick={() => window.location.reload()}
        >
          {t("offlinePage.retry")}
        </button>
      </div>
    </main>
  );
}
