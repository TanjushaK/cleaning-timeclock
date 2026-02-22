import { NextRequest, NextResponse } from 'next/server'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 5242880;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp']);


type SitePhoto = { path: string; url?: string; created_at?: string | null }

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

const RAW_BUCKET = process.env.SITE_PHOTOS_BUCKET || 'site-photos'
const { bucket: BUCKET, prefix: PREFIX } = parseBucketRef(RAW_BUCKET, 'site-photos')

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function getSignedTtlSeconds() {
  const raw = process.env.SITE_PHOTOS_SIGNED_URL_TTL
  const n = raw ? Number.parseInt(raw, 10) : 86400
  return Number.isFinite(n) && n > 0 ? n : 86400
}

function sanitizeFilename(name: string) {
  return name
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-.а-яА-ЯёЁ]/g, '')
    .slice(0, 120)
}

function normalizePhotos(v: any): SitePhoto[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((p) => p && typeof p === 'object' && typeof (p as any).path === 'string')
    .map((p) => ({
      path: String((p as any).path),
      url: (p as any).url ? String((p as any).url) : undefined,
      created_at: (p as any).created_at ? String((p as any).created_at) : undefined,
    }))
}

async function withSignedUrls(supabase: any, site: any) {
  const photos = normalizePhotos(site?.photos)
  if (photos.length === 0) return { ...site, photos }

  const paths = Array.from(new Set(photos.map((p) => p.path).filter(Boolean)))
  const ttl = getSignedTtlSeconds()
  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, ttl)

  if (error || !Array.isArray(signed)) {
    return { ...site, photos }
  }

  const urlByPath = new Map<string, string>()
  for (const item of signed as any[]) {
    const p = item?.path ? String(item.path) : ''
    const u = item?.signedUrl ? String(item.signedUrl) : ''
    if (p && u) urlByPath.set(p, u)
  }

  return {
    ...site,
    photos: photos.map((p) => ({ ...p, url: urlByPath.get(p.path) || p.url })),
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) throw new ApiError(400, 'file_required')
    // validate upload
    if (!ALLOWED_IMAGE_TYPES.has((file as any).type || '')) throw new ApiError(400, 'Разрешены только JPG/PNG/WEBP');
    if ((file as any).size > MAX_UPLOAD_BYTES) throw new ApiError(400, `Файл слишком большой (макс. ${Math.floor(MAX_UPLOAD_BYTES/1024/1024)}MB)`);

    const { data: siteData, error: siteErr } = await supabase.from('sites').select('id,photos').eq('id', id).single()
    if (siteErr) throw new ApiError(400, siteErr.message || 'site_not_found')

    const currentPhotos = normalizePhotos(siteData?.photos)
    if (currentPhotos.length >= 5) throw new ApiError(400, 'photo_limit')

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const safeBase = sanitizeFilename(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    const filename = `${Date.now()}_${safeBase}.${ext}`

    // ✅ если SITE_PHOTOS_BUCKET задан как "site-photos/sites", prefix="sites"
    const path = PREFIX ? joinPath(PREFIX, id, filename) : joinPath(id, filename)

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })

    if (upErr) throw new ApiError(500, upErr.message || 'upload_failed')

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    const nextPhotos = [...currentPhotos, { path, url: publicUrl, created_at: new Date().toISOString() }]

    const { data: updated, error: updErr } = await supabase
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (updErr) throw new ApiError(500, updErr.message || 'db_update_failed')

    const site = await withSignedUrls(supabase, updated)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => null)
    const path = String(body?.path || '')
    if (!path) throw new ApiError(400, 'path_required')

    const { data: siteData, error: siteErr } = await supabase.from('sites').select('id,photos').eq('id', id).single()
    if (siteErr) throw new ApiError(400, siteErr.message || 'site_not_found')

    const photos = normalizePhotos(siteData?.photos)
    const nextPhotos = photos.filter((p) => p.path !== path)

    const { error: delErr } = await supabase.storage.from(BUCKET).remove([path])
    if (delErr) throw new ApiError(500, delErr.message || 'remove_failed')

    const { data: updated, error: updErr } = await supabase
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (updErr) throw new ApiError(500, updErr.message || 'db_update_failed')

    const site = await withSignedUrls(supabase, updated)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) throw new ApiError(400, 'id_required')

    const { supabase } = await requireAdmin(req.headers)

    const body = await req.json().catch(() => null)
    const action = String(body?.action || '')
    const path = String(body?.path || '')
    if (action !== 'make_primary') throw new ApiError(400, 'invalid_action')
    if (!path) throw new ApiError(400, 'path_required')

    const { data: siteData, error: siteErr } = await supabase.from('sites').select('id,photos').eq('id', id).single()
    if (siteErr) throw new ApiError(400, siteErr.message || 'site_not_found')

    const photos = normalizePhotos(siteData?.photos)
    const idx = photos.findIndex((p) => p.path === path)
    if (idx < 0) throw new ApiError(400, 'photo_not_found')

    const nextPhotos = [photos[idx], ...photos.slice(0, idx), ...photos.slice(idx + 1)]

    const { data: updated, error: updErr } = await supabase
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (updErr) throw new ApiError(500, updErr.message || 'db_update_failed')

    const site = await withSignedUrls(supabase, updated)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}
