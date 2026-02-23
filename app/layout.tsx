import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F59E0B',
}

export const metadata: Metadata = {
  title: 'Van Tanija BV Cleaning • Timeclock',
  description: 'Van Tanija BV Cleaning — Cleaning Timeclock',
  icons: { icon: '/tanija-logo.png', apple: '/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
