import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

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

function getHeaders(input: Request | Headers) {
  return input instanceof Headers ? input : input.headers
}

function bearerToken(input: Request | Headers) {
  const h = getHeaders(input)
  const authHeader = h.get('authorization') || ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
}

export type GuardResult = {
  userId: string
  supabase: SupabaseClient<any, 'public', 'public', any, any>
  admin: any
}

export async function requireUser(input: Request | Headers): Promise<GuardResult> {
  const token = bearerToken(input)
  if (!token) throw new ApiError(401, 'Нет токена авторизации')

  const anon = supabaseAnon()
  const { data: userData, error: userErr } = await anon.auth.getUser(token)

  if (userErr || !userData?.user?.id) throw new ApiError(401, 'Неверный токен')

  const supabase = supabaseService()
  const admin = (supabase as any).auth.admin

  return { userId: userData.user.id, supabase, admin }
}

export async function requireAdmin(input: Request | Headers): Promise<GuardResult> {
  const { userId, supabase, admin } = await requireUser(input)

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (profErr || !profile) throw new ApiError(403, 'Профиль не найден')
  if (profile.active === false) throw new ApiError(403, 'Профиль неактивен')
  if (profile.role !== 'admin') throw new ApiError(403, 'Доступ только для администратора')

  return { userId, supabase, admin }
}
