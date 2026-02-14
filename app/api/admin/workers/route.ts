import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, active, full_name, first_name, last_name, phone, address, notes, avatar_url')
      .eq('role', 'worker')
      .order('full_name', { ascending: true })

    if (error) throw new ApiError(400, error.message)

    // email живёт в auth.users → получаем через admin listUsers (вынесено “по необходимости”)
    // Важно: listUsers — постраничный, может быть тяжёлым. Для стабильности можно:
    // 1) показывать email только в карточке (GET /workers/[id])
    // 2) или кешировать map в памяти/redis
    return NextResponse.json({ workers: data ?? [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const body = await req.json().catch(() => ({} as any))

    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '').trim()

    const first_name = String(body?.first_name ?? '').trim() || null
    const last_name = String(body?.last_name ?? '').trim() || null
    const phone = String(body?.phone ?? '').trim() || null
    const address = String(body?.address ?? '').trim() || null
    const avatar_url = String(body?.avatar_url ?? '').trim() || null

    if (!email || !isEmail(email)) throw new ApiError(400, 'email_required_or_invalid')
    if (!password || password.length < 6) throw new ApiError(400, 'password_min_6')

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (cErr || !created?.user?.id) throw new ApiError(400, cErr?.message || 'create_user_failed')

    const id = created.user.id
    const full_name = `${first_name || ''} ${last_name || ''}`.trim() || null

    const { error: pErr } = await supabase
      .from('profiles')
      .upsert({
        id,
        role: 'worker',
        active: true,
        full_name,
        first_name,
        last_name,
        phone,
        address,
        notes: null,
        avatar_url,
      }, { onConflict: 'id' })

    if (pErr) throw new ApiError(400, pErr.message)

    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return toErrorResponse(e)
  }
}
