import { NextResponse } from 'next/server'
import { ApiError, requireAdmin } from '@/lib/supabase-server'

type Site = {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  radius_m: number
  notes: string | null
}

export async function GET(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const { data, error } = await supabase
      .from('sites')
      .select('id, name, address, lat, lng, radius_m, notes')
      .order('name', { ascending: true })

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ sites: (data ?? []) as Site[] })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => ({}))

    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) throw new ApiError(400, 'site_name_required')

    const address = typeof body?.address === 'string' ? body.address.trim() : ''
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''

    const lat = body?.lat === '' || body?.lat == null ? null : Number(body.lat)
    const lng = body?.lng === '' || body?.lng == null ? null : Number(body.lng)

    if (lat != null && !Number.isFinite(lat)) throw new ApiError(400, 'lat_bad')
    if (lng != null && !Number.isFinite(lng)) throw new ApiError(400, 'lng_bad')

    const radius = body?.radius_m == null || body?.radius_m === '' ? 100 : Number(body.radius_m)
    if (!Number.isFinite(radius) || radius <= 0) throw new ApiError(400, 'radius_bad')

    const { data, error } = await supabase
      .from('sites')
      .insert({
        name,
        address: address || null,
        lat,
        lng,
        radius_m: radius,
        notes: notes || null,
      })
      .select('id')
      .single()

    if (error) throw new ApiError(400, error.message)

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500
    const msg = e?.message || 'error'
    return NextResponse.json({ error: msg }, { status })
  }
}
