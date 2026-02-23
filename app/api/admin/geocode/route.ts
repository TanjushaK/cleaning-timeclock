import { NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse } from '@/lib/supabase-server'

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
    await requireAdmin(req)

    const body = await req.json().catch(() => ({}))
    const address = String(body?.address || '').trim()

    if (!address) {
      return json(400, { error: 'Missing address' })
    }

    const url =
      'https://nominatim.openstreetmap.org/search?' +
      new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
      }).toString()

    // ВАЖНО: Nominatim часто режет запросы без нормальных заголовков
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // можно заменить на твой домен/продукт
        'User-Agent': 'CleaningTimeclock/1.0 (admin geocoder)',
        'Accept': 'application/json',
      },
      // небольшой таймаут через AbortController — по желанию
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return json(res.status, { error: `Geocode failed: ${res.status}`, details: text.slice(0, 300) })
    }

    const arr = (await res.json()) as NominatimItem[]
    const item = arr?.[0]

    if (!item?.lat || !item?.lon) {
      return json(404, { error: 'No results' })
    }

    return json(200, {
      lat: Number(item.lat),
      lng: Number(item.lon),
      display_name: item.display_name || null,
    })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
