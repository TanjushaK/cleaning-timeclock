// app/api/admin/workers/[id]/photos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { AdminApiErrorCode } from '@/lib/api-error-codes'
import type { StorageBucketClient } from '@/lib/server/compat/storage-shim'
import { localPhotoBucket } from '@/lib/server/local-photo-storage'
import { routeDynamicId } from '@/lib/server/route-dynamic-id'
import { ApiError, requireAdmin, toErrorResponse } from '@/lib/route-db'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }
type AvatarKey = 'avatar_path' | 'avatar_url' | 'photo_path'

const MAX_UPLOAD_BYTES = (() => {
  const raw = process.env.WORKER_PHOTOS_MAX_BYTES || process.env.MAX_UPLOAD_BYTES || '15728640' // 15MB
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return 15 * 1024 * 1024
  return Math.min(Math.max(n, 256 * 1024), 25 * 1024 * 1024)
})()

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  // iPhone HEIC/HEIF
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'])

type IncomingFile = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

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

const RAW = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'
const { bucket: BUCKET, prefix: BUCKET_PREFIX } = parseBucketRef(RAW, 'site-photos')

function getSignedTtlSeconds(): number {
  const v = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600')
  if (!Number.isFinite(v) || v <= 0) return 3600
  return Math.min(v, 60 * 60 * 24 * 7)
}

function withCookieBearer(req: NextRequest): Headers {
  const headers = new Headers(req.headers)
  const auth = headers.get('authorization') || headers.get('Authorization') || ''
  const hasBearer = /^Bearer\s+.+/i.test(auth)
  if (!hasBearer) {
    const cookieToken = req.cookies.get('ct_access_token')?.value?.trim()
    if (cookieToken) headers.set('authorization', `Bearer ${cookieToken}`)
  }
  return headers
}

function safeName(s: string): string {
  return String(s || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
}

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function workerPrefix(workerId: string): string {
  const root = BUCKET_PREFIX ? BUCKET_PREFIX : 'workers'
  return joinPath(root, workerId)
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
  if (file.size <= 0) throw new ApiError(400, 'File is empty', AdminApiErrorCode.PHOTO_EMPTY)
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round((MAX_UPLOAD_BYTES / 1024 / 1024) * 10) / 10
    throw new ApiError(400, `File is too large (max ${mb} MB)`, AdminApiErrorCode.PHOTO_TOO_LARGE)
  }

  const ext = fileExt(file)
  const mime = String(file.type || '').toLowerCase()

  const okByMime = mime ? ALLOWED_IMAGE_TYPES.has(mime) : false
  const okByExt = ALLOWED_EXT.has(ext)

  if (!okByMime && !okByExt)
    throw new ApiError(400, 'Unsupported format (JPG/PNG/WebP/HEIC/HEIF)', AdminApiErrorCode.PHOTO_FORMAT_INVALID)
}

let AVATAR_KEY: AvatarKey | null = null

async function resolveAvatarKey(db: any): Promise<AvatarKey> {
  if (AVATAR_KEY) return AVATAR_KEY
  const candidates: AvatarKey[] = ['avatar_path', 'avatar_url', 'photo_path']
  for (const k of candidates) {
    const { error } = await db.from('profiles').select(k).limit(1)
    if (!error) {
      AVATAR_KEY = k
      return k
    }
    const msg = String((error as any)?.message || '')
    if (msg.includes('column') && msg.includes('does not exist')) continue
  }
  AVATAR_KEY = 'avatar_path'
  return AVATAR_KEY
}


function isHeicName(name: string) {
  return /\.(heic|heif)$/i.test(String(name || ''))
}

async function normalizeHeicInBucket(
  sb: any,
  bucketClient: StorageBucketClient,
  workerId: string,
  itemsRaw: any[],
): Promise<boolean> {
  const heic = (itemsRaw || []).filter((x: any) => isHeicName(String(x?.name || '')))
  if (heic.length === 0) return false
  const pref = workerPrefix(workerId)
  const names = new Set((itemsRaw || []).map((x: any) => String(x?.name || '')))
  const avatarKey = await resolveAvatarKey(sb)
  const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
  const curAvatar = prof ? String((prof as any)[avatarKey] || '') : ''
  let nextAvatar = curAvatar
  let changed = false
  for (const it of heic) {
    const name = String(it?.name || '')
    if (!name) continue
    const base = name.replace(/\.(heic|heif)$/i, '')
    const jpgName = `${base}.jpg`
    const oldPath = `${pref}/${name}`
    const newPath = `${pref}/${jpgName}`
    // если jpeg уже есть — просто удалим heic и поправим avatar_path
    if (!names.has(jpgName)) {
      const { data: blob, error: dlErr } = await bucketClient.download(oldPath)
      if (dlErr || !blob) continue
      const ab = await (blob as any).arrayBuffer()
      const input = Buffer.from(ab)
      let out: Buffer
      try {
        out = await sharp(input).rotate().jpeg({ quality: 85 }).toBuffer()
      } catch {
        continue
      }
      const { error: upErr } = await bucketClient.upload(newPath, out, { contentType: 'image/jpeg', upsert: false })
      if (upErr) continue
      names.add(jpgName)
    }
    if (curAvatar && curAvatar === oldPath) nextAvatar = newPath
    await bucketClient.remove([oldPath]).catch(() => null)
    changed = true
  }
  if (nextAvatar && nextAvatar !== curAvatar) {
    await sb.from('profiles').update({ [avatarKey]: nextAvatar }).eq('id', workerId)
    changed = true
  }
  return changed
}

async function listPhotos(sb: any, bucketClient: StorageBucketClient, workerId: string): Promise<WorkerPhoto[]> {
  const pref = workerPrefix(workerId)

  const { data: listed, error: listErr } = await bucketClient.list(pref, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  })

  if (listErr) throw new ApiError(500, listErr.message, AdminApiErrorCode.DB_ERROR)

  let itemsRaw = (listed || []).filter((x: any) => x?.name && x.name !== '.emptyFolderPlaceholder')
  // HEIC/HEIF часто не отображаются в Chrome/Android WebView — конвертируем в JPEG автоматически
  if (itemsRaw.length) {
    const changed = await normalizeHeicInBucket(sb, bucketClient, workerId, itemsRaw).catch(() => false)
    if (changed) {
      const { data: relisted } = await bucketClient.list(pref, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      })
      itemsRaw = (relisted || []).filter((x: any) => x?.name && x.name !== '.emptyFolderPlaceholder')
    }
  }
  const ttl = getSignedTtlSeconds()

  const paths = itemsRaw.map((it: any) => `${pref}/${it.name}`)
  if (paths.length === 0) return []

  const urlByPath = new Map<string, string>()
  const { data: signed, error: signErr } = await bucketClient.createSignedUrls(paths, ttl)

  if (!signErr && Array.isArray(signed)) {
    for (const s of signed as any[]) {
      const p = s?.path ? String(s.path) : ''
      const u = s?.signedUrl ? String(s.signedUrl) : ''
      if (p && u) urlByPath.set(p, u)
    }
  } else {
    for (const p of paths) {
      const { data: one } = await bucketClient.createSignedUrl(p, ttl)
      if (one?.signedUrl) urlByPath.set(p, String(one.signedUrl))
    }
  }

  const out: WorkerPhoto[] = []
  for (const it of itemsRaw) {
    const path = `${pref}/${it.name}`
    out.push({
      path,
      url: urlByPath.get(path),
      created_at: (it as any)?.created_at ?? null,
    })
  }
  return out
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const workerId = await routeDynamicId(req, ctx)
    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)
    if (!workerId) throw new ApiError(400, 'worker id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const photos = await listPhotos((admin as any).db, localPhotoBucket(BUCKET), workerId)
    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const workerId = await routeDynamicId(req, ctx)
    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)
    const sb = (admin as any).db
    const bucketClient = localPhotoBucket(BUCKET)

    if (!workerId) throw new ApiError(400, 'worker id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const current = await listPhotos(sb, bucketClient, workerId)
    if (current.length >= 5) throw new ApiError(400, 'Photo limit reached (5)', AdminApiErrorCode.PHOTO_LIMIT_REACHED)

    const form = await req.formData()
    const file = asIncomingFile(form.get('file'))
    if (!file) throw new ApiError(400, 'Pick a photo to upload', AdminApiErrorCode.PHOTO_PICK_REQUIRED)

    validateImageFile(file)

    let ext = canonicalExt(file)
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    let bytes: Buffer = Buffer.from(await file.arrayBuffer())
    const mime = String(file.type || '').toLowerCase()
    if (ext === 'heic' || ext === 'heif') {
      bytes = await sharp(bytes).rotate().jpeg({ quality: 85 }).toBuffer()
      ext = 'jpg'
    }
    const filename = `${Date.now()}_${base}.${ext}`

    const pref = workerPrefix(workerId)
    const path = `${pref}/${filename}`

    const contentType = ext === 'jpg' ? 'image/jpeg' : (ALLOWED_IMAGE_TYPES.has(mime) ? String(file.type) : contentTypeFor(ext))

    const { error: upErr } = await bucketClient.upload(path, bytes, {
      contentType,
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message, AdminApiErrorCode.DB_ERROR)

    const avatarKey = await resolveAvatarKey(sb)
    const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
    const cur = prof ? (prof as any)[avatarKey] : null
    if (!cur) {
      await sb.from('profiles').update({ [avatarKey]: path }).eq('id', workerId)
    }

    const photos = await listPhotos(sb, bucketClient, workerId)
    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const workerId = await routeDynamicId(req, ctx)
    const headers = withCookieBearer(req)
    const admin = await requireAdmin(headers)
    const sb = (admin as any).db
    const bucketClient = localPhotoBucket(BUCKET)

    if (!workerId) throw new ApiError(400, 'worker id is required', AdminApiErrorCode.WORKER_ID_REQUIRED)

    const body = await req.json().catch(() => ({} as any))
    const path = String(body?.path || '').trim()
    if (!path) throw new ApiError(400, 'path is required', AdminApiErrorCode.PHOTO_PATH_REQUIRED)

    const pref = workerPrefix(workerId)
    if (!path.startsWith(`${pref}/`)) throw new ApiError(403, 'Cannot delete another user’s file', AdminApiErrorCode.PHOTO_DELETE_FORBIDDEN)

    const { error: delErr } = await bucketClient.remove([path])
    if (delErr) throw new ApiError(500, delErr.message, AdminApiErrorCode.DB_ERROR)

    const photos = await listPhotos(sb, bucketClient, workerId)

    const avatarKey = await resolveAvatarKey(sb)
    const { data: prof } = await sb.from('profiles').select(avatarKey).eq('id', workerId).maybeSingle()
    const cur = prof ? (prof as any)[avatarKey] : null
    if (cur && String(cur) === path) {
      const nextAvatar = photos[0]?.path || null
      await sb.from('profiles').update({ [avatarKey]: nextAvatar }).eq('id', workerId)
    }

    return NextResponse.json({ photos }, { status: 200 })
  } catch (e) {
    return toErrorResponse(e)
  }
}


