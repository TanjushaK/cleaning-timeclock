import './admin-theme.css'
import type { ReactNode } from 'react'
import AdminSessionWarmup from '@/lib/admin-session-warmup'
import AdminFooterClient from './admin-footer-client'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adminTheme">
      <AdminSessionWarmup />
      <div className="adminChrome">{children}</div>
      <footer className="adminFooter">
        <AdminFooterClient />
      </footer>
    </div>
  )
}


