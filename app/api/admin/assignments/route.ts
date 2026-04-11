import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type AssignmentRow = {
  site_id: string
  worker_id: string
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    const { data, error } = await guard.supabase
      .from('assignments')
      .select('site_id,worker_id')
      .order('site_id', { ascending: true })
      .order('worker_id', { ascending: true })

    if (error) throw new ApiError(500, error.message || 'Не удалось загрузить назначения')

    return NextResponse.json({ assignments: (data ?? []) as AssignmentRow[] }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    const action = String(body?.action || '').trim()
    const siteId = String(body?.site_id || '').trim()
    const workerId = String(body?.worker_id || '').trim()

    if (!action) throw new ApiError(400, 'action обязателен (assign | unassign)')
    if (!siteId) throw new ApiError(400, 'site_id обязателен')
    if (!workerId) throw new ApiError(400, 'worker_id обязателен')

    const admin = guard.supabase

    if (action === 'unassign') {
      const { error } = await admin.from('assignments').delete().eq('site_id', siteId).eq('worker_id', workerId)
      if (error) throw new ApiError(500, error.message)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action !== 'assign') {
      throw new ApiError(400, 'Неизвестный action (assign | unassign)')
    }

    const { data: site, error: siteErr } = await admin.from('sites').select('id, archived_at').eq('id', siteId).maybeSingle()
    if (siteErr) throw new ApiError(500, siteErr.message)
    if (!site) throw new ApiError(404, 'Объект не найден')
    if ((site as any).archived_at) throw new ApiError(409, 'Объект в архиве')

    const { data: prof, error: profErr } = await admin.from('profiles').select('id, role, active').eq('id', workerId).maybeSingle()
    if (profErr) throw new ApiError(500, profErr.message)
    if (!prof) throw new ApiError(404, 'Работник не найден')
    if ((prof as any).role === 'admin') throw new ApiError(409, 'Админа назначать нельзя')
    if ((prof as any).active === false) throw new ApiError(409, 'Работник не активен')

    const { error: delErr } = await admin.from('assignments').delete().eq('site_id', siteId).eq('worker_id', workerId)
    if (delErr) throw new ApiError(500, delErr.message)

    const { data: ins, error: insErr } = await admin
      .from('assignments')
      .insert({ site_id: siteId, worker_id: workerId })
      .select('site_id,worker_id')
      .single()

    if (insErr) throw new ApiError(500, insErr.message)

    return NextResponse.json({ ok: true, assignment: ins as AssignmentRow }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
