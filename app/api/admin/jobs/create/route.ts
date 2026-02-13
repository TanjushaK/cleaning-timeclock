// app/api/admin/jobs/create/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function envOrThrow(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function assertAdmin(req: NextRequest) {
  const token = bearer(req)
  if (!token) return { ok: false as const, status: 401, error: 'Нет входа. Авторизуйся в админке.' }

  const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
  const anon = envOrThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false as const, status: 401, error: 'Невалидный токен' }

  const { data: prof, error: profErr } = await sb
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .single()

  if (profErr || !prof) return { ok: false as const, status: 403, error: 'Профиль не найден' }
  if (prof.role !== 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'Доступ запрещён' }

  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const siteId = String(body?.site_id || '').trim()
    const jobDate = String(body?.job_date || '').trim() // YYYY-MM-DD
    const scheduledTime = String(body?.scheduled_time || '').trim() // HH:MM
    const workerIdsRaw = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    const workerIds = workerIdsRaw.map((x: any) => String(x).trim()).filter(Boolean)

    if (!siteId) return NextResponse.json({ error: 'site_id обязателен' }, { status: 400 })
    if (!jobDate) return NextResponse.json({ error: 'job_date обязателен' }, { status: 400 })
    if (!scheduledTime) return NextResponse.json({ error: 'scheduled_time обязателен' }, { status: 400 })
    if (workerIds.length === 0) return NextResponse.json({ error: 'Выбери хотя бы одного работника' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const rows = workerIds.map((worker_id: string) => ({
      site_id: siteId,
      worker_id,
      job_date: jobDate,
      scheduled_time: scheduledTime.length === 5 ? `${scheduledTime}:00` : scheduledTime,
      status: 'planned',
    }))

    const { data, error } = await admin.from('jobs').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
