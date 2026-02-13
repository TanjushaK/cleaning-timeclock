import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function supabaseService() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export function supabaseAnon() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    return { ok: false as const, status: 401, message: 'Нет токена авторизации' }
  }

  const anon = supabaseAnon()
  const svc = supabaseService()

  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    return { ok: false as const, status: 401, message: 'Неверный токен' }
  }

  const userId = userData.user.id

  const { data: profile, error: profErr } = await svc
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (profErr || !profile) {
    return { ok: false as const, status: 403, message: 'Профиль не найден' }
  }

  if (profile.role !== 'admin' || profile.active === false) {
    return { ok: false as const, status: 403, message: 'Доступ только для администратора' }
  }

  return { ok: true as const, userId }
}
