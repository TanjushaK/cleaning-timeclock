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
      .order('created_at', { ascending: false })

    if (pErr) throw new ApiError(500, `Не смог прочитать profiles: ${pErr.message}`)

    const emailById = new Map<string, string | null>()

    // Берём пользователей из Auth через admin API (без доступа к auth schema)
    let page = 1
    const perPage = 200
    for (let i = 0; i < 50; i++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
      if (error) throw new ApiError(500, `Не смог прочитать auth users: ${error.message}`)

      const users = data?.users ?? []
      for (const u of users) {
        emailById.set(u.id, u.email ?? null)
      }

      if (users.length < perPage) break
      page += 1
    }

    const workers = (profiles ?? []).map((p: any) => ({
      ...p,
      email: emailById.get(p.id) ?? null
    }))

    return NextResponse.json({ workers }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
