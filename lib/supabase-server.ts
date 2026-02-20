import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function toErrorResponse(err: any) {
  const status = typeof err?.status === 'number' ? err.status : 500
  const message =
    typeof err?.message === 'string' && err.message
      ? err.message
      : 'Ошибка сервера. Смотри логи.'
  return NextResponse.json({ error: message }, { status })
}

export async function requireAdmin(headers: Headers) {
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) {
    throw new ApiError(401, 'Нет токена. Войдите снова.')
  }
  const token = auth.slice(7).trim()
  if (!token) throw new ApiError(401, 'Пустой токен. Войдите снова.')

  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userRes?.user) throw new ApiError(401, 'Сессия истекла. Войдите снова.')

  const user = userRes.user
  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('id,role')
    .eq('id', user.id)
    .maybeSingle()

  if (profErr) throw new ApiError(500, profErr.message)
  if (!prof || prof.role !== 'admin') throw new ApiError(403, 'Нет доступа администратора.')

  return { supabase, user }
}