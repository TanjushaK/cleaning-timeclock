import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function jsonErr(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .order('role', { ascending: true })

    if (profErr) return jsonErr(500, profErr.message)

    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (usersErr) {
      return NextResponse.json({
        workers: (profiles || []).map((p: any) => ({ ...p, email: null })),
      })
    }

    const emailById = new Map<string, string | null>()
    for (const u of usersData.users) emailById.set(u.id, u.email ?? null)

    const merged = (profiles || []).map((p: any) => ({
      ...p,
      email: emailById.get(p.id) ?? null,
    }))

    return NextResponse.json({ workers: merged }, { status: 200 })
  } catch (e: any) {
    if (e instanceof ApiError) return jsonErr(e.status, e.message)
    return jsonErr(500, e?.message || 'Внутренняя ошибка')
  }
}
