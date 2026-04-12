import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiErrorCodes } from '@/lib/api-error-codes'

export class ApiError extends Error {
  status: number
  errorCode?: string

  constructor(status: number, message: string, errorCode?: string) {
    super(message)
    this.status = status
    this.errorCode = errorCode
    this.name = 'ApiError'
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

export function supabaseService(): SupabaseClient {
  if (_service) return _service
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL')
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY')
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _service
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
    throw new ApiError(401, 'Bearer token required', AppApiErrorCodes.AUTH_BEARER_REQUIRED)
  }

  const supabase = supabaseService()
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    throw new ApiError(401, 'Invalid or expired token', AppApiErrorCodes.AUTH_TOKEN_INVALID)
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

  if (profErr || !prof)
    throw new ApiError(403, 'Profile not found or access denied', ApiErrorCodes.ADMIN_PROFILE_NOT_FOUND)
  if (prof.role !== 'admin' || prof.active !== true)
    throw new ApiError(403, 'Admin role and active profile required', ApiErrorCodes.ADMIN_NOT_ADMIN)

  return { ...guard, profile: prof as ProfileRow }
}


export async function requireActiveWorker(reqOrHeaders: Request | Headers): Promise<WorkerGuard> {
  const guard = await requireUser(reqOrHeaders)

  const { data: prof, error: profErr } = await guard.supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', guard.userId)
    .maybeSingle()

  if (profErr || !prof)
    throw new ApiError(403, 'Profile not found or access denied', AppApiErrorCodes.WORKER_PROFILE_ACCESS_DENIED)
  if (prof.role !== 'worker' || prof.active !== true)
    throw new ApiError(403, 'Active worker profile required', AppApiErrorCodes.WORKER_ROLE_OR_ACTIVE_REQUIRED)

  return { ...guard, profile: prof as ProfileRow }
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { error: err.message }
    if (err.errorCode) body.errorCode = err.errorCode
    return NextResponse.json(body, { status: err.status })
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
  return NextResponse.json({ error: 'Unknown error' }, { status: 500 })
}


