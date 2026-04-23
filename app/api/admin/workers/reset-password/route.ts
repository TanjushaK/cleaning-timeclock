import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { hashPassword } from '@/lib/auth/password'
import { dbQuery } from '@/lib/server/pool'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tempPasswordFromUserId(userId: string): string {
  return `Tc!${String(userId || '').slice(0, 6)}`
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req)

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const workerId = String(body?.worker_id || '').trim()
    if (!workerId) throw new ApiError(400, 'worker_id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const profileRes = await dbQuery<{
      id: string
      role: string | null
      email: string | null
      phone: string | null
      full_name: string | null
    }>(
      `
      select id::text, role, email, phone, full_name
      from profiles
      where id = $1::uuid
      limit 1
      `,
      [workerId],
    )
    const profile = profileRes.rows[0]
    if (!profile) throw new ApiError(404, 'Profile not found', AdminApiErrorCode.PROFILE_NOT_FOUND)
    if (String(profile.role || '') !== 'worker') {
      throw new ApiError(400, 'Password reset is allowed only for workers', AdminApiErrorCode.ACTIVATE_NOT_WORKER)
    }

    const tempPassword = tempPasswordFromUserId(workerId)
    const nextHash = await hashPassword(tempPassword)

    const userRes = await dbQuery<{ id: string; email: string | null; phone: string | null }>(
      `
      update app_users
         set password_hash = $2::text,
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             user_metadata = coalesce(user_metadata, '{}'::jsonb) || jsonb_build_object(
               'temp_password', true,
               'password_reset_by_admin', true,
               'password_reset_at', now()
             ),
             updated_at = now()
       where id = $1::uuid
         and deleted_at is null
      returning id::text, email, phone
      `,
      [workerId, nextHash],
    )
    const updated = userRes.rows[0]
    if (!updated) {
      throw new ApiError(404, 'Auth user not found', AdminApiErrorCode.AUTH_USER_UPDATE_FAILED)
    }

    const login = String(updated.email || profile.email || updated.phone || profile.phone || '').trim()

    return NextResponse.json({
      ok: true,
      worker_id: workerId,
      login: login || null,
      temp_password: tempPassword,
      role: 'worker',
      full_name: profile.full_name ?? null,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

