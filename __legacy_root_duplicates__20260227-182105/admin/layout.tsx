import './admin-theme.css'
import type { ReactNode } from 'react'
import AdminSessionWarmup from '@/lib/admin-session-warmup'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adminTheme">
      <AdminSessionWarmup />
      <div className="adminChrome">{children}</div>
      <footer className="adminFooter">
        Чисто. Чётко. По времени. <span className="adminFooterYear">© 2026</span>
      </footer>
    </div>
  )
}


