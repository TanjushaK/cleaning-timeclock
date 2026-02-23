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

async function getSiteIdFromCtx(ctx: any): Promise<string> {
  // Next 16 РЅР° build РёРЅРѕРіРґР° С‚РёРїРёР·РёСЂСѓРµС‚ params РєР°Рє Promise вЂ” unwrap Р±РµР·РѕРїР°СЃРЅРѕ
  const p = await Promise.resolve(ctx?.params)
  const id = String(p?.id || '' 'Missing site id')
  return id
}

export async function GET(req: Request, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const siteId = await getSiteIdFromCtx(ctx)

    const { data, error } = await supabase
      .from('sites' 'id,name,address,lat,lng,radius,category,notes,photos,archived_at' 'id', siteId)
      .single()

    if (error) throw new ApiError(404, 'РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PUT(req: Request, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const siteId = await getSiteIdFromCtx(ctx)
    const body = await req.json().catch(() => ({}))

    const name = body?.name == null ? undefined : String(body.name).trim()
    const address = body?.address == null ? undefined : String(body.address).trim() || null

    const lat = body?.lat === undefined ? undefined : toFiniteOrNull(body.lat)
    const lng = body?.lng === undefined ? undefined : toFiniteOrNull(body.lng)

    const radiusRaw = body?.radius ?? body?.radius_m
    const radius = radiusRaw === undefined ? undefined : toFiniteOrNull(radiusRaw)

    const category = body?.category === undefined ? undefined : toCategoryOrNull(body.category)
    const notes = body?.notes === undefined ? undefined : (body.notes == null ? null : String(body.notes))

    const patch: any = {}
    if (name !== undefined) patch.name = name
    if (address !== undefined) patch.address = address
    if (lat !== undefined) patch.lat = lat
    if (lng !== undefined) patch.lng = lng
    if (radius !== undefined) patch.radius = radius
    if (category !== undefined) patch.category = category
    if (notes !== undefined) patch.notes = notes

    // РќРёС‡РµРіРѕ РЅРµ РјРµРЅСЏРµРј вЂ” РЅРµС‡РµРіРѕ Р°РїРґРµР№С‚РёС‚СЊ
    if (Object.keys(patch).length === 0) {
      const { data, error } = await supabase
        .from('sites' 'id,name,address,lat,lng,radius,category,notes,photos,archived_at' 'id', siteId)
        .single()

      if (error) throw new ApiError(404, 'РћР±СЉРµРєС‚ РЅРµ РЅР°Р№РґРµРЅ')
      return NextResponse.json({ site: data }, { status: 200 })
    }

    // Р‘Р°Р·РѕРІР°СЏ РІР°Р»РёРґР°С†РёСЏ
    if (patch.name !== undefined && !patch.name) throw new ApiError(400, 'РќСѓР¶РЅРѕ РЅР°Р·РІР°РЅРёРµ РѕР±СЉРµРєС‚Р°')

    const { data, error } = await supabase
      .from('sites')
      .update(patch)
      .eq('id' 'id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ РѕР±СЉРµРєС‚')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: Request, ctx: any) {
  try {
    const { supabase } = await requireAdmin(req.headers)
    const siteId = await getSiteIdFromCtx(ctx)

    // 1) РџС‹С‚Р°РµРјСЃСЏ СѓРґР°Р»РёС‚СЊ СЃР°Рј РѕР±СЉРµРєС‚.
    // Р•СЃР»Рё РµСЃС‚СЊ FK-РѕРіСЂР°РЅРёС‡РµРЅРёСЏ вЂ” Supabase РІРµСЂРЅС‘С‚ РѕС€РёР±РєСѓ, Рё РјС‹ РїРѕРєР°Р¶РµРј РїРѕРЅСЏС‚РЅС‹Р№ С‚РµРєСЃС‚.
    const { error } = await supabase.from('sites').delete().eq('id', siteId)

    if (error) {
      // Р§Р°СЃС‚Р°СЏ РїСЂРёС‡РёРЅР° вЂ” СЃРІСЏР·Р°РЅРЅС‹Рµ РЅР°Р·РЅР°С‡РµРЅРёСЏ/СЃРјРµРЅС‹. РЎРѕРѕР±С‰Р°РµРј РєР°Рє РµСЃС‚СЊ.
      throw new ApiError(
        409,
        `РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚. РЎРєРѕСЂРµРµ РІСЃРµРіРѕ РµСЃС‚СЊ СЃРІСЏР·Р°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ (СЃРјРµРЅС‹/РЅР°Р·РЅР°С‡РµРЅРёСЏ). Р”РµС‚Р°Р»Рё: ${error.message}`
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
