// app/api/admin/sites/[id]/photos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { localPhotoBucket } from '@/lib/server/local-photo-storage'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import { withCookieBearer } from '@/lib/server/with-cookie-bearer'

export const runtime = 'nodejs'

type SitePhoto = { path: string; url?: string; created_at?: string | null }

type IncomingFile = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

const MAX_UPLOAD_BYTES = (() => {
  const raw = process.env.SITE_PHOTOS_MAX_BYTES || process.env.MAX_UPLOAD_BYTES || '5242880' // 5MB
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return 5 * 1024 * 1024
  return Math.min(Math.max(n, 256 * 1024), 25 * 1024 * 1024)
})()

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

function asIncomingFile(v: FormDataEntryValue | null): IncomingFile | null {
  if (!v) return null
  if (typeof v === 'string') return null
  const anyv: any = v as any
  if (typeof anyv?.arrayBuffer !== 'function' || typeof anyv?.size !== 'number') return null

  const name = typeof anyv?.name === 'string' && anyv.name ? String(anyv.name) : 'photo.jpg'
  const type = typeof anyv?.type === 'string' ? String(anyv.type) : ''
  const size = Number(anyv.size) || 0

  return {
    name,
    type,
    size,
    arrayBuffer: () => anyv.arrayBuffer(),
  }
}

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

function fileExt(file: IncomingFile) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return ext || 'jpg'
}

function canonicalExt(file: IncomingFile): string {
  const ext = fileExt(file)
  if (ALLOWED_EXT.has(ext)) return ext
  const mime = String(file.type || '').toLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic' || mime === 'image/heic-sequence') return 'heic'
  if (mime === 'image/heif' || mime === 'image/heif-sequence') return 'heif'
  return 'jpg'
}

function contentTypeFor(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'heif') return 'image/heif'
  return 'image/jpeg'
}

function validateImageFile(file: IncomingFile) {
  if (file.size <= 0) throw new ApiError(400, 'file_empty')
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, 'file_too_large')

  const ext = fileExt(file)
  const mime = String(file.type || '').toLowerCase()

  const okByMime = mime ? ALLOWED_IMAGE_TYPES.has(mime) : false
  const okByExt = ALLOWED_EXT.has(ext)
  if (!okByMime && !okByExt) throw new ApiError(400, 'file_type_not_allowed')
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

async function withSignedUrls(site: any) {
  const photos = normalizePhotos(site?.photos)
  if (photos.length === 0) return { ...site, photos }

  const paths = Array.from(new Set(photos.map((p) => p.path).filter(Boolean)))
  const ttl = getSignedTtlSeconds()
  const bucketClient = localPhotoBucket(BUCKET)
  const { data: signed, error } = await bucketClient.createSignedUrls(paths, ttl)

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'id_required')

    const { db } = await requireAdmin(withCookieBearer(req))

    const form = await req.formData()
    const file = asIncomingFile(form.get('file'))
    if (!file) throw new ApiError(400, 'file_required')

    validateImageFile(file)

    const { data: siteData, error: siteErr } = await db.from('sites').select('id,photos').eq('id', id).single()
    if (siteErr) throw new ApiError(400, siteErr.message || 'site_not_found')

    const currentPhotos = normalizePhotos(siteData?.photos)
    if (currentPhotos.length >= 5) throw new ApiError(400, 'photo_limit')

    let ext = canonicalExt(file)
    const safeBase = sanitizeFilename(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    let bytes: Buffer = Buffer.from(await file.arrayBuffer())
    if (ext === 'heic' || ext === 'heif') {
      const sharp = (await import('sharp')).default
      bytes = await sharp(bytes).rotate().jpeg({ quality: 85 }).toBuffer()
      ext = 'jpg'
    }
    const filename = `${Date.now()}_${safeBase}.${ext}`

    const path = PREFIX ? joinPath(PREFIX, id, filename) : joinPath(id, filename)

    const mime = String(file.type || '').toLowerCase()
    const contentType = ext === 'jpg'
      ? 'image/jpeg'
      : (ALLOWED_IMAGE_TYPES.has(mime) ? String(file.type) : contentTypeFor(ext))

    const bucketClient = localPhotoBucket(BUCKET)
    const { error: upErr } = await bucketClient.upload(path, bytes, {
      contentType,
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message || 'upload_failed')

    const publicUrl = bucketClient.getPublicUrl(path).data.publicUrl
    const nextPhotos = [...currentPhotos, { path, url: publicUrl, created_at: new Date().toISOString() }]

    const { data: updated, error: updErr } = await db
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (updErr) throw new ApiError(500, updErr.message || 'db_update_failed')

    const site = await withSignedUrls(updated)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'id_required')

    const { db } = await requireAdmin(withCookieBearer(req))

    const body = await req.json().catch(() => null)
    const path = String(body?.path || '')
    if (!path) throw new ApiError(400, 'path_required')

    const { data: siteData, error: siteErr } = await db.from('sites').select('id,photos').eq('id', id).single()
    if (siteErr) throw new ApiError(400, siteErr.message || 'site_not_found')

    const photos = normalizePhotos(siteData?.photos)
    const nextPhotos = photos.filter((p) => p.path !== path)

    const { error: delErr } = await localPhotoBucket(BUCKET).remove([path])
    if (delErr) throw new ApiError(500, delErr.message || 'remove_failed')

    const { data: updated, error: updErr } = await db
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (updErr) throw new ApiError(500, updErr.message || 'db_update_failed')

    const site = await withSignedUrls(updated)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await routeDynamicId(req, ctx)
    if (!id) throw new ApiError(400, 'id_required')

    const { db } = await requireAdmin(withCookieBearer(req))

    const body = await req.json().catch(() => null)
    const action = String(body?.action || '')
    const path = String(body?.path || '')
    if (action !== 'make_primary') throw new ApiError(400, 'invalid_action')
    if (!path) throw new ApiError(400, 'path_required')

    const { data: siteData, error: siteErr } = await db.from('sites').select('id,photos').eq('id', id).single()
    if (siteErr) throw new ApiError(400, siteErr.message || 'site_not_found')

    const photos = normalizePhotos(siteData?.photos)
    const idx = photos.findIndex((p) => p.path === path)
    if (idx < 0) throw new ApiError(400, 'photo_not_found')

    const nextPhotos = [photos[idx], ...photos.slice(0, idx), ...photos.slice(idx + 1)]

    const { data: updated, error: updErr } = await db
      .from('sites')
      .update({ photos: nextPhotos })
      .eq('id', id)
      .select('id,name,address,lat,lng,radius,category,notes,photos,archived_at')
      .single()

    if (updErr) throw new ApiError(500, updErr.message || 'db_update_failed')

    const site = await withSignedUrls(updated)
    return NextResponse.json({ ok: true, site })
  } catch (e) {
    return toErrorResponse(e)
  }
}
