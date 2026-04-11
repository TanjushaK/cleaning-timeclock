import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

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

type UserGuard = {
  // Для совместимости: `supabase` используется в роутах.
  // В admin-роутах это service-role (без RLS), в /api/me/* по флагу может быть anon+Bearer (с RLS).
  supabase: SupabaseClient
  // Явно оставляем доступ к service-role (для admin и внутренних проверок).
  service: SupabaseClient
  // Клиент под пользователем (anon + Authorization Bearer <JWT>), для RLS-режима.
  userSupabase: SupabaseClient
  token: string
  user: User
  userId: string
}

type AdminGuard = UserGuard & {
  profile: ProfileRow
}

type WorkerGuard = UserGuard & {
  profile: ProfileRow
}

function cleanEnv(v: string): string {
  const s = String(v || '').replace(/\uFEFF/g, '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function mustEnv(name: string): string {
  const raw = process.env[name]
  const v = cleanEnv(raw || '')
  if (!v) throw new ApiError(500, `Missing env: ${name}`)
  return v
}

let _service: SupabaseClient | null = null
let _anon: SupabaseClient | null = null

export function supabaseService(): SupabaseClient {
  if (_service) return _service
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY')
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _service
}

export function supabaseAnon(): SupabaseClient {
  if (_anon) return _anon
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  _anon = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _anon
}

export function supabaseUser(token: string): SupabaseClient {
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

function envFlag(name: string): boolean {
  const v = cleanEnv(process.env[name] || '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

// JWT должен быть ASCII (ByteString). Иногда BOM/мусор ломает заголовки.
function sanitizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  let t = String(raw).replace(/^\uFEFF/, '').trim()
  t = t.replace(/[^A-Za-z0-9._-]/g, '')
  return t.length ? t : null
}

function getBearer(headers: Headers): string | null {
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return sanitizeToken(m?.[1]?.trim() || null)
}

export async function requireUser(reqOrHeaders: Request | Headers): Promise<UserGuard> {
  const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers
  const token = getBearer(headers)

  if (!token) {
    throw new ApiError(401, 'Нет токена (Authorization: Bearer ...)')
  }

  const service = supabaseService()
  const userSupabase = supabaseUser(token)
  const { data, error } = await service.auth.getUser(token)

  if (error || !data?.user) {
    throw new ApiError(401, 'Токен неверный/просрочен (перелогинься)')
  }

  // По умолчанию оставляем старое поведение (service-role) для /api/me/*,
  // чтобы не сломать прод пока не готовы RLS-политики.
  // Включать только на Preview до полной проверки: ME_USE_RLS=1.
  const useRls = envFlag('ME_USE_RLS')
  const supabase = useRls ? userSupabase : service

  return { supabase, service, userSupabase, token, user: data.user, userId: data.user.id }
}

export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminGuard> {
  const guard = await requireUser(reqOrHeaders)

  const { data: prof, error: profErr } = await guard.service
    .from('profiles')
    .select('id, role, active')
    .eq('id', guard.userId)
    .maybeSingle()

  if (profErr || !prof) throw new ApiError(403, 'Нет профиля (profiles) или нет доступа')
  if (prof.role !== 'admin' || prof.active !== true) throw new ApiError(403, 'Нужна роль admin и active=true')

  // В admin-роутах хотим гарантированно service-role.
  return { ...guard, supabase: guard.service, profile: prof as ProfileRow }
}


export async function requireActiveWorker(reqOrHeaders: Request | Headers): Promise<WorkerGuard> {
  const guard = await requireUser(reqOrHeaders)

  const { data: prof, error: profErr } = await guard.service
    .from('profiles')
    .select('id, role, active')
    .eq('id', guard.userId)
    .maybeSingle()

  if (profErr || !prof) throw new ApiError(403, 'Нет профиля (profiles) или нет доступа')
  if (prof.role !== 'worker' || prof.active !== true) throw new ApiError(403, 'Нужна роль worker и active=true')

  // В /api/me/* клиент выбирается в requireUser() по флагу ME_USE_RLS.
  return { ...guard, profile: prof as ProfileRow }
}

const GENERIC_500 = 'Внутренняя ошибка сервера'

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  const isProd = process.env.NODE_ENV === 'production'
  if (err instanceof Error) {
    if (!isProd) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    console.error('[api]', err)
    return NextResponse.json({ error: GENERIC_500 }, { status: 500 })
  }
  return NextResponse.json({ error: isProd ? GENERIC_500 : 'Unknown error' }, { status: 500 })
}


