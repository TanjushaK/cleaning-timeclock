import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AppApiErrorCodes } from '@/lib/app-error-codes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function isE164(s: string): boolean {
  return /^\+\d{8,15}$/.test(s)
}

function json(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function err(status: number, message: string, errorCode: string) {
  return json(status, { error: message, errorCode })
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))

    // Back-compat: раньше слали {email,password}. Теперь принимаем {identifier,password} и {phone,password}.
    const identifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '').trim()
    const password = String(body?.password || '').trim()

    if (!identifier || !password)
      return err(400, 'Login and password are required', AppApiErrorCodes.AUTH_IDENTIFIER_PASSWORD_REQUIRED)

    const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anon = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const looksEmail = identifier.includes('@')

    if (looksEmail) {
      if (!isEmail(identifier))
        return err(400, 'Invalid email', AppApiErrorCodes.AUTH_INVALID_EMAIL)
      const { data, error } = await supabase.auth.signInWithPassword({ email: identifier.toLowerCase(), password })
      if (error || !data?.session)
        return err(401, error?.message || 'Invalid login or password', AppApiErrorCodes.AUTH_INVALID_CREDENTIALS)
      return json(200, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: data.user,
      })
    }

    if (!isE164(identifier))
      return err(
        400,
        'Phone must be in E.164 format, e.g. +31612345678',
        AppApiErrorCodes.AUTH_INVALID_PHONE_E164,
      )

    const { data, error } = await supabase.auth.signInWithPassword({ phone: identifier, password })
    if (error || !data?.session)
      return err(401, error?.message || 'Invalid login or password', AppApiErrorCodes.AUTH_INVALID_CREDENTIALS)

    return json(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    })
  } catch (e: any) {
    // важный момент: отдаём реальную причину, иначе сложно дебажить Vercel env
    return err(500, String(e?.message || e), AppApiErrorCodes.INTERNAL)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  })
}
