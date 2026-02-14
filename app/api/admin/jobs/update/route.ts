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

  const { data: prof, error: profErr } = await sb.from('profiles').select('id, role, active').eq('id', userData.user.id).single()
  if (profErr || !prof) return { ok: false as const, status: 403, error: 'Профиль не найден' }
  if (prof.role !== 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'Доступ запрещён' }

  return { ok: true as const }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))

    const jobId = String(body?.job_id || '').trim()
    if (!jobId) return NextResponse.json({ error: 'job_id обязателен' }, { status: 400 })

    const patch: Record<string, any> = {}

    if (body?.site_id != null) patch.site_id = String(body.site_id).trim() || null
    if (body?.worker_id != null) patch.worker_id = String(body.worker_id).trim() || null
    if (body?.job_date != null) patch.job_date = String(body.job_date).trim() || null

    if (body?.scheduled_time != null) {
      const t = String(body.scheduled_time).trim()
      patch.scheduled_time = t ? (t.length === 5 ? `${t}:00` : t) : null
    }

    if (body?.planned_minutes != null) {
      const n = Number(body.planned_minutes)
      if (!Number.isFinite(n) || n < 1 || n > 1440) {
        return NextResponse.json({ error: 'planned_minutes должен быть числом 1..1440' }, { status: 400 })
      }
      patch.planned_minutes = Math.round(n)
    }

    if (body?.status != null) patch.status = String(body.status).trim() || null

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // если scheduled_time пришло в HH:MM — дополним :00
    if (patch.scheduled_time != null && typeof patch.scheduled_time === 'string') {
      const v = patch.scheduled_time
      if (/^\d{2}:\d{2}$/.test(v)) patch.scheduled_time = `${v}:00`
    }

    const { data, error } = await admin.from('jobs').update(patch).eq('id', jobId).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, job: data ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
