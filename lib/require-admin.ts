import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ProfileRow = {
  id: string
  role: string | null
  active: boolean | null
}

export type AdminGuard = {
  supabase: SupabaseClient
  token: string
  user: User
  userId: string
  profile: ProfileRow
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {}
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const p = part.trim()
    if (!p) continue
    const eq = p.indexOf('=')
    if (eq < 0) continue
    const k = p.slice(0, eq).trim()
    const v = p.slice(eq + 1).trim()
    if (!k) continue
    out[k] = decodeURIComponent(v)
  }
  return out
}

function getBearer(headers: Headers): string | null {
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  return token || null
}

function getCookieAccessToken(headers: Headers): string | null {
  const cookie = headers.get('cookie') || headers.get('Cookie') || ''
  if (!cookie) return null
  const c = parseCookies(cookie)

  // supabase auth helpers
  if (c['sb-access-token']) return c['sb-access-token']

  // иногда префиксованный формат: sb-<project>-access-token
  const keys = Object.keys(c)
  const k1 = keys.find((k) => k.endsWith('-access-token') && k.startsWith('sb-'))
  if (k1 && c[k1]) return c[k1]

  // fallback: любой ключ, содержащий "access-token"
  const k2 = keys.find((k) => k.toLowerCase().includes('access-token'))
  if (k2 && c[k2]) return c[k2]

  return null
}

function getAnyAccessToken(headers: Headers): string | null {
  return getBearer(headers) || getCookieAccessToken(headers)
}

export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminGuard> {
  const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers
  const token = getAnyAccessToken(headers)
  if (!token) throw new ApiError(401, 'Нет токена (Bearer или cookie access token)')

  const supabase = getSupabaseAdmin()

  const { data: u, error: uErr } = await supabase.auth.getUser(token)
  if (uErr || !u?.user) throw new ApiError(401, 'Токен неверный/просрочен (перелогинься)')
  const user = u.user

  const { data: prof, error: pErr } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .maybeSingle()

  if (pErr || !prof) throw new ApiError(403, 'Нет профиля (profiles) или нет доступа')
  if (prof.role !== 'admin' || prof.active !== true) throw new ApiError(403, 'Нужна роль admin и active=true')

  return { supabase, token, user, userId: user.id, profile: prof as ProfileRow }
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
  return NextResponse.json({ error: 'Unknown error' }, { status: 500 })
}
