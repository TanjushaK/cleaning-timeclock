'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useHomeI18nOptional } from '@/lib/i18n/home-provider'

export default function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isAdmin = pathname.startsWith('/admin')
  const i18n = useHomeI18nOptional()
  const tagline = i18n?.t('footer.tagline') ?? 'Чисто. Чётко. По времени.'
  const copy = i18n?.t('footer.copyright', { year: 2026 }) ?? '© 2026'

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{children}</div>
      {!isAdmin ? (
        <footer className="px-4 py-5 text-center text-[12px] tracking-[0.08em] text-amber-100/70">
          {tagline} <span className="text-amber-100/80">{copy}</span>
        </footer>
      ) : null}
    </div>
  )
}
