import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isMissingMsg(msg: string) {
  const m = String(msg || '')
  return (
    m.includes('Could not find the table') ||
    m.includes('does not exist') ||
    m.includes('relation') ||
    m.includes('schema cache') ||
    (m.includes('column') && m.includes('does not exist'))
  )
}

async function tryDeleteIn(sb: any, table: string, col: string, ids: string[], out: any) {
  const r = await sb.from(table).delete().in(col, ids)
  if (r.error) {
    if (isMissingMsg(r.error.message)) out.warnings.push(`${table}: ${r.error.message}`)
    else throw new ApiError(500, `${table}: ${r.error.message}`)
  }
}

async function tryUpdateIn(sb: any, table: string, patch: any, col: string, ids: string[], out: any) {
  const r = await sb.from(table).update(patch).in(col, ids)
  if (r.error) {
    if (isMissingMsg(r.error.message)) out.warnings.push(`${table}: ${r.error.message}`)
    else throw new ApiError(500, `${table}: ${r.error.message}`)
  }
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
    const { data: workers, error: wErr } = await sb.from('profiles').select('id').eq('role', 'worker')
    if (wErr) throw new ApiError(500, `profiles: ${wErr.message}`)

    const ids = (workers || []).map((x: any) => String(x.id)).filter(Boolean)
    out.deleted_workers = ids.length

    if (ids.length === 0) {
      out.ok = true
      out.step = 'done'
      return NextResponse.json(out, { status: 200 })
    }

    // ✅ главное: чистим time_logs по worker_id (у тебя это есть)
    out.step = 'delete_time_logs'
    await tryDeleteIn(sb, 'time_logs', 'worker_id', ids, out)

    out.step = 'delete_assignments'
    await tryDeleteIn(sb, 'assignments', 'worker_id', ids, out)

    out.step = 'delete_job_workers'
    await tryDeleteIn(sb, 'job_workers', 'worker_id', ids, out)

    // на всякий — если где-то в jobs есть worker_id
    out.step = 'unlink_jobs'
    await tryUpdateIn(sb, 'jobs', { worker_id: null }, 'worker_id', ids, out)

    out.step = 'delete_profiles'
    const pRes = await sb.from('profiles').delete().in('id', ids)
    if (pRes.error) throw new ApiError(500, `profiles delete: ${pRes.error.message}`)

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
