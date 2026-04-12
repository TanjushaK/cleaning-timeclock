"use client";

import { useI18n } from "@/components/I18nProvider";

export default function AdminFooter() {
  const { t } = useI18n();
  return (
    <footer className="adminFooter">
      {t("admin.main.footerSlogan")} <span className="adminFooterYear">© 2026</span>
    </footer>
  );
}
