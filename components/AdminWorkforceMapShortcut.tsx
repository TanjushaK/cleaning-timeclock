'use client'

import { usePathname } from 'next/navigation'

export default function AdminWorkforceMapShortcut() {
  const pathname = usePathname()
  if (pathname !== '/admin') return null

  return (
    <a
      href="/admin/workforce-map"
      className="fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 rounded-2xl border border-yellow-300/55 bg-zinc-950/95 px-4 py-3 text-sm font-bold text-yellow-100 shadow-[0_16px_50px_rgba(0,0,0,0.65)] backdrop-blur transition hover:border-yellow-200 hover:bg-yellow-400/10"
      aria-label="Открыть карту смен"
    >
      <span aria-hidden>🗺️</span>
      Карта смен
    </a>
  )
}
