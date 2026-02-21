import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isMissingTableMsg(msg: string) {
  const m = String(msg || '')
  return (
    m.includes('Could not find the table') ||
    m.includes('does not exist') ||
    m.includes('relation') ||
    m.includes('schema cache')
  )
}

export async function POST(req: Request) {
  try {
    const guard = await requireAdmin(req)
    const sb = guard.supabase

    const out: {
      ok: boolean
      step: string
      deleted_workers: number
      deleted_auth_users: number
      warnings: string[]
      errors: Array<{ id?: string; where: string; message: string }>
    } = {
      ok: false,
      step: 'init',
      deleted_workers: 0,
      deleted_auth_users: 0,
      warnings: [],
      errors: [],
    }

    out.step = 'load_workers'
    const { data: workers, error: wErr } = await sb
      .from('profiles')
      .select('id, role')
      .eq('role', 'worker')

    if (wErr) throw new ApiError(500, `load_workers: ${wErr.message}`)

    const ids = (workers || []).map((x: any) => String(x.id)).filter(Boolean)
    out.deleted_workers = ids.length

    if (ids.length === 0) {
      out.ok = true
      out.step = 'done'
      return NextResponse.json(out, { status: 200 })
    }

    out.step = 'delete_assignments'
    const aRes = await sb.from('assignments').delete().in('worker_id', ids)
    if (aRes.error) throw new ApiError(500, `delete_assignments: ${aRes.error.message}`)

    out.step = 'delete_job_workers'
    const jwRes = await sb.from('job_workers').delete().in('worker_id', ids)
    if (jwRes.error) {
      if (isMissingTableMsg(jwRes.error.message)) {
        out.warnings.push(`job_workers missing: ${jwRes.error.message}`)
      } else {
        throw new ApiError(500, `delete_job_workers: ${jwRes.error.message}`)
      }
    }

    out.step = 'unlink_jobs'
    const jRes = await sb.from('jobs').update({ worker_id: null }).in('worker_id', ids)
    if (jRes.error) throw new ApiError(500, `unlink_jobs: ${jRes.error.message}`)

    out.step = 'delete_profiles'
    const pRes = await sb.from('profiles').delete().in('id', ids)
    if (pRes.error) throw new ApiError(500, `delete_profiles: ${pRes.error.message}`)

    out.step = 'delete_auth_users'
    let deletedAuth = 0
    for (const id of ids) {
      const r = await sb.auth.admin.deleteUser(id)
      if (!r.error) deletedAuth += 1
      else out.errors.push({ id, where: 'auth.admin.deleteUser', message: r.error.message })
    }
    out.deleted_auth_users = deletedAuth

    out.ok = true
    out.step = 'done'
    return NextResponse.json(out, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
