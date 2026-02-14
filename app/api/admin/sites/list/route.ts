import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse, ApiError } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1'

    let q = supabase
      .from('sites')
      .select('id,name,address,lat,lng,radius,default_minutes,photo_url,archived_at')
      .order('name', { ascending: true })

    if (!includeArchived) q = q.is('archived_at', null)

    const { data, error } = await q
    if (error) throw new ApiError(500, error.message)

    return NextResponse.json({ sites: data ?? [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
