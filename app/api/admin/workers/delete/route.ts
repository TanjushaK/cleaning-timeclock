// app/api/admin/workers/delete/route.ts
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
  if (!token) return { ok: false as const, status: 401, error: 'Нет токена (Authorization: Bearer ...)' }

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
  if (prof.role !== 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'FORBIDDEN' }

  return { ok: true as const, adminUserId: userData.user.id }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))
    const workerId = String(body?.worker_id || '').trim()
    if (!workerId) return NextResponse.json({ error: 'worker_id обязателен' }, { status: 400 })

    const url = envOrThrow('NEXT_PUBLIC_SUPABASE_URL')
    const service = envOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 0) нельзя удалять админа
    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', workerId)
      .single()

    if (profErr || !prof) return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })
    if (prof.role === 'admin') return NextResponse.json({ error: 'Админа удалить нельзя' }, { status: 409 })

    // 1) если есть time_logs — запрет (сохраняем отчёты)
    const { data: logsHit, error: logsErr } = await admin
      .from('time_logs')
      .select('id')
      .eq('worker_id', workerId)
      .limit(1)

    if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 })
    if (logsHit && logsHit.length > 0) {
      return NextResponse.json(
        { error: 'Нельзя удалить работника: есть таймлоги. Используй "Отключить".' },
        { status: 409 }
      )
    }

    // 2) если есть jobs — тоже запрет (в зависимости от модели данных)
    const { data: jobsHit, error: jobsErr } = await admin
      .from('jobs')
      .select('id')
      .eq('worker_id', workerId)
      .limit(1)

    if (jobsErr) {
      // если в схеме нет worker_id — не валим удаление, просто идём дальше
    } else if (jobsHit && jobsHit.length > 0) {
      return NextResponse.json(
        { error: 'Нельзя удалить работника: есть смены. Используй "Отключить".' },
        { status: 409 }
      )
    }

    // 3) чистим assignments
    await admin.from('assignments').delete().eq('worker_id', workerId)

    // 4) удаляем профиль
    const { error: profDelErr } = await admin.from('profiles').delete().eq('id', workerId)
    if (profDelErr) return NextResponse.json({ error: profDelErr.message }, { status: 500 })

    // 5) удаляем auth user (service role)
    const { error: authDelErr } = await admin.auth.admin.deleteUser(workerId)
    if (authDelErr) {
      return NextResponse.json(
        { error: `Профиль удалён, но auth user не удалён: ${authDelErr.message}` },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
