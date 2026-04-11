import { createClient } from '@supabase/supabase-js'

function cleanEnv(v: string | undefined | null): string {
  // Убираем BOM (U+FEFF) и лишние пробелы — частая причина ByteString ошибок после copy/paste в Vercel
  const s = String(v ?? '').replace(/^\uFEFF/, '').trim()
  // Иногда Vercel/копипаст оставляет кавычки
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function mustEnv(name: string): string {
  const v = cleanEnv(process.env[name])
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

export function supabaseRouteClient(accessToken?: string) {
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const anon = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createClient(url, anon, {
    global: accessToken
      ? {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  })
}