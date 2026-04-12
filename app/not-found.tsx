import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { DEFAULT_LANG, LANG_STORAGE_KEY, parseLang } from '@/lib/i18n-config'
import { getMessage, messages } from '@/messages'

export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies()
  const lang = parseLang(jar.get(LANG_STORAGE_KEY)?.value) ?? DEFAULT_LANG
  const m = messages[lang] ?? messages[DEFAULT_LANG]
  const title = getMessage(m, 'notFound.pageTitle') ?? '404'
  return { title }
}

export default async function NotFound() {
  const jar = await cookies()
  const lang = parseLang(jar.get(LANG_STORAGE_KEY)?.value) ?? DEFAULT_LANG
  const m = messages[lang] ?? messages[DEFAULT_LANG]

  const title = getMessage(m, 'notFound.title') ?? '404'
  const description = getMessage(m, 'notFound.description') ?? ''
  const cta = getMessage(m, 'notFound.cta') ?? 'Home'

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl text-center">
        <div className="text-xl font-semibold">{title}</div>
        <p className="text-sm opacity-80 mt-3">{description}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10"
        >
          {cta}
        </Link>
      </div>
    </div>
  )
}
