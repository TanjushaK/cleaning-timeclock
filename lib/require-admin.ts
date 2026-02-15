import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type AdminAuthOk = {
  ok: true
  supabase: SupabaseClient
  token: string
  user: User
  userId: string
}

export type AdminAuthFail = {
  ok: false
  response: NextResponse
}

export type AdminAuthResult = AdminAuthOk | AdminAuthFail

function bearerTokenFrom(headers: Headers): string | null {
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  return token || null
}

/**
 * Проверяет Authorization: Bearer <token> и что пользователь admin + active=true.
 * Возвращает либо { ok: true, ... } либо { ok: false, response }.
 */
export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminAuthResult> {
  const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers

  const token = bearerTokenFrom(headers)
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Нет токена (Authorization: Bearer ...)' }, { status: 401 }),
    }
  }

  const supabase = getSupabaseAdmin()

  const { data: u, error: uErr } = await supabase.auth.getUser(token)
  if (uErr || !u?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Неверный токен' }, { status: 401 }),
    }
  }

  const userId = u.user.id

  const { data: prof, error: profErr } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', userId)
    .maybeSingle()

  if (profErr || !prof) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Нет профиля (profiles) или нет доступа' }, { status: 403 }),
    }
  }

  if (prof.role !== 'admin' || prof.active !== true) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Нет доступа' }, { status: 403 }),
    }
  }

  return { ok: true, supabase, token, user: u.user, userId }
}
