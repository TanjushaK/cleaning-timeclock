import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse, ApiError } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type NominatimItem = {
  lat: string
  lon: string
  display_name?: string
}

export async function GET(req: NextRequest) {
  try {
    // Закрываем публичный прокси: только admin
    await requireAdmin(req)

    const q = req.nextUrl.searchParams.get('q')?.trim() || ''
    if (!q) return NextResponse.json({ error: 'q_required' }, { status: 400 })

    const ua =
      process.env.NOMINATIM_USER_AGENT ||
      'Tanija Cleaning Timeclock (geocode); contact=admin@tanjusha.nl'

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`

    const r = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept-Language': 'en,ru;q=0.8',
      },
      cache: 'no-store',
    })

    if (!r.ok) {
      return NextResponse.json({ error: `geocode_http_${r.status}` }, { status: 502 })
    }

    const data = (await r.json()) as NominatimItem[]
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const item = data[0]
    const lat = Number(item?.lat)
    const lng = Number(item?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(502, 'bad_geocode_result')
    }

    return NextResponse.json({
      ok: true,
      lat,
      lng,
      display_name: item.display_name || null,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}


