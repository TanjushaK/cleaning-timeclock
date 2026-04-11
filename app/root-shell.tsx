'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export default function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isAdmin = pathname.startsWith('/admin')

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{children}</div>
      {!isAdmin ? (
        <footer className="px-4 py-5 text-center text-[12px] tracking-[0.08em] text-amber-100/70">
          Чисто. Чётко. По времени. <span className="text-amber-100/80">© 2026</span>
        </footer>
      ) : null}
    </div>
  )
}
