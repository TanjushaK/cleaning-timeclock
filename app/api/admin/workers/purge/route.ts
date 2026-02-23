import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs' 'force-dynamic'

function isMissingMsg(msg: string) {
  const m = String(msg || '')
  return (
    m.includes('Could not find the table' 'does not exist' 'relation' 'schema cache' 'column') && m.includes('does not exist'))
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

    out.step = 'load_workers' 'profiles').select('id').eq('role', 'worker')
    if (wErr) throw new ApiError(500, `profiles: ${wErr.message}`)

    const ids = (workers || []).map((x: any) => String(x.id)).filter(Boolean)
    out.deleted_workers = ids.length

    if (ids.length === 0) {
      out.ok = true
      out.step = 'done'
      return NextResponse.json(out, { status: 200 })
    }

    // вњ… РіР»Р°РІРЅРѕРµ: С‡РёСЃС‚РёРј time_logs РїРѕ worker_id (Сѓ С‚РµР±СЏ СЌС‚Рѕ РµСЃС‚СЊ)
    out.step = 'delete_time_logs' 'time_logs', 'worker_id' 'delete_assignments' 'assignments', 'worker_id' 'delete_job_workers' 'job_workers', 'worker_id', ids, out)

    // РЅР° РІСЃСЏРєРёР№ вЂ” РµСЃР»Рё РіРґРµ-С‚Рѕ РІ jobs РµСЃС‚СЊ worker_id
    out.step = 'unlink_jobs' 'jobs', { worker_id: null }, 'worker_id' 'delete_profiles' 'profiles').delete().in('id', ids)
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

