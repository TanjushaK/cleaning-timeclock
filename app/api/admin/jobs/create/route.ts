import { NextRequest, NextResponse } from 'next/server' '@supabase/supabase-js'

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1] || null
}

function cleanEnv(v: string | undefined | null): string {
  const s = String(v ?? '').replace(/\uFEFF/g, '' '"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function envOrThrow(name: string) {
  const v = cleanEnv(process.env[name])
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function assertAdmin(req: NextRequest) {
  const token = bearer(req)
  if (!token) return { ok: false as const, status: 401, error: 'РќРµС‚ РІС…РѕРґР°. РђРІС‚РѕСЂРёР·СѓР№СЃСЏ РІ Р°РґРјРёРЅРєРµ.' 'NEXT_PUBLIC_SUPABASE_URL' 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await sb.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false as const, status: 401, error: 'РќРµРІР°Р»РёРґРЅС‹Р№ С‚РѕРєРµРЅ' 'profiles').select('id, role, active').eq('id' 'РџСЂРѕС„РёР»СЊ РЅРµ РЅР°Р№РґРµРЅ' 'admin' || prof.active !== true) return { ok: false as const, status: 403, error: 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰С‘РЅ' }

  return { ok: true as const }
}

let ASSIGNMENTS_TABLE: string | null = null

async function resolveAssignmentsTable(admin: SupabaseClient) {
  if (ASSIGNMENTS_TABLE) return ASSIGNMENTS_TABLE

  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await admin.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGNMENTS_TABLE = t
      return t
    }
    const msg = String(error?.message || '' 'Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    if (!missing) {
      ASSIGNMENTS_TABLE = t
      return t
    }
  }

  throw new Error('РќРµ РЅР°Р№РґРµРЅР° С‚Р°Р±Р»РёС†Р° РЅР°Р·РЅР°С‡РµРЅРёР№ (assignments/site_workers).')
}

let JOBS_END_TIME_COL: string | null | undefined = undefined

async function resolveJobsEndTimeColumn(admin: SupabaseClient) {
  if (JOBS_END_TIME_COL !== undefined) return JOBS_END_TIME_COL

  const candidates = ['scheduled_time_to', 'scheduled_end_time', 'scheduled_time_end', 'end_time', 'time_to', 'scheduled_to']
  for (const c of candidates) {
    const { error } = await admin.from('jobs').select(c).limit(1)
    if (!error) {
      JOBS_END_TIME_COL = c
      return c
    }

    const msg = String(error?.message || '' 'does not exist') || msg.includes('Could not find') || msg.includes('column') || msg.includes('unknown')
    if (!missing) {
      // РєР°РєР°СЏ-С‚Рѕ РґСЂСѓРіР°СЏ РѕС€РёР±РєР° вЂ” РІСЃС‘ СЂР°РІРЅРѕ Р·Р°РїРѕРјРЅРёРј РєРѕР»РѕРЅРєСѓ, С‡С‚РѕР±С‹ РЅРµ РєСЂСѓС‚РёС‚СЊ РґРµС‚РµРєС‚РѕСЂ Р±РµСЃРєРѕРЅРµС‡РЅРѕ
      JOBS_END_TIME_COL = c
      return c
    }
  }

  JOBS_END_TIME_COL = null
  return null
}

function normalizeHHMM(v: string) {
  const t = String(v || '').trim()
  if (!t) return null
  return t.length === 5 ? `${t}:00` : t
}

export async function POST(req: NextRequest) {
  try {
    const guard = await assertAdmin(req)
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

    const body = await req.json().catch(() => ({} as any))

    const siteId = String(body?.site_id || '' '' '').trim() // HH:MM

    const scheduledTimeToRaw =
      body?.scheduled_time_to ?? body?.scheduled_end_time ?? body?.scheduled_time_end ?? body?.end_time ?? body?.time_to ?? null

    const workerIdsRaw = Array.isArray(body?.worker_ids) ? body.worker_ids : []
    const workerIds = workerIdsRaw.map((x: any) => String(x).trim()).filter(Boolean)

    if (!siteId) return NextResponse.json({ error: 'site_id РѕР±СЏР·Р°С‚РµР»РµРЅ' 'job_date РѕР±СЏР·Р°С‚РµР»РµРЅ' 'scheduled_time РѕР±СЏР·Р°С‚РµР»РµРЅ' 'Р’С‹Р±РµСЂРё С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕРіРѕ СЂР°Р±РѕС‚РЅРёРєР°' 'NEXT_PUBLIC_SUPABASE_URL' 'SUPABASE_SERVICE_ROLE_KEY')
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // Р§С‚РѕР±С‹ Сѓ СЂР°Р±РѕС‚РЅРёРєРѕРІ РЅРµ Р±С‹Р»Рѕ вЂњРїСѓСЃС‚РѕвЂќ, РіР°СЂР°РЅС‚РёСЂСѓРµРј РЅР°Р·РЅР°С‡РµРЅРёРµ РѕР±СЉРµРєС‚в†”СЂР°Р±РѕС‚РЅРёРє
    const assignTable = await resolveAssignmentsTable(admin)
    for (const wid of workerIds) {
      const { data: ex, error: exErr } = await admin.from(assignTable).select('site_id,worker_id').eq('site_id', siteId).eq('worker_id', wid).limit(1)
      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
      if (!Array.isArray(ex) || ex.length === 0) {
        const { error: insAErr } = await admin.from(assignTable).insert([{ site_id: siteId, worker_id: wid }])
        if (insAErr) return NextResponse.json({ error: insAErr.message }, { status: 500 })
      }
    }

    const timeFrom = normalizeHHMM(scheduledTime)
    if (!timeFrom) return NextResponse.json({ error: 'scheduled_time РѕР±СЏР·Р°С‚РµР»РµРЅ' }, { status: 400 })

    const timeTo = scheduledTimeToRaw == null ? null : normalizeHHMM(String(scheduledTimeToRaw))
    const endCol = timeTo ? await resolveJobsEndTimeColumn(admin) : null

    const rows = workerIds.map((worker_id: string) => {
      const row: Record<string, any> = {
        site_id: siteId,
        worker_id,
        job_date: jobDate,
        scheduled_time: timeFrom,
        status: 'planned',
      }
      if (endCol && timeTo) row[endCol] = timeTo
      return row
    })

    const { data, error } = await admin.from('jobs').insert(rows).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, created: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' }, { status: 500 })
  }
}

