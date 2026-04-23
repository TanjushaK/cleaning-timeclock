import { NextResponse } from 'next/server'
import type { AppUser } from '@/lib/server/compat/types'
import { createCompatClient, type CompatClient } from '@/lib/server/compat/client'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { verifyAccessToken } from '@/lib/auth/jwt'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
    this.name = 'ApiError'
  }
}

type ProfileRow = {
  id: string
  role: string | null
  active: boolean | null
}

type UserGuard = {
  db: CompatClient
  service: CompatClient
  token: string
  user: AppUser
  userId: string
}

type AdminGuard = UserGuard & { profile: ProfileRow }
type WorkerGuard = UserGuard & { profile: ProfileRow }

function sanitizeToken(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = String(raw).replace(/^\uFEFF/, '').trim()
  value = value.replace(/[^A-Za-z0-9._-]/g, '')
  return value || null
}

function getBearer(headers: Headers): string | null {
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return sanitizeToken(match?.[1]?.trim() || null)
}

let _service: CompatClient | null = null
let _anon: CompatClient | null = null

export function dbService(): CompatClient {
  if (!_service) _service = createCompatClient()
  return _service
}

export function dbAnon(): CompatClient {
  if (!_anon) _anon = createCompatClient()
  return _anon
}

export function dbUser(_token: string): CompatClient {
  return createCompatClient()
}

export async function requireUser(reqOrHeaders: Request | Headers): Promise<UserGuard> {
  const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers
  const token = getBearer(headers)
  if (!token) {
    throw new ApiError(401, 'Authorization Bearer token required', AppApiErrorCodes.AUTH_BEARER_REQUIRED)
  }

  let payload
  try {
    payload = await verifyAccessToken(token)
  } catch {
    throw new ApiError(401, 'Invalid or expired token', AppApiErrorCodes.AUTH_TOKEN_INVALID)
  }

  const service = dbService()
  const db = dbUser(token)
  const { data, error } = await service.auth.getUser(token)
  if (error || !data?.user) {
    throw new ApiError(401, 'Invalid or expired token', AppApiErrorCodes.AUTH_TOKEN_INVALID)
  }

  return {
    db,
    service,
    token,
    user: data.user,
    userId: payload.sub,
  }
}

export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminGuard> {
  const guard = await requireUser(reqOrHeaders)
  const { data: prof, error: profErr } = await guard.service
    .from('profiles')
    .select('id,role,active')
    .eq('id', guard.userId)
    .maybeSingle()

  if (profErr || !prof) throw new ApiError(403, 'Profile not found or access denied', AdminApiErrorCode.AUTH_PROFILE_MISSING)
  if ((prof as any).role !== 'admin' || (prof as any).active !== true) {
    throw new ApiError(403, 'Admin role with active=true required', AdminApiErrorCode.AUTH_ADMIN_REQUIRED)
  }

  return { ...guard, db: guard.service, profile: prof as ProfileRow }
}

export async function requireActiveWorker(reqOrHeaders: Request | Headers): Promise<WorkerGuard> {
  const guard = await requireUser(reqOrHeaders)
  const { data: prof, error: profErr } = await guard.service
    .from('profiles')
    .select('id,role,active')
    .eq('id', guard.userId)
    .maybeSingle()

  if (profErr || !prof) throw new ApiError(403, 'Profile not found or access denied', AppApiErrorCodes.AUTH_PROFILE_MISSING)
  if ((prof as any).role !== 'worker' || (prof as any).active !== true) {
    throw new ApiError(403, 'Worker role with active=true required', AppApiErrorCodes.WORKER_ROLE_OR_ACTIVE_REQUIRED)
  }

  return { ...guard, profile: prof as ProfileRow }
}

const GENERIC_500 = 'Internal server error'

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const body: Record<string, string> = {}
    if (err.code) body.errorCode = err.code
    if (err.message) body.error = err.message
    return NextResponse.json(body, { status: err.status })
  }
  const isProd = process.env.NODE_ENV === 'production'
  if (err instanceof Error) {
    if (!isProd) {
      return NextResponse.json({ error: err.message, errorCode: AppApiErrorCodes.INTERNAL }, { status: 500 })
    }
    console.error('[api]', err)
    return NextResponse.json({ error: GENERIC_500, errorCode: AppApiErrorCodes.INTERNAL }, { status: 500 })
  }
  return NextResponse.json(
    { error: isProd ? GENERIC_500 : 'Unknown error', errorCode: AppApiErrorCodes.INTERNAL },
    { status: 500 },
  )
}
