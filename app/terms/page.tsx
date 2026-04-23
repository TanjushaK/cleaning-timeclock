"use client";

import LegalShell from "@/app/_components/LegalShell";
import { useI18n } from "@/components/I18nProvider";

export default function TermsPage() {
  const { t } = useI18n();

  return (
    <LegalShell>
      <h1 className="text-xl font-semibold tracking-tight text-amber-200">{t("legal.terms.title")}</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-300">
        <p>{t("legal.terms.p1")}</p>
        <p>{t("legal.terms.p2")}</p>
        <p>{t("legal.terms.p3")}</p>
      </div>
    </LegalShell>
  );
}
