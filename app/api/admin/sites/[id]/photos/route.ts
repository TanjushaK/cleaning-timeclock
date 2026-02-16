import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type SitePhoto = { path: string; created_at?: string }

function s(v: any) {
  return String(v ?? '').trim()
}

function sanitizeFilename(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\.\-_]+/gu, '_')
      .replace(/_+/g, '_')
      .slice(0, 120) || 'photo'
  )
}

function rand() {
  return Math.random().toString(36).slice(2, 10)
}

function getBucket(): string {
  return process.env.SITE_PHOTOS_BUCKET || 'site-photos'
}

function getTtlSeconds(): number {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL || '86400'
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 86400
}

async function loadPhotos(supabase: any, siteId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabase.from('sites').select('photos').eq('id', siteId).single()
  if (error) throw new ApiError(404, 'Объект не найден')
  const raw = (data as any)?.photos
  if (!Array.isArray(raw)) return []
  return raw
    .map((p: any) => {
      if (typeof p === 'string') return { path: p }
      const path = s(p?.path)
      if (!path) return null
      return { path, created_at: p?.created_at }
    })
    .filter(Boolean) as SitePhoto[]
}

async function savePhotos(supabase: any, siteId: string, photos: SitePhoto[]) {
  const { data, error } = await supabase
    .from('sites')
    .update({ photos })
    .eq('id', siteId)
    .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
    .single()

  if (error) throw new ApiError(500, error.message || 'Не удалось сохранить фото')
  return data
}

async function signPhotos(supabase: any, photos: SitePhoto[]) {
  const bucket = getBucket()
  const ttl = getTtlSeconds()
  const out: any[] = []
  for (const p of photos) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(p.path, ttl)
    out.push({ path: p.path, url: data?.signedUrl || null, created_at: p.created_at || null })
  }
  return out
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const fd = await req.formData()
    const file = fd.get('file')

    if (!file || !(file instanceof File)) throw new ApiError(400, 'Нужен файл (file)')
    if (!file.type?.startsWith('image/')) throw new ApiError(400, 'Нужна картинка (image/*)')

    const bucket = getBucket()
    const photos = await loadPhotos(supabase, siteId)
    if (photos.length >= 5) throw new ApiError(400, 'Максимум 5 фото')

    const filename = sanitizeFilename(s(file.name))
    const path = `site-${siteId}/${Date.now()}-${rand()}-${filename}`

    const ab = await file.arrayBuffer()
    const bytes = new Uint8Array(ab)

    const up = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) throw new ApiError(500, up.error.message || 'Не удалось загрузить фото')

    const nextPhotos: SitePhoto[] = [...photos, { path, created_at: new Date().toISOString() }]
    const site = await savePhotos(supabase, siteId, nextPhotos)

    const signed = await signPhotos(supabase, nextPhotos)
    return NextResponse.json({ site: { ...(site as any), photos: signed } }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const body = await req.json().catch(() => ({} as any))
    const action = s(body?.action)

    if (action !== 'make_primary') throw new ApiError(400, 'Неверное action (нужно make_primary)')

    const path = s(body?.path)
    if (!path) throw new ApiError(400, 'Нужен path')

    const photos = await loadPhotos(supabase, siteId)
    const idx = photos.findIndex((p) => p.path === path)
    if (idx < 0) throw new ApiError(404, 'Фото не найдено')

    const picked = photos[idx]
    const rest = photos.filter((p) => p.path !== path)
    const nextPhotos = [picked, ...rest]

    const site = await savePhotos(supabase, siteId, nextPhotos)
    const signed = await signPhotos(supabase, nextPhotos)
    return NextResponse.json({ site: { ...(site as any), photos: signed } }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const body = await req.json().catch(() => ({} as any))
    const path = s(body?.path)
    if (!path) throw new ApiError(400, 'Нужен path')

    const bucket = getBucket()
    const photos = await loadPhotos(supabase, siteId)
    const nextPhotos = photos.filter((p) => p.path !== path)

    const rm = await supabase.storage.from(bucket).remove([path])
    if (rm.error) {
      // даже если файл не удалился, всё равно обновим список в БД
    }

    const site = await savePhotos(supabase, siteId, nextPhotos)
    const signed = await signPhotos(supabase, nextPhotos)
    return NextResponse.json({ site: { ...(site as any), photos: signed } }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
