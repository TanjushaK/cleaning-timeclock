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
    const fromWorker = String(body?.from_worker_id || '').trim()
    const toWorker = String(body?.to_worker_id || '').trim()
    const jobDate = String(body?.job_date || '').trim()
    const onlyPlanned = !!body?.only_planned

    if (!fromWorker || !toWorker || !jobDate) return NextResponse.json({ error: 'from_worker_id, to_worker_id, job_date обязательны' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) return NextResponse.json({ error: 'job_date неверный формат' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    let q = admin.from('jobs').select('id,site_id').eq('worker_id', fromWorker).eq('job_date', jobDate)
    if (onlyPlanned) q = q.eq('status', 'planned')

    const { data: rows, error: selErr } = await q
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })

    const ids = (rows || []).map((r: any) => r.id)
    const siteIds = Array.from(new Set((rows || []).map((r: any) => r.site_id).filter(Boolean)))

    if (ids.length === 0) return NextResponse.json({ ok: true, moved: 0 })

    const { error: updErr } = await admin.from('jobs').update({ worker_id: toWorker }).in('id', ids)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    if (siteIds.length) {
      const upserts = siteIds.map((sid) => ({ site_id: sid, worker_id: toWorker }))
      await admin.from('assignments').upsert(upserts, { onConflict: 'site_id,worker_id', ignoreDuplicates: true } as any)
    }

    return NextResponse.json({ ok: true, moved: ids.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Ошибка сервера' }, { status: 500 })
  }
}
