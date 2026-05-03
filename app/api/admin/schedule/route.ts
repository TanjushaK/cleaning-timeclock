import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import {
  expandTeamsByJob,
  fetchJobWorkerLinksByJob,
  normalizeWorkerId,
  workerDisplayLabel,
} from '@/lib/job-shift-team'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

type ProfileLite = { id: string; full_name: string | null; email: string | null; active: boolean | null }

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

export async function GET(req: NextRequest) {
  try {
    const { db: admin } = await requireAdmin(req)

    const sp = req.nextUrl.searchParams

    const rawFrom = (sp.get('date_from') || sp.get('from') || '').trim()
    const rawTo = (sp.get('date_to') || sp.get('to') || '').trim()

    if (!rawFrom || !rawTo) {
      throw new ApiError(400, 'from and to are required', AdminApiErrorCode.SCHEDULE_DATES_REQUIRED)
    }
    if (!isISODate(rawFrom) || !isISODate(rawTo)) {
      throw new ApiError(400, 'Invalid date range', AdminApiErrorCode.SCHEDULE_DATES_INVALID)
    }

    const dateFrom = rawFrom
    const dateTo = rawTo

    const siteId = (sp.get('site_id') || '').trim()
    const workerId = (sp.get('worker_id') || '').trim()

    const baseSelect = 'id,status,job_date,scheduled_time,site_id,worker_id'

    async function fetchJobsInRange(): Promise<any[]> {
      let q = admin
        .from('jobs')
        .select(`${baseSelect},scheduled_end_time`)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)

      if (siteId) q = q.eq('site_id', siteId)

      let { data: jobs, error: jobsErr } = await q

      if (jobsErr && String(jobsErr?.message || '').toLowerCase().includes('scheduled_end_time')) {
        let q2 = admin
          .from('jobs')
          .select(baseSelect)
          .gte('job_date', dateFrom)
          .lte('job_date', dateTo)
        if (siteId) q2 = q2.eq('site_id', siteId)
        ;({ data: jobs, error: jobsErr } = await q2)
      }

      if (jobsErr) throw new ApiError(500, jobsErr.message || 'Query failed', AdminApiErrorCode.DB_ERROR)
      return jobs || []
    }

    async function fetchJobsForWorkerFilter(): Promise<any[]> {
      let qPrimary = admin
        .from('jobs')
        .select(`${baseSelect},scheduled_end_time`)
        .gte('job_date', dateFrom)
        .lte('job_date', dateTo)
        .eq('worker_id', workerId)

      if (siteId) qPrimary = qPrimary.eq('site_id', siteId)

      let { data: primaryJobs, error: pErr } = await qPrimary

      if (pErr && String(pErr?.message || '').toLowerCase().includes('scheduled_end_time')) {
        let q2 = admin
          .from('jobs')
          .select(baseSelect)
          .gte('job_date', dateFrom)
          .lte('job_date', dateTo)
          .eq('worker_id', workerId)
        if (siteId) q2 = q2.eq('site_id', siteId)
        ;({ data: primaryJobs, error: pErr } = await q2)
      }

      if (pErr) throw new ApiError(500, pErr.message || 'Query failed', AdminApiErrorCode.DB_ERROR)

      let linkJobIds: string[] = []
      const jwRes = await admin.from('job_workers').select('job_id').eq('worker_id', workerId)

      if (jwRes.error) {
        const msg = String(jwRes.error.message || '')
        if (!/does not exist|relation|schema cache/i.test(msg)) {
          throw new ApiError(500, jwRes.error.message, AdminApiErrorCode.DB_ERROR)
        }
      } else {
        linkJobIds = Array.from(
          new Set((jwRes.data || []).map((r: { job_id?: string | null }) => String(r.job_id || '').trim()).filter(Boolean)),
        )
      }

      const extraJobs: any[] = []
      if (linkJobIds.length) {
        for (const part of chunk(linkJobIds, 200)) {
          let qExtra = admin
            .from('jobs')
            .select(`${baseSelect},scheduled_end_time`)
            .in('id', part)
            .gte('job_date', dateFrom)
            .lte('job_date', dateTo)

          if (siteId) qExtra = qExtra.eq('site_id', siteId)

          let { data: ej, error: eErr } = await qExtra

          if (eErr && String(eErr?.message || '').toLowerCase().includes('scheduled_end_time')) {
            let q3 = admin.from('jobs').select(baseSelect).in('id', part).gte('job_date', dateFrom).lte('job_date', dateTo)
            if (siteId) q3 = q3.eq('site_id', siteId)
            ;({ data: ej, error: eErr } = await q3)
          }

          if (eErr) throw new ApiError(500, eErr.message || 'Query failed', AdminApiErrorCode.DB_ERROR)
          extraJobs.push(...(ej || []))
        }
      }

      const byId = new Map<string, any>()
      for (const j of [...(primaryJobs || []), ...extraJobs]) {
        if (j?.id) byId.set(String(j.id), j)
      }
      return Array.from(byId.values())
    }

    let jobs: any[] = []
    if (!workerId) {
      jobs = await fetchJobsInRange()
    } else {
      jobs = await fetchJobsForWorkerFilter()
    }

    const jobIds = (jobs || []).map((j: any) => String(j.id))
    const siteIds = Array.from(new Set((jobs || []).map((j: any) => j.site_id).filter(Boolean)))
    const primaryWorkerIds = Array.from(new Set((jobs || []).map((j: any) => j.worker_id).filter(Boolean)))

    const linksByJob = await fetchJobWorkerLinksByJob(admin, jobIds)

    let teamsByJob: Map<string, Set<string>>
    try {
      teamsByJob = await expandTeamsByJob(admin, jobs || [], linksByJob)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new ApiError(500, msg || 'Team expansion failed', AdminApiErrorCode.DB_ERROR)
    }

    const allWorkerIds = new Set<string>()
    for (const jid of jobIds) {
      for (const wid of teamsByJob.get(jid) || []) allWorkerIds.add(wid)
    }

    const [sitesRes, logsRes] = await Promise.all([
      siteIds.length
        ? admin.from('sites').select('id,name,address,lat,lng').in('id', siteIds)
        : Promise.resolve({ data: [], error: null } as any),
      jobIds.length ? admin.from('time_logs').select('job_id,started_at,stopped_at').in('job_id', jobIds) : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) throw new ApiError(500, sitesRes.error.message, AdminApiErrorCode.DB_ERROR)
    if (logsRes.error) throw new ApiError(500, logsRes.error.message, AdminApiErrorCode.DB_ERROR)

    const mergedProfiles: ProfileLite[] = []
    const workerIdList = Array.from(allWorkerIds)
    if (workerIdList.length) {
      for (const part of chunk(workerIdList, 200)) {
        const r = await admin.from('profiles').select('id,full_name,email,active').in('id', part)
        if (r.error) throw new ApiError(500, r.error.message, AdminApiErrorCode.DB_ERROR)
        for (const p of (r.data || []) as any[]) {
          mergedProfiles.push({
            id: String(p.id),
            full_name: p.full_name ?? null,
            email: p.email ?? null,
            active: typeof p.active === 'boolean' ? p.active : null,
          })
        }
      }
    }

    const profileById = new Map<string, ProfileLite>()
    for (const w of mergedProfiles) {
      profileById.set(w.id, w)
    }

    const siteName = new Map<string, string>()
    const siteMeta = new Map<string, { address: string | null; lat: number | null; lng: number | null }>()
    for (const s of (sitesRes.data || []) as any[]) {
      const sid = String(s.id)
      siteName.set(sid, s.name || '')
      siteMeta.set(sid, {
        address: s.address ?? null,
        lat: s.lat != null && Number.isFinite(Number(s.lat)) ? Number(s.lat) : null,
        lng: s.lng != null && Number.isFinite(Number(s.lng)) ? Number(s.lng) : null,
      })
    }

    const workerName = new Map<string, string>()
    for (const wid of primaryWorkerIds) {
      const p = profileById.get(String(wid))
      workerName.set(String(wid), workerDisplayLabel(p ?? undefined, String(wid)))
    }

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
      const jid = String(j.id)
      const agg = logAgg.get(jid) || { started_at: null, stopped_at: null }
      const primary = normalizeWorkerId(j.worker_id)

      const roster = Array.from(teamsByJob.get(jid) || [])
        .map((id) => normalizeWorkerId(id))
        .filter(Boolean)
      const participant_worker_ids = Array.from(new Set(roster)).sort((a, b) => a.localeCompare(b))

      const others = primary ? roster.filter((id) => normalizeWorkerId(id) !== primary) : roster

      const coworkers = others
        .map((cid) => {
          const prof = profileById.get(cid)
          return {
            id: cid,
            name: workerDisplayLabel(prof ?? undefined, cid),
            active: typeof prof?.active === 'boolean' ? prof.active : null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      const sid = j.site_id ? String(j.site_id) : ''
      const sm = sid ? siteMeta.get(sid) : undefined

      return {
        id: jid,
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        scheduled_end_time: (j as any).scheduled_end_time ?? null,
        site_id: j.site_id,
        site_name: sid ? siteName.get(sid) || null : null,
        site_address: sm?.address ?? null,
        site_lat: sm?.lat ?? null,
        site_lng: sm?.lng ?? null,
        worker_id: j.worker_id,
        worker_name: j.worker_id
          ? workerName.get(String(j.worker_id)) ||
            workerDisplayLabel(profileById.get(String(j.worker_id)) ?? undefined, String(j.worker_id))
          : null,
        started_at: agg.started_at,
        stopped_at: agg.stopped_at,
        coworkers,
        participant_worker_ids,
      }
    })

    return NextResponse.json({ items })
  } catch (e) {
    return toErrorResponse(e)
  }
}
