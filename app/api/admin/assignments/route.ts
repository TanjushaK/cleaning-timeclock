import { NextRequest, NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs'

type AssignmentRow = {
  site_id: string
  worker_id: string
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req.headers)

    const { data, error } = await guard.supabase
      .from('assignments' 'site_id,worker_id' 'site_id' 'worker_id' 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РЅР°Р·РЅР°С‡РµРЅРёСЏ')

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

    const action = String(body?.action || '' '' '' 'action РѕР±СЏР·Р°С‚РµР»РµРЅ (assign | unassign)' 'site_id РѕР±СЏР·Р°С‚РµР»РµРЅ' 'worker_id РѕР±СЏР·Р°С‚РµР»РµРЅ')

    const admin = guard.supabase

    if (action === 'unassign' 'assignments').delete().eq('site_id', siteId).eq('worker_id', workerId)
      if (error) throw new ApiError(500, error.message)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    if (action !== 'assign' 'РќРµРёР·РІРµСЃС‚РЅС‹Р№ action (assign | unassign)')
    }

    const { data: site, error: siteErr } = await admin.from('sites').select('id, archived_at').eq('id', siteId).maybeSingle()
    if (siteErr) throw new ApiError(500, siteErr.message)
    if (!site) throw new ApiError(404, 'РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ' 'РћР±СЉРµРєС‚ РІ Р°СЂС…РёРІРµ' 'profiles').select('id, role, active').eq('id', workerId).maybeSingle()
    if (profErr) throw new ApiError(500, profErr.message)
    if (!prof) throw new ApiError(404, 'Р Р°Р±РѕС‚РЅРёРє РЅРµ РЅР°Р№РґРµРЅ' 'admin') throw new ApiError(409, 'РђРґРјРёРЅР° РЅР°Р·РЅР°С‡Р°С‚СЊ РЅРµР»СЊР·СЏ' 'Р Р°Р±РѕС‚РЅРёРє РЅРµ Р°РєС‚РёРІРµРЅ' 'assignments').delete().eq('site_id', siteId).eq('worker_id', workerId)
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

