import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normStr(v: unknown, max = 120) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))

    const email = normStr(body.email, 160)
    const role = normStr(body.role, 40) || 'worker'
    const active = typeof body.active === 'boolean' ? body.active : true

    const first_name = normStr(body.first_name)
    const last_name = normStr(body.last_name)
    const phone = normStr(body.phone)
    const address = normStr(body.address, 240)
    const notes = normStr(body.notes, 4000)

    if (!email) throw new ApiError(400, 'email обязателен')

    const full_name =
      normStr(body.full_name) ||
      (first_name || last_name ? [first_name, last_name].filter(Boolean).join(' ') : null) ||
      email.split('@')[0]

    // 1) Invite (Supabase sends email by default)
    const { data: invited, error: invErr } = await supabase.auth.admin.inviteUserByEmail(email)
    if (invErr) throw new ApiError(400, invErr.message)
    const userId = invited.user?.id
    if (!userId) throw new ApiError(500, 'Не удалось получить user.id')

    // 2) Store profile fields
    const { error: upErr } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      role,
      active,
      full_name,
      first_name,
      last_name,
      phone,
      address,
      notes,
    })
    if (upErr) throw new ApiError(400, upErr.message)

    // 3) Also return a direct invite link (useful if email delivery is slow)
    let invite_link: string | null = null
    try {
      // `generateLink` is available in supabase-js v2
      const { data: gl, error: glErr } = await supabase.auth.admin.generateLink({ type: 'invite', email })
      if (!glErr) {
        // Different versions expose it slightly differently
        invite_link =
          (gl as any)?.properties?.action_link ||
          (gl as any)?.action_link ||
          (gl as any)?.properties?.actionLink ||
          null
      }
    } catch {
      invite_link = null
    }

    return NextResponse.json({ ok: true, user_id: userId, invite_link })
  } catch (err) {
    return toErrorResponse(err)
  }
}
