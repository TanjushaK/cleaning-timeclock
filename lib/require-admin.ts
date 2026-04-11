import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ApiError, requireAdmin as requireAdminGuard } from '@/lib/supabase-server'

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

export async function requireAdmin(reqOrHeaders: Request | Headers): Promise<AdminAuthResult> {
  try {
    const g = await requireAdminGuard(reqOrHeaders)
    return { ok: true, supabase: g.supabase, token: g.token, user: g.user, userId: g.userId }
  } catch (e: any) {
    if (e instanceof ApiError) {
      return { ok: false, response: NextResponse.json({ error: e.message }, { status: e.status }) }
    }
    return { ok: false, response: NextResponse.json({ error: String(e?.message || e) }, { status: 500 }) }
  }
}
