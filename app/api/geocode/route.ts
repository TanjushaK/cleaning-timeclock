import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getUserAgent() {
  return (
    process.env.NOMINATIM_USER_AGENT ||
    'Tanija Cleaning Timeclock (geocode); contact=admin@tanjusha.nl'
  )
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim() || ''
    if (!q) return NextResponse.json({ error: 'q_required' }, { status: 400 })

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`

    const r = await fetch(url, {
      headers: {
        'User-Agent': getUserAgent(),
        Accept: 'application/json',
        'Accept-Language': 'en,ru;q=0.8',
      },
      cache: 'no-store',
    })

    if (!r.ok) {
      return NextResponse.json({ error: `geocode_http_${r.status}` }, { status: 502 })
    }

    const data = (await r.json()) as any
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    const item = data[0]
    const lat = Number(item?.lat)
    const lng = Number(item?.lon)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'bad_geocode_result' }, { status: 502 })
    }

    return NextResponse.json(
      {
        ok: true,
        lat,
        lng,
        display_name: item?.display_name || null,
      },
      { status: 200 }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 })
  }
}
