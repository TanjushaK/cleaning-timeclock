import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { I18nHomeProvider } from '@/lib/i18n/home-provider'
import RootShell from './root-shell'

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Tanija • Cleaning Timeclock',
  description: 'Cleaning Timeclock (Tanija)',
  icons: { icon: '/tanija-logo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={inter.className}>
        <I18nHomeProvider>
          <RootShell>{children}</RootShell>
        </I18nHomeProvider>
      </body>
    </html>
  )
}
