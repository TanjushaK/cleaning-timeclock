import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, supabaseService, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    // только админ
    await requireAdmin(req)

    const sb = supabaseService()

    // 1) забираем всех worker из profiles
    const { data: workers, error: wErr } = await sb
      .from('profiles')
      .select('id, role')
      .eq('role', 'worker')

    if (wErr) throw new ApiError(500, wErr.message)
    const ids = (workers || []).map((x: any) => String(x.id)).filter(Boolean)

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, deleted_workers: 0, deleted_auth_users: 0 })
    }

    // 2) чистим хвосты
    const { error: aErr } = await sb.from('assignments').delete().in('worker_id', ids)
    if (aErr) throw new ApiError(500, aErr.message)

    // job_workers может отсутствовать — не считаем это фаталом
    const jwTry = await sb.from('job_workers').delete().in('worker_id', ids)
    if (jwTry.error) {
      const msg = String(jwTry.error.message || '')
      const missing = msg.includes('relation') || msg.includes('does not exist') || msg.includes('Could not find')
      if (!missing) throw new ApiError(500, jwTry.error.message)
    }

    const { error: jErr } = await sb.from('jobs').update({ worker_id: null }).in('worker_id', ids)
    if (jErr) throw new ApiError(500, jErr.message)

    // 3) удаляем profiles
    const { error: pErr } = await sb.from('profiles').delete().in('id', ids)
    if (pErr) throw new ApiError(500, pErr.message)

    // 4) удаляем auth.users (самое главное)
    let deletedAuth = 0
    for (const id of ids) {
      const res = await sb.auth.admin.deleteUser(id)
      if (!res.error) deletedAuth += 1
    }

    return NextResponse.json({
      ok: true,
      deleted_workers: ids.length,
      deleted_auth_users: deletedAuth,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
