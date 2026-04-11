import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function cleanEnv(v: string | undefined | null): string {
  // Убираем BOM (U+FEFF) и лишние пробелы — частая причина ByteString ошибок после copy/paste в env
  const s = String(v ?? '').replace(/^\uFEFF/, '').trim()
  // Иногда хостинг/копипаст оставляет кавычки
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

let _browser: SupabaseClient | null = null

/** Браузерный anon-клиент; при первом вызове требует NEXT_PUBLIC_SUPABASE_* (не при импорте модуля). */
export function getSupabase(): SupabaseClient {
  if (_browser) return _browser
  const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const supabaseAnonKey = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (!supabaseUrl) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!supabaseAnonKey) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY')
  _browser = createClient(supabaseUrl, supabaseAnonKey)
  return _browser
}

/**
 * Совместимость: ленивая инициализация, чтобы `next build` и пререндер не падали без env.
 * Обращение к любому полю/методу впервые создаёт клиент и при отсутствии env бросает ошибку.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const c = getSupabase()
    const value = Reflect.get(c, prop, receiver)
    if (typeof value === 'function') {
      return (value as (...a: unknown[]) => unknown).bind(c)
    }
    return value
  },
})
