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

function normalizeTime(v: any) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return null
  const hh = String(Math.max(0, Math.min(23, parseInt(m[1], 10)))).padStart(2, '0')
  const mm = String(Math.max(0, Math.min(59, parseInt(m[2], 10)))).padStart(2, '0')
  return `${hh}:${mm}:00`
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const jobId = String(body?.job_id || '').trim()
    if (!jobId) return NextResponse.json({ error: 'job_id обязателен' }, { status: 400 })

    const patch: Record<string, any> = {}

    if (body?.job_date != null) {
      const d = String(body.job_date).trim()
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return NextResponse.json({ error: 'job_date неверный формат' }, { status: 400 })
      patch.job_date = d || null
    }

    if (body?.scheduled_time != null) {
      const t = normalizeTime(body.scheduled_time)
      if (body.scheduled_time && !t) return NextResponse.json({ error: 'scheduled_time неверный формат' }, { status: 400 })
      patch.scheduled_time = t
    }


    if (body?.planned_minutes != null) {
      const n = Number(body.planned_minutes)
      if (!Number.isFinite(n) || n < 1 || n > 1440) return NextResponse.json({ error: 'planned_minutes должен быть 1..1440' }, { status: 400 })
      patch.planned_minutes = Math.round(n)
    }

    if (body?.worker_id !== undefined) patch.worker_id = body.worker_id ? String(body.worker_id) : null
    if (body?.site_id !== undefined) patch.site_id = body.site_id ? String(body.site_id) : null
    if (body?.status !== undefined) patch.status = body.status ? String(body.status) : null

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: updated, error: updErr } = await admin.from('jobs').update(patch).eq('id', jobId).select('id,site_id,worker_id').single()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    const siteId = updated?.site_id ? String(updated.site_id) : null
    const workerId = updated?.worker_id ? String(updated.worker_id) : null

    if (siteId && workerId) {
      await admin.from('assignments').upsert({ site_id: siteId, worker_id: workerId }, { onConflict: 'site_id,worker_id', ignoreDuplicates: true } as any)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
