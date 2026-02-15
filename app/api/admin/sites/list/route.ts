import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, ApiError, toErrorResponse } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req)

    const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1'

    let q = supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .order('name', { ascending: true })

    if (!includeArchived) {
      q = q.is('archived_at', null)
    }

    const { data, error } = await q
    if (error) throw new ApiError(500, error.message || 'Не удалось загрузить объекты')

    return NextResponse.json({ sites: data ?? [] }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
