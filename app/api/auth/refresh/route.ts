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

function json(status: number, data: Record<string, unknown>) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req)
    if (!checkRateLimit(`auth:refresh:${ip}`, 60, 60_000)) {
      return json(429, { errorCode: AppApiErrorCodes.AUTH_RATE_LIMITED, error: 'Too many refresh requests' })
    }

    const body = await req.json().catch(() => ({} as any))
    const refresh_token = String(body?.refresh_token || '').trim()
    if (!refresh_token)
      return json(400, { errorCode: AppApiErrorCodes.AUTH_REFRESH_TOKEN_REQUIRED, error: 'refresh_token required' })

    const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
    const anon = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await (supabase as any).auth.refreshSession({ refresh_token })
    if (error || !data?.session)
      return json(401, { errorCode: AppApiErrorCodes.AUTH_SESSION_REFRESH_FAILED, error: 'session refresh failed' })

    return json(200, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    })
  } catch (e: any) {
    console.error('[api/auth/refresh] error:', e)
    return json(500, { errorCode: AppApiErrorCodes.INTERNAL, error: 'Internal Server Error' })
  }
}
