'use client'

import { HOME_LOCALES, type HomeLocale } from '@/lib/i18n/types'
import { useHomeI18n } from '@/lib/i18n/home-provider'

export default function HomeLanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useHomeI18n()

  return (
    <label className={`inline-flex items-center gap-2 text-xs opacity-90 ${className}`}>
      <span className="text-amber-100/70">{t('lang.label')}</span>
      <select
        className="rounded-lg border border-amber-500/30 bg-zinc-900/80 px-2 py-1 text-xs text-amber-100 outline-none focus:border-amber-400/50"
        value={locale}
        onChange={(e) => setLocale(e.target.value as HomeLocale)}
        aria-label={t('lang.label')}
      >
        {HOME_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {t(`lang.${loc}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
