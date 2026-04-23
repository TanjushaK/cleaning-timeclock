"use client";

import Link from "next/link";
import AppWorkerShell from "@/app/_components/AppWorkerShell";
import { useI18n } from "@/components/I18nProvider";

export default function NotFoundClient() {
  const { t } = useI18n();

  return (
    <AppWorkerShell mainClassName="px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-amber-500/25 bg-black/35 p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.20),0_0_70px_rgba(245,158,11,0.12),0_25px_90px_rgba(0,0,0,0.65)]">
        <h1 className="text-2xl font-semibold tracking-tight text-amber-50">{t("notFoundPage.title")}</h1>
        <p className="mt-2 text-amber-50/70">{t("notFoundPage.description")}</p>

        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15 px-5 text-base font-semibold text-amber-50 hover:bg-amber-500/20 active:scale-[0.99]"
          >
            {t("notFoundPage.home")}
          </Link>
        </div>
      </div>
    </AppWorkerShell>
  );
}
