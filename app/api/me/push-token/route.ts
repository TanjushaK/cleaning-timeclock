import { NextRequest, NextResponse } from 'next/server'

import { dbQuery } from '@/lib/server/pool'
import { AppApiErrorCodes } from '@/lib/app-error-codes'
import { ApiError, requireActiveWorker, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_MIN_LEN = 10
const TOKEN_MAX_LEN = 4096

function validatePushToken(raw: string): string {
  const token = raw.trim()
  if (!token) throw new ApiError(400, 'token required', AppApiErrorCodes.PUSH_TOKEN_REQUIRED)
  if (token.length < TOKEN_MIN_LEN || token.length > TOKEN_MAX_LEN) {
    throw new ApiError(400, 'invalid token', AppApiErrorCodes.PUSH_TOKEN_INVALID)
  }
  if (/[\u0000-\u001f\u007f]/.test(token)) {
    throw new ApiError(400, 'invalid token', AppApiErrorCodes.PUSH_TOKEN_INVALID)
  }
  return token
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireActiveWorker(req)
    const raw = await req.json().catch(() => ({}))
    const token = validatePushToken(typeof raw?.token === 'string' ? raw.token : '')
    const platform =
      typeof raw?.platform === 'string' && raw.platform.trim()
        ? raw.platform.trim().slice(0, 128)
        : null
    const device_name =
      typeof raw?.device_name === 'string' && raw.device_name.trim()
        ? raw.device_name.trim().slice(0, 256)
        : null

    await dbQuery(
      `insert into worker_push_tokens (worker_id, token, platform, device_name, updated_at, disabled_at)
       values ($1::uuid, $2::text, $3::text, $4::text, now(), null)
       on conflict (worker_id, token) do update set
         platform = excluded.platform,
         device_name = excluded.device_name,
         updated_at = now(),
         disabled_at = null`,
      [userId, token, platform, device_name],
    )

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return toErrorResponse(e)
  }
}
