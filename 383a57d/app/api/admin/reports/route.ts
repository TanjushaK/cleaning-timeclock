import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type JobStatus = 'planned' | 'in_progress' | 'done'

type TimeLogWithJob = {
  job_id: string
  started_at: string | null
  ended_at: string | null
  jobs: {
    id: string
    status: JobStatus
    job_date: string
    scheduled_time: string | null
    planned_minutes: number | null
    worker_id: string
    site_id: string
    sites: { id: string; name: string; address: string | null } | null
    profiles: { id: string; full_name: string | null; phone: string | null; avatar_url: string | null } | null
  } | null
}

function parseQS(url: string) {
  const u = new URL(url)
  const from = u.searchParams.get('from')?.trim() || ''
  const to = u.searchParams.get('to')?.trim() || ''
  const worker_id = u.searchParams.get('worker_id')?.trim() || ''
  return { from, to, worker_id }
}

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function dateToStartTs(d: string) {
  return `${d}T00:00:00.000Z`
}

function addDaysISO(d: string, days: number) {
  const [y, m, dd] = d.split('-').map((x) => Number(x))
  const dt = new Date(Date.UTC(y, m - 1, dd))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const ddd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${ddd}`
}

function minutesBetween(a: string, b: string) {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db) || db < da) return 0
  return Math.round((db - da) / 60000)
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const supabase = getSupabaseAdmin()

    const { from, to, worker_id } = parseQS(request.url)
    if (!isISODate(from) || !isISODate(to)) throw new Error('RANGE_REQUIRED')

    const fromTs = dateToStartTs(from)
    const toExclusive = addDaysISO(to, 1)
    const toTs = dateToStartTs(toExclusive)

    let q = supabase
      .from('time_logs')
      .select(
        `
        job_id,
        started_at,
        ended_at,
        jobs (
          id,
          status,
          job_date,
          scheduled_time,
          planned_minutes,
          worker_id,
          site_id,
          sites ( id, name, address ),
          profiles:profiles!jobs_worker_id_fkey ( id, full_name, phone, avatar_url )
        )
      `
      )
      .gte('started_at', fromTs)
      .lt('started_at', toTs)
      .order('started_at', { ascending: false })

    if (worker_id) q = q.eq('jobs.worker_id', worker_id)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as TimeLogWithJob[]

    const outRows: Array<{
      job_id: string
      job_date: string
      scheduled_time: string | null
      planned_minutes: number | null
      status: JobStatus
      worker_id: string
      worker_name: string | null
      worker_avatar_url: string | null
      site_id: string
      site_name: string | null
      started_at: string
      ended_at: string
      minutes: number
    }> = []

    const incomplete: Array<{ job_id: string; worker_id: string; started_at: string }> = []

    const byWorker: Record<
      string,
      {
        worker_id: string
        worker_name: string | null
        avatar_url: string | null
        minutes: number
      }
    > = {}

    let totalMinutes = 0

    for (const r of rows) {
      const j = r.jobs
      if (!j) continue

      const wid = j.worker_id
      const p = j.profiles

      if (r.started_at && !r.ended_at) {
        incomplete.push({ job_id: r.job_id, worker_id: wid, started_at: r.started_at })
        continue
      }

      if (!r.started_at || !r.ended_at) continue
      const mins = minutesBetween(r.started_at, r.ended_at)
      if (mins <= 0) continue

      if (!byWorker[wid]) {
        byWorker[wid] = {
          worker_id: wid,
          worker_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
          minutes: 0,
        }
      }

      byWorker[wid].minutes += mins
      totalMinutes += mins

      outRows.push({
        job_id: r.job_id,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time ?? null,
        planned_minutes: j.planned_minutes ?? null,
        status: j.status,
        worker_id: wid,
        worker_name: p?.full_name ?? null,
        worker_avatar_url: p?.avatar_url ?? null,
        site_id: j.site_id,
        site_name: j.sites?.name ?? null,
        started_at: r.started_at,
        ended_at: r.ended_at,
        minutes: mins,
      })
    }

    const by_worker = Object.values(byWorker)
      .sort((a, b) => b.minutes - a.minutes)
      .map((x) => ({
        worker_id: x.worker_id,
        worker_name: x.worker_name,
        avatar_url: x.avatar_url,
        minutes: x.minutes,
        hours: Math.round((x.minutes / 60) * 100) / 100,
      }))

    return NextResponse.json({
      from,
      to,
      total_minutes: totalMinutes,
      total_hours: Math.round((totalMinutes / 60) * 100) / 100,
      by_worker,
      rows: outRows,
      incomplete,
    })
  } catch (e: any) {
    const msg = e?.message === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : e?.message === 'FORBIDDEN' ? 'FORBIDDEN' : e?.message
    const status = msg === 'UNAUTHORIZED' ? 401 : msg === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: msg ?? 'ERROR' }, { status })
  }
}
