import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { checkRateLimit, clientIpFromRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? '').replace(/^\uFEFF/, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim()
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

function json(status: number, data: Record<string, unknown>) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:login:${ip}`, 25, 60_000)) {
      return json(429, { errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many login attempts' })
    }

    const body = await req.json().catch(() => ({} as any))
    const identifier = String(body?.identifier ?? body?.email ?? body?.phone ?? '').trim()
    const password = String(body?.password || '').trim()

    if (!identifier || !password)
      return json(400, { errorCode: AppApiErrorCodes.AUTH_IDENTIFIER_PASSWORD_REQUIRED, error: 'identifier and password required' })

    const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anon = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const looksEmail = identifier.includes('@')
    if (looksEmail) {
      if (!isEmail(identifier))
        return json(400, { errorCode: AppApiErrorCodes.AUTH_INVALID_EMAIL, error: 'invalid email' })

      const { data, error } = await supabase.auth.signInWithPassword({
        email: identifier.toLowerCase(),
        password,
      })

      if (error || !data?.session)
        return json(401, { errorCode: AppApiErrorCodes.AUTH_INVALID_CREDENTIALS, error: 'invalid credentials' })

      return json(200, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: data.user,
      })
    }

    if (!isE164(identifier))
      return json(400, { errorCode: AppApiErrorCodes.AUTH_INVALID_PHONE_E164, error: 'phone must be E.164' })

    const { data, error } = await supabase.auth.signInWithPassword({
      phone: identifier,
      password,
    })

    if (error || !data?.session)
      return json(401, { errorCode: AppApiErrorCodes.AUTH_INVALID_CREDENTIALS, error: 'invalid credentials' })

    return json(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    })
  } catch (e: any) {
    console.error('[api/auth/login] error:', e)
    return json(500, { errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' })
  }
}
