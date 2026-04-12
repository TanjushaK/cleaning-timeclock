'use client'

import { useI18n } from '@/components/I18nProvider'

export default function AdminFooterClient() {
  const { t } = useI18n()
  return (
    <>
      {t('admin.common.footerTagline')}{' '}
      <span className="adminFooterYear">{t('admin.common.yearCopy', { year: 2026 })}</span>
    </>
  )
}
