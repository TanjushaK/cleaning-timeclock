import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import I18nProvider from '@/components/I18nProvider'
import LanguageSwitch from '@/components/LanguageSwitch'
import { DEFAULT_LANG, LANG_STORAGE_KEY, parseLang } from '@/lib/i18n-config'
import RootShell from './root-shell'

const inter = Inter({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Tanija • Cleaning Timeclock',
  description: 'Cleaning Timeclock (Tanija)',
  icons: { icon: '/tanija-logo.png' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const htmlLang = parseLang(jar.get(LANG_STORAGE_KEY)?.value) ?? DEFAULT_LANG

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <body className={inter.className}>
        <I18nProvider>
          <LanguageSwitch />
          <RootShell>{children}</RootShell>
        </I18nProvider>
      </body>
    </html>
  )
}
