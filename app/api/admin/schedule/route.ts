import { NextRequest, NextResponse } from 'next/server'

import { AdminApiErrorCode } from '@/lib/api-error-codes'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

type ProfileLite = { id: string; full_name: string | null; active: boolean | null }

function displayNameFromProfile(p: ProfileLite | undefined, id: string) {
  const n = String(p?.full_name || '').trim()
  if (n) return n
  return id.slice(0, 8)
}

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

    let links: Array<{ job_id: string | null; worker_id: string | null }> = []
    if (jobIds.length) {
      for (const part of chunk(jobIds, 200)) {
        const lwRes = await admin.from('job_workers').select('job_id,worker_id').in('job_id', part)
        if (lwRes.error) {
          const msg = String(lwRes.error.message || '')
          if (/does not exist|relation|schema cache/i.test(msg)) {
            links = []
            break
          }
          throw new ApiError(500, lwRes.error.message, AdminApiErrorCode.DB_ERROR)
        }
        links.push(...((lwRes.data || []) as Array<{ job_id: string | null; worker_id: string | null }>))
      }
    }

    const linksByJob = new Map<string, Set<string>>()
    for (const row of links) {
      const jid = row.job_id ? String(row.job_id) : ''
      const wid = row.worker_id ? String(row.worker_id) : ''
      if (!jid || !wid) continue
      if (!linksByJob.has(jid)) linksByJob.set(jid, new Set())
      linksByJob.get(jid)!.add(wid)
    }

    const jobById = new Map<string, any>((jobs || []).map((x: any) => [String(x.id), x]))
    const coworkerOnlyIds = new Set<string>()
    for (const jid of jobIds) {
      const job = jobById.get(jid)
      const primary = job?.worker_id ? String(job.worker_id) : ''
      for (const wid of linksByJob.get(jid) || []) {
        if (wid && wid !== primary) coworkerOnlyIds.add(wid)
      }
    }

    const allWorkerIds = Array.from(new Set<string>([...primaryWorkerIds, ...coworkerOnlyIds]))

    const [sitesRes, logsRes] = await Promise.all([
      siteIds.length ? admin.from('sites').select('id,name').in('id', siteIds) : Promise.resolve({ data: [], error: null } as any),
      jobIds.length ? admin.from('time_logs').select('job_id,started_at,stopped_at').in('job_id', jobIds) : Promise.resolve({ data: [], error: null } as any),
    ])

    if (sitesRes.error) throw new ApiError(500, sitesRes.error.message, AdminApiErrorCode.DB_ERROR)
    if (logsRes.error) throw new ApiError(500, logsRes.error.message, AdminApiErrorCode.DB_ERROR)

    const mergedProfiles: ProfileLite[] = []
    if (allWorkerIds.length) {
      for (const part of chunk(allWorkerIds, 200)) {
        const r = await admin.from('profiles').select('id,full_name,active').in('id', part)
        if (r.error) throw new ApiError(500, r.error.message, AdminApiErrorCode.DB_ERROR)
        for (const p of (r.data || []) as any[]) {
          mergedProfiles.push({
            id: String(p.id),
            full_name: p.full_name ?? null,
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
    for (const s of (sitesRes.data || []) as any[]) siteName.set(s.id, s.name || '')

    const workerName = new Map<string, string>()
    for (const wid of primaryWorkerIds) {
      const p = profileById.get(String(wid))
      workerName.set(String(wid), displayNameFromProfile(p, String(wid)))
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
      const primary = j.worker_id ? String(j.worker_id) : ''

      const linked = linksByJob.get(jid) ? Array.from(linksByJob.get(jid)!) : []
      const coworkerIds = linked.filter((id) => id && id !== primary)

      const coworkers = coworkerIds
        .map((cid) => {
          const prof = profileById.get(cid)
          return {
            id: cid,
            name: displayNameFromProfile(prof, cid),
            active: typeof prof?.active === 'boolean' ? prof.active : null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      const participant_worker_ids: string[] = []
      if (primary) participant_worker_ids.push(primary)
      for (const cid of coworkerIds) {
        if (cid && !participant_worker_ids.includes(cid)) participant_worker_ids.push(cid)
      }

      return {
        id: jid,
        status: j.status,
        job_date: j.job_date,
        scheduled_time: j.scheduled_time,
        scheduled_end_time: (j as any).scheduled_end_time ?? null,
        site_id: j.site_id,
        site_name: j.site_id ? siteName.get(String(j.site_id)) || null : null,
        worker_id: j.worker_id,
        worker_name: j.worker_id
          ? workerName.get(String(j.worker_id)) || displayNameFromProfile(profileById.get(String(j.worker_id)), String(j.worker_id))
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
