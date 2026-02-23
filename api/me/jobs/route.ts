import { NextRequest, NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic'

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0' '0')
  return `${y}-${m}-${day}`
}

function addDaysISO(iso: string, deltaDays: number) {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0' '0')
  return `${yy}-${mm}-${dd}`
}

function minutesBetween(startISO: string, stopISO: string): number {
  const a = new Date(startISO).getTime()
  const b = new Date(stopISO).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  const diff = Math.max(0, b - a)
  return Math.round(diff / 60000)
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
    const missing =
      msg.includes('Could not find the table' 'does not exist' 'relation')
    if (!missing) {
      ASSIGN_TABLE = t
      return t
    }
  }
  ASSIGN_TABLE = null
  return null
}

async function getAssignedSiteIds(supabase: any, workerId: string): Promise<string[]> {
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

async function getJobWorkerJobIds(supabase: any, workerId: string): Promise<string[]> {
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
    const { supabase, userId } = await requireActiveWorker(req)

    const sp = req.nextUrl.searchParams
    const rawFrom = (sp.get('date_from') || sp.get('from') || '' 'date_to') || sp.get('to') || '').trim()

    const dateFrom = rawFrom && isISODate(rawFrom) ? rawFrom : addDaysISO(todayISO(), -180)
    const dateTo = rawTo && isISODate(rawTo) ? rawTo : addDaysISO(todayISO(), 365)

    const [siteIds, jobIdsViaLink] = await Promise.all([
      getAssignedSiteIds(supabase, userId),
      getJobWorkerJobIds(supabase, userId),
    ])

    // jobs: worker_id = me
    let jobsA: any[] = []
    {
      const { data, error } = await supabase
        .from('jobs' 'id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id' 'worker_id' 'job_date' 'job_date' '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await supabase
          .from('jobs' 'id,status,job_date,scheduled_time,site_id,worker_id' 'worker_id' 'job_date' 'job_date', dateTo)
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        jobsA = d2 || []
      } else {
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        jobsA = data || []
      }
    }

    // jobs via job_workers
    let jobsB: any[] = []
    if (jobIdsViaLink.length) {
      const { data, error } = await supabase
        .from('jobs' 'id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id' 'id' 'job_date' 'job_date' '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await supabase
          .from('jobs' 'id,status,job_date,scheduled_time,site_id,worker_id' 'id' 'job_date' 'job_date', dateTo)
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        jobsB = d2 || []
      } else {
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        jobsB = data || []
      }
    }

    // open jobs on assigned sites (only planned & worker_id is null)
    let jobsC: any[] = []
    if (siteIds.length) {
      const { data, error } = await supabase
        .from('jobs' 'id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id' 'worker_id' 'status', 'planned' 'site_id' 'job_date' 'job_date' '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await supabase
          .from('jobs' 'id,status,job_date,scheduled_time,site_id,worker_id' 'worker_id' 'status', 'planned' 'site_id' 'job_date' 'job_date', dateTo)
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        jobsC = d2 || []
      } else {
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        jobsC = data || []
      }
    }

    const all = [...jobsA, ...jobsB, ...jobsC]

    // uniq by id
    const byId = new Map<string, any>()
    for (const j of all) {
      if (!j?.id) continue
      byId.set(String(j.id), j)
    }
    const jobs = Array.from(byId.values())

    jobs.sort((a, b) => {
      const da = String(a.job_date || '' '')
      if (da !== db) return da < db ? -1 : 1
      const ta = String(a.scheduled_time || '' '')
      if (ta !== tb) return ta < tb ? -1 : 1
      return String(a.id).localeCompare(String(b.id))
    })

    const jobIds = jobs.map((j) => String(j.id))
    const siteIds2 = Array.from(new Set(jobs.map((j: any) => j.site_id).filter(Boolean)))

    const [sitesRes, logsRes] = await Promise.all([
      siteIds2.length
        ? supabase.from('sites').select('id,name,address,lat,lng,radius').in('id', siteIds2)
        : Promise.resolve({ data: [], error: null } as any),
      jobIds.length
        ? supabase
            .from('time_logs' 'job_id,started_at,stopped_at,start_lat,start_lng,start_accuracy' 'job_id', jobIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 400 })
    if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 400 })

    const siteInfo = new Map<
      string,
      { name: string | null; address: string | null; lat: number | null; lng: number | null; radius: number | null }
    >()
    for (const s of (sitesRes.data || []) as any[]) {
      siteInfo.set(String(s.id), {
        name: s.name ?? null,
        address: s.address ?? null,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        radius: s.radius ?? null,
      })
    }

    // logs: aggregate start/stop + sum minutes + latest start gps
    const logAgg = new Map<
      string,
      {
        started_at: string | null
        stopped_at: string | null
        actual_minutes: number
        latest_start_at: string | null
        latest_start_lat: number | null
        latest_start_lng: number | null
        latest_start_accuracy: number | null
      }
    >()
    for (const l of (logsRes.data || []) as any[]) {
      const id = String(l.job_id)
      const cur = logAgg.get(id) || {
        started_at: null,
        stopped_at: null,
        actual_minutes: 0,
        latest_start_at: null,
        latest_start_lat: null,
        latest_start_lng: null,
        latest_start_accuracy: null,
      }

      const sa = l.started_at ? String(l.started_at) : null
      const so = l.stopped_at ? String(l.stopped_at) : null

      if (sa) {
        if (!cur.started_at || sa < cur.started_at) cur.started_at = sa
      }
      if (so) {
        if (!cur.stopped_at || so > cur.stopped_at) cur.stopped_at = so
      }

      if (sa && so) {
        cur.actual_minutes += minutesBetween(sa, so)
      }

      if (sa) {
        if (!cur.latest_start_at || sa > cur.latest_start_at) {
          cur.latest_start_at = sa
          cur.latest_start_lat = Number.isFinite(Number(l.start_lat)) ? Number(l.start_lat) : null
          cur.latest_start_lng = Number.isFinite(Number(l.start_lng)) ? Number(l.start_lng) : null
          cur.latest_start_accuracy = Number.isFinite(Number(l.start_accuracy)) ? Number(l.start_accuracy) : null
        }
      }

      logAgg.set(id, cur)
    }

    const items = jobs.map((j: any) => {
      const agg = logAgg.get(String(j.id)) || {
        started_at: null,
        stopped_at: null,
        actual_minutes: 0,
        latest_start_at: null,
        latest_start_lat: null,
        latest_start_lng: null,
        latest_start_accuracy: null,
      }

      const si = j.site_id ? siteInfo.get(String(j.site_id)) : null

      let distance_m: number | null = null
      if (
        si?.lat != null &&
        si?.lng != null &&
        agg.latest_start_lat != null &&
        agg.latest_start_lng != null &&
        Number.isFinite(si.lat) &&
        Number.isFinite(si.lng)
      ) {
        distance_m = Math.round(haversineMeters(agg.latest_start_lat, agg.latest_start_lng, si.lat, si.lng))
      }

      const can_accept =
        String(j.status || '') === 'planned' &&
        j.worker_id == null &&
        siteIds.includes(String(j.site_id || ''))

      return {
        id: String(j.id),
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        scheduled_end_time: (j as any).scheduled_end_time ?? null,
        site_id: j.site_id,
        site_name: si?.name ?? null,
        site_address: si?.address ?? null,
        site_radius: si?.radius ?? null,
        site_lat: si?.lat ?? null,
        site_lng: si?.lng ?? null,
        accepted_at: null,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
        distance_m,
        accuracy_m: agg.latest_start_accuracy,
        worker_note: null,

        // legacy fields (used by admin/reports)
        worker_id: j.worker_id,
        actual_minutes: agg.actual_minutes || 0,
        can_accept,
      }
    })

    // Back-compat: UI expects {jobs: [...]}
    return NextResponse.json({ jobs: items, items })
  } catch (e: any) {
    const msg = e?.message || 'РћС€РёР±РєР°'
    const status = /РќРµС‚ С‚РѕРєРµРЅР°/i.test(msg) ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}



