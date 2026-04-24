import { NextResponse } from 'next/server'
import { requireAdmin, toErrorResponse } from '@/lib/route-db'
import { geocodeAddress } from '@/lib/server/admin-geocode'

export const runtime = 'nodejs'

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

    const item = await geocodeAddress(address)
    if (!item) {
      return json(404, { error: 'No results' })
    }

    return json(200, {
      lat: item.lat,
      lng: item.lng,
      display_name: item.display_name || null,
    })
  } catch (e: any) {
    return toErrorResponse(e)
  }
}
