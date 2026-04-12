'use client'

import { useI18n } from '@/components/I18nProvider'

export default function AppFooter() {
  const { t } = useI18n()
  const tagline = t('footer.tagline')
  const copy = t('footer.copyright', { year: new Date().getFullYear() })

  return (
    <footer className="px-4 py-5 text-center text-[12px] tracking-[0.08em] text-amber-100/70">
      {tagline} <span className="text-amber-100/80">{copy}</span>
    </footer>
  )
}
