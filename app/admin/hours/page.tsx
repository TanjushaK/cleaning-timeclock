'use client'

import Link from 'next/link'
import { useI18n } from '@/components/I18nProvider'

export default function AdminHoursPage() {
  const { t } = useI18n()
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
      <h1 className="text-2xl font-semibold text-yellow-100">{t('admin.hours.title')}</h1>
      <p className="mt-2 text-sm text-zinc-400">{t('admin.hours.subtitle')}</p>
      <Link href="/admin" className="mt-6 inline-block text-sm text-amber-300 underline">
        {t('admin.hours.backToAdmin')}
      </Link>
    </main>
  )
}
