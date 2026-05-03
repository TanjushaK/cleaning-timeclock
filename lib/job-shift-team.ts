/**
 * Shared logic: workers on the same shift grouping (same job row + sibling rows with
 * identical date/site/start/end) for coworker discovery and admin/worker APIs.
 */

export type JobRowLite = {
  id: string | number | null | undefined
  worker_id?: string | number | null
  job_date?: string | null
  site_id?: string | number | null
  scheduled_time?: string | null
  scheduled_end_time?: string | null
  status?: string | null
}

export type WorkerProfileLite = {
  id: string
  full_name?: string | null
  email?: string | null
  active?: boolean | null
}

export function normalizeWorkerId(id: unknown): string {
  if (id == null || id === '') return ''
  return String(id).trim()
}

export function shiftKey(job: Pick<JobRowLite, 'job_date' | 'site_id' | 'scheduled_time' | 'scheduled_end_time'>) {
  return [
    String(job.job_date || ''),
    normalizeWorkerId(job.site_id),
    String(job.scheduled_time || ''),
    String(job.scheduled_end_time ?? ''),
  ].join('|')
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  const s = String(status || '').trim().toLowerCase()
  return s === 'cancelled' || s === 'canceled'
}

/** Display: full_name → email → short id (schema has full_name + email; no separate name column). */
export function workerDisplayLabel(p: WorkerProfileLite | undefined, rawId: string): string {
  const id = normalizeWorkerId(rawId)
  const fn = String(p?.full_name ?? '').trim()
  if (fn) return fn
  const em = String(p?.email ?? '').trim()
  if (em) return em
  return id.slice(0, 8)
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** job_id → worker ids from job_workers only. */
export async function fetchJobWorkerLinksByJob(db: any, jobIds: string[]): Promise<Map<string, Set<string>>> {
  const linksByJob = new Map<string, Set<string>>()
  if (!jobIds.length) return linksByJob
  try {
    for (const part of chunk(jobIds, 200)) {
      const lwRes = await db.from('job_workers').select('job_id,worker_id').in('job_id', part)
      if (lwRes.error) {
        const msg = String(lwRes.error.message || '')
        if (/does not exist|relation|schema cache/i.test(msg)) {
          return new Map()
        }
        return new Map()
      }
      for (const row of (lwRes.data || []) as Array<{ job_id?: string | null; worker_id?: string | null }>) {
        const jid = row.job_id ? normalizeWorkerId(row.job_id) : ''
        const wid = row.worker_id ? normalizeWorkerId(row.worker_id) : ''
        if (!jid || !wid) continue
        if (!linksByJob.has(jid)) linksByJob.set(jid, new Set())
        linksByJob.get(jid)!.add(wid)
      }
    }
  } catch {
    return new Map()
  }
  return linksByJob
}

function normalizeJobRow(j: any): JobRowLite | null {
  if (!j?.id) return null
  return {
    id: j.id,
    worker_id: j.worker_id,
    job_date: j.job_date ?? null,
    site_id: j.site_id ?? null,
    scheduled_time: j.scheduled_time ?? null,
    scheduled_end_time: j.scheduled_end_time ?? null,
    status: j.status ?? null,
  }
}

/**
 * Full roster per job id: primary worker_id, job_workers links, and workers on sibling job rows
 * (same date + site + scheduled times).
 */
export async function expandTeamsByJob(
  db: any,
  baseJobsRaw: any[],
  linksByJob: Map<string, Set<string>>,
): Promise<Map<string, Set<string>>> {
  const baseJobs = (baseJobsRaw || []).map(normalizeJobRow).filter(Boolean) as JobRowLite[]
  const jobIds = baseJobs.map((j) => normalizeWorkerId(j.id)).filter(Boolean)

  const byJob: Record<string, Set<string>> = {}
  for (const id of jobIds) byJob[id] = new Set<string>()

  for (const j of baseJobs) {
    const jid = normalizeWorkerId(j.id)
    if (!jid) continue
    const pw = normalizeWorkerId(j.worker_id)
    if (pw) byJob[jid].add(pw)
    for (const w of linksByJob.get(jid) || []) {
      const nw = normalizeWorkerId(w)
      if (nw) byJob[jid].add(nw)
    }
  }

  const siteIds = Array.from(new Set(baseJobs.map((j) => normalizeWorkerId(j.site_id)).filter(Boolean)))
  const dates = baseJobs.map((j) => String(j.job_date || '')).filter(Boolean)
  const minDate = dates.length ? dates.slice().sort()[0] : null
  const maxDate = dates.length ? dates.slice().sort().reverse()[0] : null

  if (siteIds.length && minDate && maxDate) {
    let pool: JobRowLite[] = []
    {
      const { data, error } = await db
        .from('jobs')
        .select('id,worker_id,job_date,site_id,scheduled_time,scheduled_end_time,status')
        .in('site_id', siteIds)
        .gte('job_date', minDate)
        .lte('job_date', maxDate)

      if (error && String(error.message || '').toLowerCase().includes('scheduled_end_time')) {
        const { data: d2, error: e2 } = await db
          .from('jobs')
          .select('id,worker_id,job_date,site_id,scheduled_time,status')
          .in('site_id', siteIds)
          .gte('job_date', minDate)
          .lte('job_date', maxDate)
        if (e2) throw e2
        pool = ((d2 as any[]) || []).map(normalizeJobRow).filter(Boolean) as JobRowLite[]
      } else {
        if (error) throw error
        pool = ((data as any[]) || []).map(normalizeJobRow).filter(Boolean) as JobRowLite[]
      }
    }

    const activePool = pool.filter((j) => !isCancelledStatus(j.status))
    const byShift = new Map<string, JobRowLite[]>()
    for (const j of activePool) {
      if (!j?.id || !j.job_date || !j.site_id || !j.scheduled_time) continue
      const key = shiftKey(j)
      const arr = byShift.get(key) || []
      arr.push(j)
      byShift.set(key, arr)
    }

    const siblingToCurrent = new Map<string, Set<string>>()
    for (const current of baseJobs) {
      if (!current?.id || !current.job_date || !current.site_id || !current.scheduled_time) continue
      const curId = normalizeWorkerId(current.id)
      const sibs = byShift.get(shiftKey(current)) || []
      for (const sib of sibs) {
        if (!sib?.id) continue
        const sid = normalizeWorkerId(sib.id)
        const pw = normalizeWorkerId(sib.worker_id)
        if (pw) byJob[curId]?.add(pw)
        const curSet = siblingToCurrent.get(sid) || new Set<string>()
        curSet.add(curId)
        siblingToCurrent.set(sid, curSet)
      }
    }

    const siblingIds = Array.from(siblingToCurrent.keys())
    if (siblingIds.length) {
      for (const part of chunk(siblingIds, 200)) {
        const { data: sjw, error: sjwErr } = await db.from('job_workers').select('job_id,worker_id').in('job_id', part)
        if (sjwErr) throw sjwErr
        for (const r of (sjw as Array<{ job_id?: string | null; worker_id?: string | null }> | null) || []) {
          if (!r?.job_id || !r?.worker_id) continue
          const nw = normalizeWorkerId(r.worker_id)
          const jidKey = normalizeWorkerId(r.job_id)
          const currentIds = siblingToCurrent.get(jidKey)
          if (!currentIds || !nw) continue
          for (const cid of currentIds) byJob[cid]?.add(nw)
        }
      }
    }
  }

  const out = new Map<string, Set<string>>()
  for (const jid of jobIds) {
    out.set(jid, byJob[jid] || new Set())
  }
  return out
}
