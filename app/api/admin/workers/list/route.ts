import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('*')

    if (pErr) throw new ApiError(500, `Не смог прочитать profiles: ${pErr.message}`)

    const { data: users, error: uErr } = await supabase
      .schema('auth')
      .from('users')
      .select('id, email')

    if (uErr) throw new ApiError(500, `Не смог прочитать auth.users: ${uErr.message}`)

    const emailById = new Map<string, string | null>()
    for (const u of users ?? []) emailById.set(u.id, u.email ?? null)

    const workers = (profiles ?? []).map((p: any) => ({
      ...p,
      email: emailById.get(p.id) ?? null
    }))

    return NextResponse.json({ workers }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
