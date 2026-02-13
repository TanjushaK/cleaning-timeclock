import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireAdmin(req)

    const body = await req.json().catch(() => ({} as any))
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase()

    const role = String(body?.role ?? 'worker').trim().toLowerCase()
    const active = body?.active === false ? false : true

    if (!email) throw new ApiError(400, 'Нужен email')
    if (!isEmail(email)) throw new ApiError(400, 'Неверный email')
    if (role !== 'worker' && role !== 'admin') throw new ApiError(400, 'role должен быть worker или admin')

    // 1) Пытаемся пригласить (если пользователь уже существует — Supabase может вернуть ошибку,
    // поэтому ниже делаем fallback поиск по email).
    const { data: inv, error: invErr } = await supabase.auth.admin.inviteUserByEmail(email)
    let invitedUserId: string | null = inv?.user?.id ?? null

    // 2) Если invite не сработал — ищем юзера по email (через auth.users, service role)
    if (!invitedUserId) {
      const { data: uRow, error: uErr } = await supabase
        .schema('auth')
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (uErr) throw new ApiError(500, `Не смог найти пользователя по email: ${uErr.message}`)
      invitedUserId = uRow?.id ?? null
    }

    if (!invitedUserId) {
      const msg = invErr?.message ? `: ${invErr.message}` : ''
      throw new ApiError(400, `Не смог пригласить/найти пользователя${msg}`)
    }

    // 3) Профиль в public.profiles (upsert)
    const { error: pErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: invitedUserId,
          role,
          active
        },
        { onConflict: 'id' }
      )

    if (pErr) throw new ApiError(500, `Не смог создать/обновить profile: ${pErr.message}`)

    return NextResponse.json(
      { ok: true, invited_user_id: invitedUserId, invited_by: userId },
      { status: 200 }
    )
  } catch (e) {
    return toErrorResponse(e)
  }
}
