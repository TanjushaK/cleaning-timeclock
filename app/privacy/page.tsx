"use client";

import LegalShell from "@/app/_components/LegalShell";
import { useI18n } from "@/components/I18nProvider";

export default function PrivacyPage() {
  const { t } = useI18n();

  return (
    <LegalShell>
      <h1 className="text-xl font-semibold tracking-tight text-amber-200">{t("legal.privacy.title")}</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-300">
        <p>{t("legal.privacy.p1")}</p>
        <p>{t("legal.privacy.p2")}</p>
        <p>{t("legal.privacy.p3")}</p>
      </div>
    </LegalShell>
  );
}
