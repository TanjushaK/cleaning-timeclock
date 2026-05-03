/**
 * Image uploads for worker↔admin chat — same bucket and validation rules as /api/me/photos.
 */
import sharp from 'sharp'

import { localPhotoBucket } from '@/lib/server/local-photo-storage'
import type { StorageBucketClient } from '@/lib/server/compat/storage-shim'
import { ApiError } from '@/lib/route-db'

export const WORKER_ADMIN_CHAT_MAX_PHOTOS_PER_MESSAGE = 5

const MAX_UPLOAD_BYTES = (() => {
  const raw = process.env.WORKER_PHOTOS_MAX_BYTES || process.env.MAX_UPLOAD_BYTES || '15728640'
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return 15 * 1024 * 1024
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

const RAW = process.env.WORKER_PHOTOS_BUCKET || 'site-photos/workers'

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

const { bucket: ADMIN_CHAT_PHOTO_BUCKET } = parseBucketRef(RAW, 'site-photos')

export function adminChatPhotoBucket(): StorageBucketClient {
  return localPhotoBucket(ADMIN_CHAT_PHOTO_BUCKET)
}

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function pref(workerId: string) {
  const { prefix: BUCKET_PREFIX } = parseBucketRef(RAW, 'site-photos')
  const root = BUCKET_PREFIX ? BUCKET_PREFIX : 'workers'
  return joinPath(root, workerId)
}

export type IncomingImageFile = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

export function asIncomingImageFile(v: FormDataEntryValue | null): IncomingImageFile | null {
  if (!v) return null
  if (typeof v === 'string') return null
  const anyv = v as {
    arrayBuffer?: () => Promise<ArrayBuffer>
    size?: number
    name?: string
    type?: string
  }
  if (typeof anyv?.arrayBuffer !== 'function' || typeof anyv?.size !== 'number') return null

  const name = typeof anyv?.name === 'string' && anyv.name ? String(anyv.name) : 'photo.jpg'
  const type = typeof anyv?.type === 'string' ? String(anyv.type) : ''
  const size = Number(anyv.size) || 0

  return {
    name,
    type,
    size,
    arrayBuffer: () => anyv.arrayBuffer!(),
  }
}

function fileExt(file: IncomingImageFile) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return ext || 'jpg'
}

function canonicalExt(file: IncomingImageFile): string {
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

function safeName(s: string) {
  return String(s || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
}

export function validateChatImageFile(file: IncomingImageFile) {
  if (file.size <= 0) throw new ApiError(400, 'File is empty')
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = Math.round((MAX_UPLOAD_BYTES / 1024 / 1024) * 10) / 10
    throw new ApiError(400, `File too large (max ${mb} MB)`)
  }

  const ext = fileExt(file)
  const mime = String(file.type || '').toLowerCase()

  const okByMime = mime ? ALLOWED_IMAGE_TYPES.has(mime) : false
  const okByExt = ALLOWED_EXT.has(ext)

  if (!okByMime && !okByExt) throw new ApiError(400, 'Unsupported image type')
}

/** Collect image parts from multipart form (worker mobile sends repeated `photos`). */
export function collectMultipartImages(form: FormData): IncomingImageFile[] {
  const files: IncomingImageFile[] = []
  for (const entry of form.getAll('photos')) {
    const f = asIncomingImageFile(entry)
    if (f) files.push(f)
  }
  if (files.length === 0) {
    for (const entry of form.getAll('photo')) {
      const f = asIncomingImageFile(entry)
      if (f) files.push(f)
    }
  }
  if (files.length > WORKER_ADMIN_CHAT_MAX_PHOTOS_PER_MESSAGE) {
    throw new ApiError(400, `max ${WORKER_ADMIN_CHAT_MAX_PHOTOS_PER_MESSAGE} photos per message`)
  }
  return files
}

export type UploadedChatImage = {
  path: string
  mime_type: string
  size_bytes: number
}

export async function uploadChatImagesToBucket(
  bucketClient: StorageBucketClient,
  workerId: string,
  messageId: string,
  files: IncomingImageFile[],
): Promise<UploadedChatImage[]> {
  const out: UploadedChatImage[] = []
  let i = 0
  for (const file of files) {
    validateChatImageFile(file)
    let ext = canonicalExt(file)
    let bytes = Buffer.from(await file.arrayBuffer())
    const mime = String(file.type || '').toLowerCase()
    if (ext === 'heic' || ext === 'heif') {
      bytes = Buffer.from(await sharp(bytes).rotate().jpeg({ quality: 85 }).toBuffer())
      ext = 'jpg'
    }
    const base = safeName(file.name.replace(/\.[^.]+$/, '')) || 'photo'
    const filename = `${Date.now()}_${i}_${base}.${ext}`
    i += 1

    const path = joinPath(pref(workerId), 'admin-chat', messageId, filename)

    const contentType =
      ext === 'jpg' ? 'image/jpeg' : ALLOWED_IMAGE_TYPES.has(mime) ? String(file.type) : contentTypeFor(ext)

    const { error: upErr } = await bucketClient.upload(path, bytes, {
      contentType,
      upsert: false,
    })
    if (upErr) throw new ApiError(500, upErr.message)

    out.push({
      path,
      mime_type: contentType,
      size_bytes: bytes.length,
    })
  }
  return out
}

export function getWorkerPhotosSignedUrlTtl() {
  const v = Number(process.env.WORKER_PHOTOS_SIGNED_URL_TTL || '3600')
  return Number.isFinite(v) && v > 0 ? Math.min(v, 60 * 60 * 24 * 7) : 3600
}

export async function signedUrlForPath(
  bucketClient: StorageBucketClient,
  objectPath: string,
): Promise<string | null> {
  const { data, error } = await bucketClient.createSignedUrl(objectPath, getWorkerPhotosSignedUrlTtl())
  if (error || !data?.signedUrl) return null
  return String(data.signedUrl)
}
