import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

function jsonOk(data: any) {
  return NextResponse.json(data, { status: 200 })
}

function jsonErr(e: any) {
  const status = typeof e?.status === 'number' ? e.status : 500
  const msg = e?.message || 'error'
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, admin } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const full_name = String(body?.full_name || '').trim()
    const phone = String(body?.phone || '').trim()

    if (!email) throw new ApiError(400, 'email_required')
    if (!email.includes('@')) throw new ApiError(400, 'email_invalid')
    if (!full_name) throw new ApiError(400, 'full_name_required')

    // 1) Приглашение / письмо на установку пароля
    // Supabase Admin API: inviteUserByEmail (письмо "Set password" / "Invite")
    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : undefined

    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo ? `${redirectTo}/reset-password` : undefined,
      data: { full_name, phone },
    })

    if (invErr) throw new ApiError(400, invErr.message)

    const invitedUserId = inv?.user?.id
    if (!invitedUserId) throw new ApiError(500, 'invite_no_user')

    // 2) Профиль (worker) — upsert, чтобы не падать при повторном приглашении
    const { error: upErr } = await supabase.from('profiles').upsert(
      {
        id: invitedUserId,
        full_name,
        phone,
        role: 'worker',
      },
      { onConflict: 'id' }
    )
    if (upErr) throw new ApiError(400, upErr.message)

    return jsonOk({ ok: true, user_id: invitedUserId })
  } catch (e: any) {
    return jsonErr(e)
  }
}
