import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import RootShell from './root-shell'

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Tanija • Cleaning Timeclock',
  description: 'Cleaning Timeclock (Tanija)',
  icons: { icon: '/tanija-logo.png' },
  other: { google: 'notranslate' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" translate="no">
      <body className={inter.className}>
        <RootShell>{children}</RootShell>
      </body>
    </html>
  )
}
