import { NextResponse } from 'next/server'
import type { CompatClient } from '@/lib/server/compat/client'
import type { AppUser } from '@/lib/server/compat/types'
import { ApiError, requireAdmin as requireAdminGuard } from '@/lib/route-db'

export type AdminAuthOk = {
  ok: true
  db: CompatClient
  token: string
  user: AppUser
  userId: string
}

export type AdminAuthFail = {
  ok: false
  response: NextResponse
}

export type AdminAuthResult = AdminAuthOk | AdminAuthFail

export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminAuthResult> {
  try {
    const guard = await requireAdminGuard(reqOrHeaders)
    return { ok: true, db: guard.db, token: guard.token, user: guard.user, userId: guard.userId }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, response: NextResponse.json({ error: error.message }, { status: error.status }) }
    }
    return { ok: false, response: NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }) }
  }
}
