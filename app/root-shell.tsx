'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import AppFooter from '@/app/_components/AppFooter'

export default function RootShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isAdmin = pathname.startsWith('/admin')

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">{children}</div>
      {!isAdmin ? <AppFooter /> : null}
    </div>
  )
}
