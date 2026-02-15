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
  supabase: SupabaseClient
  token: string
  user: User
  userId: string
}

type AdminGuard = UserGuard & {
  profile: ProfileRow
}

function mustEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new ApiError(500, `Missing env: ${name}`)
  return v
}

let _service: SupabaseClient | null = null

export function supabaseService(): SupabaseClient {
  if (_service) return _service
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY')
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return _service
}

function getBearer(headers: Headers): string | null {
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  return token || null
}

export async function requireUser(reqOrHeaders: Request | Headers): Promise<UserGuard> {
  const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers
  const token = getBearer(headers)

  if (!token) {
    throw new ApiError(401, 'Нет токена (Authorization: Bearer ...)')
  }

  const supabase = supabaseService()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    throw new ApiError(401, 'Токен неверный/просрочен (перелогинься)')
  }

  return { supabase, token, user: data.user, userId: data.user.id }
}

export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminGuard> {
  const guard = await requireUser(reqOrHeaders)

  const { data: prof, error: profErr } = await guard.supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', guard.userId)
    .maybeSingle()

  if (profErr || !prof) throw new ApiError(403, 'Нет профиля (profiles) или нет доступа')
  if (prof.role !== 'admin' || prof.active !== true) throw new ApiError(403, 'Нужна роль admin и active=true')

  return { ...guard, profile: prof as ProfileRow }
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
