import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    await requireAdmin(req)

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('sites')
      .select('id, name, address, lat, lng, radius_m')
      .order('name', { ascending: true })

    if (error) throw new ApiError(500, error.message)

    return NextResponse.json({ sites: data ?? [] }, { status: 200 })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const message = typeof e?.message === 'string' ? e.message : 'Internal error'
    return NextResponse.json({ error: message }, { status })
  }
}
