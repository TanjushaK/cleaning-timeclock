import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const BUCKET = 'site-photos'

type SitePhoto = { path: string; url: string; created_at?: string }

function safeStr(v: any) {
  return String(v ?? '').trim()
}

function sanitizeFilename(name: string) {
  return name
    .replace(/[^\p{L}\p{N}\.\-_]+/gu, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'photo'
}

function rand() {
  return Math.random().toString(36).slice(2, 10)
}

async function loadSitePhotos(supabase: any, siteId: string): Promise<SitePhoto[]> {
  const { data, error } = await supabase.from('sites').select('photos').eq('id', siteId).single()
  if (error) throw new ApiError(404, 'Объект не найден')
  const raw = (data as any)?.photos
  return Array.isArray(raw) ? (raw as SitePhoto[]) : []
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const fd = await req.formData()
    const file = fd.get('file')

    if (!file || !(file instanceof File)) throw new ApiError(400, 'Нужен файл (file)')
    if (!file.type?.startsWith('image/')) throw new ApiError(400, 'Нужна картинка (image/*)')

    const photos = await loadSitePhotos(supabase, siteId)
    if (photos.length >= 5) throw new ApiError(400, 'Максимум 5 фото')

    const ext = (safeStr(file.name).split('.').pop() || 'jpg').toLowerCase()
    const filename = sanitizeFilename(safeStr(file.name))
    const path = `site-${siteId}/${Date.now()}-${rand()}-${filename}`
    const ab = await file.arrayBuffer()
    const bytes = new Uint8Array(ab)

    const up = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) throw new ApiError(500, up.error.message || 'Не удалось загрузить фото')

    const pub = supabase.storage.from(BUCKET).getPublicUrl(path)
    const url = pub?.data?.publicUrl
    if (!url) throw new ApiError(500, 'Не удалось получить public url')

    const nextPhotos: SitePhoto[] = [
      ...photos,
      { path, url, created_at: new Date().toISOString() },
    ]

    const { data, error } = await supabase
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', siteId)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось сохранить фото')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireAdmin(req)
    const { id: siteId } = await ctx.params

    const body = await req.json().catch(() => ({}))
    const path = safeStr(body?.path)
    if (!path) throw new ApiError(400, 'Нужен path')

    const photos = await loadSitePhotos(supabase, siteId)
    const nextPhotos = photos.filter((p) => p?.path !== path)

    // удаление из storage (если не получилось — всё равно не оставляем ссылку в объекте)
    await supabase.storage.from(BUCKET).remove([path]).catch(() => null)

    const { data, error } = await supabase
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', siteId)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (error) throw new ApiError(500, error.message || 'Не удалось обновить фото')

    return NextResponse.json({ site: data }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
