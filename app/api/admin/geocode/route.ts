import { NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse, ApiError } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type NominatimItem = {
  lat: string
  lon: string
  display_name?: string
}

function json(status: number, data: any) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function POST(req: Request) {
  try {
    // ✅ было открыто всем — теперь только админ
    await requireAdmin(req)

    const body = await req.json().catch(() => ({}))
    const address = String(body?.address || '').trim()
    if (!address) return json(400, { error: 'Missing address' })

    const url =
      'https://nominatim.openstreetmap.org/search?' +
      new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
      }).toString()

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'CleaningTimeclock/1.0 (admin geocoder)',
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return json(res.status, { error: `Geocode failed: ${res.status}`, details: text.slice(0, 300) })
    }

    const arr = (await res.json()) as NominatimItem[]
    const item = arr?.[0]
    if (!item?.lat || !item?.lon) return json(404, { error: 'No results' })

    const lat = Number(item.lat)
    const lng = Number(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(502, 'Bad geocode result')

    return json(200, { lat, lng, display_name: item.display_name || null })
  } catch (e) {
    return toErrorResponse(e)
  }
}
