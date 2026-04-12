'use client'

import { useI18n } from '@/components/I18nProvider'

export default function OfflinePage() {
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
        <div className="text-xl font-semibold">{t('offline.title')}</div>
        <p className="text-sm opacity-80 mt-3">{t('offline.body')}</p>
        <button
          type="button"
          className="mt-6 rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10"
          onClick={() => window.location.reload()}
        >
          {t('offline.reload')}
        </button>
      </div>
    </div>
  )
}
