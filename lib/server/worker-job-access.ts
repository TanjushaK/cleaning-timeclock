import type { CompatClient } from '@/lib/server/compat/client'

let ASSIGN_TABLE: string | null | undefined

export async function resolveAssignmentsTable(db: CompatClient): Promise<string | null> {
  if (ASSIGN_TABLE !== undefined) return ASSIGN_TABLE
  const candidates = ['assignments', 'site_assignments', 'site_workers', 'worker_sites']
  for (const t of candidates) {
    const { error } = await db.from(t).select('site_id,worker_id').limit(1)
    if (!error) {
      ASSIGN_TABLE = t
      return t
    }
    const msg = String(error?.message || '')
    const missing = msg.includes('Could not find the table') || msg.includes('does not exist') || msg.includes('relation')
    const low = msg.toLowerCase()
    const forbidden = low.includes('permission denied') || low.includes('row level security') || low.includes('rls')
    if (forbidden) continue
    if (!missing) {
      ASSIGN_TABLE = t
      return t
    }
  }
  ASSIGN_TABLE = null
  return null
}

/**
 * Matches worker job list semantics: primary worker, job_workers row, or open planned job on an assigned site.
 */
export async function workerCanAccessJob(db: CompatClient, workerId: string, jobId: string): Promise<boolean> {
  const { data: job, error } = await db
    .from('jobs')
    .select('id,worker_id,site_id,status')
    .eq('id', jobId)
    .maybeSingle()

  if (error || !job) return false

  if (job.worker_id && String(job.worker_id) === String(workerId)) return true

  const { data: jw, error: jwErr } = await db
    .from('job_workers')
    .select('id')
    .eq('job_id', jobId)
    .eq('worker_id', workerId)
    .limit(1)

  if (!jwErr && Array.isArray(jw) && jw.length > 0) return true

  const status = String(job.status || '')
  const siteId = job.site_id ? String(job.site_id) : ''
  if (!job.worker_id && status === 'planned' && siteId) {
    const t = await resolveAssignmentsTable(db)
    if (t) {
      const { data: row } = await db.from(t).select('site_id').eq('worker_id', workerId).eq('site_id', siteId).limit(1)
      if (Array.isArray(row) && row.length > 0) return true
    }
  }

  return false
}
