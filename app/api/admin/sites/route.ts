import { NextResponse } from 'next/server' '@/lib/supabase-server' 'nodejs'

function toFiniteOrNull(v: any): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toCategoryOrNull(v: any): number | null {
  if (v == null || v === '' || v === 0 || v === '0') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i < 1 || i > 15) throw new ApiError(400, 'РљР°С‚РµРіРѕСЂРёСЏ РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РѕС‚ 1 РґРѕ 15')
  return i
}

type NominatimItem = { lat: string; lon: string; display_name?: string }

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address.trim()
  if (!q) return null

  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q,
      format: 'json' '1',
    }).toString()

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 8000)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'CleaningTimeclock/1.0 (admin sites geocoder)' 'Accept': 'application/json',
      },
      signal: ac.signal,
      cache: 'no-store',
    })

    if (!res.ok) return null
    const arr = (await res.json()) as NominatimItem[]
    const item = arr?.[0]
    if (!item?.lat || !item?.lon) return null

    const lat = Number(item.lat)
    const lng = Number(item.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return { lat, lng }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function POST(req: Request) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const body = await req.json()

    const name = (body?.name ?? '').toString().trim()
    const address = body?.address == null ? null : String(body.address).trim() || null

    let lat = toFiniteOrNull(body?.lat)
    let lng = toFiniteOrNull(body?.lng)

    const radius = toFiniteOrNull(body?.radius ?? body?.radius_m)
    const category = toCategoryOrNull(body?.category)
    const notes = body?.notes == null ? null : String(body.notes)

    if (!name) throw new ApiError(400, 'РќСѓР¶РЅРѕ РЅР°Р·РІР°РЅРёРµ РѕР±СЉРµРєС‚Р°')
    const safeRadius = radius != null ? radius : 150

    // в­ђ Р“Р»Р°РІРЅРѕРµ: РµСЃР»Рё Р°РґСЂРµСЃ РµСЃС‚СЊ, Р° РєРѕРѕСЂРґРёРЅР°С‚ РЅРµС‚ вЂ” РіРµРѕРєРѕРґРёРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё
    if (address && (lat == null || lng == null)) {
      const geo = await geocodeAddress(address)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
      }
    }

    const { data, error } = await supabase
      .from('sites')
      .insert({
        name,
        address,
        lat,
        lng,
        radius: safeRadius,
        category,
        notes,
        photos: [],
      })
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РѕР±СЉРµРєС‚')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
