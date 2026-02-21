import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysISO(iso: string, deltaDays: number) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

let ASSIGN_TABLE: string | null | undefined = undefined

async function resolveAssignmentsTable(supabase: any): Promise<string | null> {
  if (ASSIGN_TABLE !== undefined) return ASSIGN_TABLE
  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await supabase.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGN_TABLE = t
      return t
    }
    const msg = String(error?.message || '')
    const missing = msg.includes('Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    if (!missing) {
      // таблица есть, но другая проблема — всё равно запомним
      ASSIGN_TABLE = t
      return t
    }
  }
  ASSIGN_TABLE = null
  return null
}

async function safeGetAssignedSiteIds(supabase: any, workerId: string): Promise<string[]> {
  try {
    const t = await resolveAssignmentsTable(supabase)
    if (!t) return []
    const { data, error } = await supabase.from(t).select('site_id').eq('worker_id', workerId)
    if (error) return []
    return Array.from(new Set((data || []).map((x: any) => String(x.site_id)).filter(Boolean)))
  } catch {
    return []
  }
}

async function safeGetJobWorkerJobIds(supabase: any, workerId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('job_workers').select('job_id').eq('worker_id', workerId)
    if (error) return []
    return Array.from(new Set((data || []).map((x: any) => String(x.job_id)).filter(Boolean)))
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser(req)
    const uid = user.id

    const sp = req.nextUrl.searchParams
    const rawFrom = (sp.get('date_from') || sp.get('from') || '').trim()
    const rawTo = (sp.get('date_to') || sp.get('to') || '').trim()

    // по умолчанию шире, чтобы “не пусто”
    const dateFrom = rawFrom && isISODate(rawFrom) ? rawFrom : addDaysISO(todayISO(), -90)
    const dateTo = rawTo && isISODate(rawTo) ? rawTo : addDaysISO(todayISO(), 180)

    const [siteIds, jobIdsViaLink] = await Promise.all([
      safeGetAssignedSiteIds(supabase, uid),
      safeGetJobWorkerJobIds(supabase, uid),
    ])

    // 1) прямые смены (worker_id = uid)
    const { data: jobsA, error: errA } = await supabase
      .from('jobs')
      .select('id,status,job_date,scheduled_time,site_id,worker_id')
      .eq('worker_id', uid)
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)
    if (errA) return NextResponse.json({ error: errA.message }, { status: 400 })

    // 2) смены через job_workers
    const jobsB: any[] = []
    if (jobIdsViaLink.length) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id,status,job_date,scheduled_time,site_id,worker_id')
        .in('id', jobIdsViaLink)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      jobsB.push(...(data || []))
    }

    // 3) смены по объектам, где работник назначен (только если worker_id NULL)
    const jobsC: any[] = []
    if (siteIds.length) {
      const { data, error } = await supabase
        .from('jobs')
        .select('id,status,job_date,scheduled_time,site_id,worker_id')
        .is('worker_id', null)
        .in('site_id', siteIds)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      jobsC.push(...(data || []))
    }

    const all = [...(jobsA || []), ...jobsB, ...jobsC]

    // uniq by id
    const byId = new Map<string, any>()
    for (const j of all) {
      if (!j?.id) continue
      byId.set(String(j.id), j)
    }
    const jobs = Array.from(byId.values())

    jobs.sort((a: any, b: any) => {
      const da = String(a.job_date || '')
      const db = String(b.job_date || '')
      if (da !== db) return da < db ? -1 : 1
      const ta = String(a.scheduled_time || '')
      const tb = String(b.scheduled_time || '')
      if (ta !== tb) return ta < tb ? -1 : 1
      return String(a.id).localeCompare(String(b.id))
    })

    const siteIds2 = Array.from(new Set(jobs.map((j: any) => j.site_id).filter(Boolean)))
    const jobIds2 = jobs.map((j: any) => j.id)

    const [sitesRes, logsRes] = await Promise.all([
      siteIds2.length
        ? supabase.from('sites').select('id,name').in('id', siteIds2)
        : Promise.resolve({ data: [], error: null } as any),
      jobIds2.length
        ? supabase.from('time_logs').select('job_id,started_at,stopped_at').in('job_id', jobIds2)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 400 })
    if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 400 })

    const siteName = new Map<string, string>()
    for (const s of (sitesRes.data || []) as any[]) siteName.set(String(s.id), s.name || '')

    const logAgg = new Map<string, { started_at: string | null; stopped_at: string | null }>()
    for (const l of (logsRes.data || []) as any[]) {
      const id = String(l.job_id)
      const cur = logAgg.get(id) || { started_at: null, stopped_at: null }
      if (l.started_at) {
        if (!cur.started_at || String(l.started_at) < cur.started_at) cur.started_at = String(l.started_at)
      }
      if (l.stopped_at) {
        if (!cur.stopped_at || String(l.stopped_at) > cur.stopped_at) cur.stopped_at = String(l.stopped_at)
      }
      logAgg.set(id, cur)
    }

    const items = jobs.map((j: any) => {
      const agg = logAgg.get(String(j.id)) || { started_at: null, stopped_at: null }
      return {
        id: String(j.id),
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        site_id: j.site_id,
        site_name: j.site_id ? siteName.get(String(j.site_id)) || null : null,
        worker_id: j.worker_id,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
      }
    })

    return NextResponse.json({ items })
  } catch (e: any) {
    const msg = e?.message || 'Ошибка'
    const status = /Нет токена/i.test(msg) ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
