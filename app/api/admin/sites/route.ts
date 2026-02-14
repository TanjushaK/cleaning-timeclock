import { NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toNum(v: any): number | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req)

    const body = await req.json().catch(() => ({} as any))
    const name = String(body?.name ?? '').trim()
    if (!name) throw new ApiError(400, 'name_required')

    const address = String(body?.address ?? '').trim() || null
    const lat = toNum(body?.lat)
    const lng = toNum(body?.lng)
    const radius = toNum(body?.radius)
    const default_minutes = toNum(body?.default_minutes)

    const photo_url = String(body?.photo_url ?? '').trim() || null

    const { data, error } = await supabase
      .from('sites')
      .insert({
        name,
        address,
        lat,
        lng,
        radius: radius ?? 150,
        default_minutes: default_minutes ?? 120,
        photo_url,
      })
      .select('id, name, address, lat, lng, radius, default_minutes, photo_url, archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'create_site_failed')
    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
