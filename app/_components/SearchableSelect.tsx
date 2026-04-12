'use client'

import { useI18n } from '@/components/I18nProvider'

/** Shared “no results” line for searchable dropdowns (admin + app). */
export default function SearchableSelectEmpty() {
  const { t } = useI18n()
  return <div className="px-2 py-2 text-sm text-zinc-400">{t('search.empty')}</div>
}
