import './admin-theme.css'
import type { ReactNode } from 'react'
import AdminSessionWarmup from '@/lib/admin-session-warmup'
import AdminFooter from '@/components/AdminFooter'
import AdminWorkforceMapShortcut from '@/components/AdminWorkforceMapShortcut'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="adminTheme">
      <AdminSessionWarmup />
      <div className="adminChrome">{children}</div>
      <AdminWorkforceMapShortcut />
      <AdminFooter />
    </div>
  )
}
