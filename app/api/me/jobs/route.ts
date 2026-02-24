import { NextRequest, NextResponse } from 'next/server'
import { requireActiveWorker } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SitePhoto = { path: string; url?: string | null; created_at?: string | null }

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

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

function getSignedTtlSeconds() {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL
  const n = raw ? Number.parseInt(raw, 10) : 86400
  return Number.isFinite(n) && n > 0 ? n : 86400
}

function normalizePhotos(v: any): SitePhoto[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((p) => p && typeof p === 'object' && typeof (p as any).path === 'string')
    .map((p) => ({
      path: String((p as any).path),
      url: (p as any).url ? String((p as any).url) : null,
      created_at: (p as any).created_at ? String((p as any).created_at) : null,
    }))
}

const RAW_BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'
const { bucket: SITE_PHOTOS_BUCKET } = parseBucketRef(RAW_BUCKET, 'site-photos')

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
    const rawFrom = (sp.get('date_from') || sp.get('from') || '').trim()
    const rawTo = (sp.get('date_to') || sp.get('to') || '').trim()

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
        .from('jobs')
        .select('id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id')
        .eq('worker_id', userId)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)

      if (error && String(error.message || '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await supabase
          .from('jobs')
          .select('id,status,job_date,scheduled_time,site_id,worker_id')
          .eq('worker_id', userId)
          .gte('job_date', dateFrom)
          .lte('job_date', dateTo)
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
        .from('jobs')
        .select('id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id')
        .in('id', jobIdsViaLink)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)

      if (error && String(error.message || '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await supabase
          .from('jobs')
          .select('id,status,job_date,scheduled_time,site_id,worker_id')
          .in('id', jobIdsViaLink)
          .gte('job_date', dateFrom)
          .lte('job_date', dateTo)
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
        .from('jobs')
        .select('id,status,job_date,scheduled_time,scheduled_end_time,site_id,worker_id')
        .is('worker_id', null)
        .eq('status', 'planned')
        .in('site_id', siteIds)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)

      if (error && String(error.message || '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await supabase
          .from('jobs')
          .select('id,status,job_date,scheduled_time,site_id,worker_id')
          .is('worker_id', null)
          .eq('status', 'planned')
          .in('site_id', siteIds)
          .gte('job_date', dateFrom)
          .lte('job_date', dateTo)
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        jobsC = d2 || []
      } else {
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
        jobsC = data || []
      }
    }

    // uniq by id
    const byId = new Map<string, any>()
    for (const j of [...jobsA, ...jobsB, ...jobsC]) {
      if (!j?.id) continue
      byId.set(String(j.id), j)
    }
    const jobs = Array.from(byId.values())

    jobs.sort((a, b) => {
      const da = String(a.job_date || '')
      const db = String(b.job_date || '')
      if (da !== db) return da < db ? -1 : 1
      const ta = String(a.scheduled_time || '')
      const tb = String(b.scheduled_time || '')
      if (ta !== tb) return ta < tb ? -1 : 1
      return String(a.id).localeCompare(String(b.id))
    })

    const jobIds = jobs.map((j) => String(j.id))
    const siteIds2 = Array.from(new Set(jobs.map((j: any) => j.site_id).filter(Boolean)))

    const [sitesRes0, logsRes] = await Promise.all([
      siteIds2.length
        ? supabase.from('sites').select('id,name,address,lat,lng,radius,photos').in('id', siteIds2)
        : Promise.resolve({ data: [], error: null } as any),
      jobIds.length
        ? supabase
            .from('time_logs')
            .select('job_id,started_at,stopped_at,start_lat,start_lng,start_accuracy')
            .in('job_id', jobIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    let sitesRes = sitesRes0
    if (sitesRes0.error && String(sitesRes0.error.message || '').toLowerCase().includes('photos')) {
      sitesRes = siteIds2.length
        ? await supabase.from('sites').select('id,name,address,lat,lng,radius').in('id', siteIds2)
        : ({ data: [], error: null } as any)
    }

    if (sitesRes.error) return NextResponse.json({ error: sitesRes.error.message }, { status: 400 })
    if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 400 })

    const sitesData = (sitesRes.data || []) as any[]

    const photosBySite = new Map<string, SitePhoto[]>()
    const allPhotoPaths: string[] = []

    for (const s of sitesData) {
      const sid = String(s.id)
      const photos = normalizePhotos((s as any).photos)
      photosBySite.set(sid, photos)
      for (const p of photos) if (p.path) allPhotoPaths.push(p.path)
    }

    const uniquePaths = Array.from(new Set(allPhotoPaths)).filter(Boolean)
    const urlByPath = new Map<string, string>()

    if (uniquePaths.length) {
      const ttl = getSignedTtlSeconds()
      const { data: signed, error: sErr } = await supabase.storage.from(SITE_PHOTOS_BUCKET).createSignedUrls(uniquePaths, ttl)
      if (!sErr && Array.isArray(signed)) {
        for (const item of signed as any[]) {
          const p = item?.path ? String(item.path) : ''
          const u = item?.signedUrl ? String(item.signedUrl) : ''
          if (p && u) urlByPath.set(p, u)
        }
      }
    }

    const siteInfo = new Map<
      string,
      {
        name: string | null
        address: string | null
        lat: number | null
        lng: number | null
        radius: number | null
        photos: SitePhoto[]
        thumb_url: string | null
      }
    >()

    for (const s of sitesData) {
      const sid = String(s.id)
      const photos = photosBySite.get(sid) || []
      const first = photos[0]
      const thumbUrl = first ? urlByPath.get(first.path) || (first.url ? String(first.url) : '') : ''
      siteInfo.set(sid, {
        name: s.name ?? null,
        address: s.address ?? null,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        radius: s.radius ?? null,
        photos,
        thumb_url: thumbUrl || null,
      })
    }

    // logs aggregate
    const logAgg = new Map<string, any>()
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

      if (sa) if (!cur.started_at || sa < cur.started_at) cur.started_at = sa
      if (so) if (!cur.stopped_at || so > cur.stopped_at) cur.stopped_at = so
      if (sa && so) cur.actual_minutes += minutesBetween(sa, so)

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
      if (si?.lat != null && si?.lng != null && agg.latest_start_lat != null && agg.latest_start_lng != null) {
        distance_m = Math.round(haversineMeters(agg.latest_start_lat, agg.latest_start_lng, si.lat, si.lng))
      }

      const can_accept = String(j.status || '') === 'planned' && j.worker_id == null && siteIds.includes(String(j.site_id || ''))

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
        site_photo_url: si?.thumb_url ?? null,
        site_photos_count: si?.photos?.length ?? 0,

        accepted_at: null,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
        distance_m,
        accuracy_m: agg.latest_start_accuracy,
        worker_note: null,

        worker_id: j.worker_id,
        actual_minutes: agg.actual_minutes || 0,
        can_accept,
      }
    })

    return NextResponse.json({ jobs: items, items })
  } catch (e: any) {
    const msg = e?.message || 'Ошибка'
    const status = /Нет токена/i.test(msg) ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
