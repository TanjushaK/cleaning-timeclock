import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

type WorkerProfile = {
  id: string
  role: string
  full_name: string | null
  phone: string | null
  active: boolean
  avatar_url: string | null
}

async function emailMap(supabase: any): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  let page = 1
  const perPage = 1000

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new ApiError(400, error.message)

    for (const u of data?.users || []) {
      if (u?.id && u?.email) map[u.id] = u.email
    }

    if (!data?.users || data.users.length < perPage) break
    page += 1
  }

  return map
}

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const { data: profs, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, phone, active, avatar_url')
      .eq('role', 'worker')
      .order('full_name', { ascending: true })

    if (error) throw new ApiError(400, error.message)

    const map = await emailMap(supabase)

    const workers = ((profs ?? []) as WorkerProfile[]).map((p) => ({
      ...p,
      email: map[p.id] ?? null,
    }))

    return NextResponse.json({ workers })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password.trim() : ''
    const full_name = typeof body?.full_name === 'string' ? body.full_name.trim() : ''
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : ''

    if (!email) throw new ApiError(400, 'email_required')
    if (!password || password.length < 6) throw new ApiError(400, 'password_min_6')

    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (cErr || !created?.user) throw new ApiError(400, cErr?.message || 'create_user_failed')

    const id = created.user.id

    const { error: pErr } = await supabase.from('profiles').upsert(
      {
        id,
        role: 'worker',
        full_name: full_name || null,
        phone: phone || null,
        active: true,
        avatar_url: null,
      },
      { onConflict: 'id' }
    )

    if (pErr) throw new ApiError(400, pErr.message)

    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
