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

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await requireUser(req)

    const sp = req.nextUrl.searchParams
    const rawFrom = (sp.get('date_from') || sp.get('from') || '').trim()
    const rawTo = (sp.get('date_to') || sp.get('to') || '').trim()

    const dateFrom = rawFrom && isISODate(rawFrom) ? rawFrom : addDaysISO(todayISO(), -30)
    const dateTo = rawTo && isISODate(rawTo) ? rawTo : addDaysISO(todayISO(), 30)

    const { data: jobs, error: jobsErr } = await supabase
      .from('jobs')
      .select('id,status,job_date,scheduled_time,site_id,worker_id')
      .eq('worker_id', user.id)
      .gte('job_date', dateFrom)
      .lte('job_date', dateTo)
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 400 })

    const siteIds = Array.from(new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean)))

    const [sitesRes, logsRes] = await Promise.all([
      siteIds.length ? supabase.from('sites').select('id,name').in('id', siteIds) : Promise.resolve({ data: [], error: null } as any),
      (jobs || []).length
        ? supabase.from('time_logs').select('job_id,started_at,stopped_at').in(
            'job_id',
            (jobs || []).map((j: any) => j.id)
          )
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

    const items = (jobs || []).map((j: any) => {
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
