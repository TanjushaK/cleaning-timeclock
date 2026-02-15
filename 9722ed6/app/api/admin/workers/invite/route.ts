import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

async function findUserIdByEmail(supabase: any, email: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  const emailLc = email.trim().toLowerCase()

  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(500, `Не смог прочитать auth users: ${error.message}`)

    const users = data?.users ?? []
    const hit = users.find((u: any) => String(u.email ?? '').toLowerCase() === emailLc)
    if (hit?.id) return hit.id

    if (users.length < perPage) break
    page += 1
  }

  return null
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireAdmin(req)

    const body = await req.json().catch(() => ({} as any))
    const email = String(body?.email ?? '').trim().toLowerCase()
    const role = String(body?.role ?? 'worker').trim().toLowerCase()
    const active = body?.active === false ? false : true

    if (!email) throw new ApiError(400, 'Нужен email')
    if (!isEmail(email)) throw new ApiError(400, 'Неверный email')
    if (role !== 'worker' && role !== 'admin') throw new ApiError(400, 'role должен быть worker или admin')

    // 1) invite
    const { data: inv, error: invErr } = await supabase.auth.admin.inviteUserByEmail(email)
    let targetUserId: string | null = inv?.user?.id ?? null

    // 2) если invite не дал id — ищем существующего юзера через listUsers
    if (!targetUserId) {
      targetUserId = await findUserIdByEmail(supabase, email)
    }

    if (!targetUserId) {
      const msg = invErr?.message ? `: ${invErr.message}` : ''
      throw new ApiError(400, `Не смог пригласить/найти пользователя${msg}`)
    }

    // 3) upsert profile
    const { error: pErr } = await supabase
      .from('profiles')
      .upsert({ id: targetUserId, role, active }, { onConflict: 'id' })

    if (pErr) throw new ApiError(500, `Не смог создать/обновить profile: ${pErr.message}`)

    return NextResponse.json({ ok: true, invited_user_id: targetUserId, invited_by: userId }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
