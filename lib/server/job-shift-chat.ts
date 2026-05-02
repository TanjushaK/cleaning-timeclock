import type { CompatClient } from '@/lib/server/compat/client'
import { ApiError } from '@/lib/route-db'
import { dbQuery } from '@/lib/server/pool'
import { localPhotoBucket } from '@/lib/server/local-photo-storage'

export type JobMessageReaderRole = 'admin' | 'worker'

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

export const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

export const CHAT_MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const CHAT_MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const CHAT_MAX_IMAGES_PER_MESSAGE = 5
export const CHAT_MAX_VIDEOS_PER_MESSAGE = 1

export type JobMessageRow = {
  id: string
  job_id: string
  author_id: string
  author_role: string
  body: string | null
  created_at: string
}

export type JobAttachmentRow = {
  id: string
  message_id: string
  job_id: string
  storage_path: string
  public_url: string | null
  mime_type: string
  file_name: string | null
  file_size_bytes: number
  kind: string
  created_at: string
}

function parseBucketRef(raw: string | undefined | null, fallbackBucket: string) {
  const s = String(raw || '').trim().replace(/^\/+|\/+$/g, '')
  if (!s) return { bucket: fallbackBucket, prefix: '' }
  const parts = s.split('/').filter(Boolean)
  const bucket = (parts[0] || '').trim() || fallbackBucket
  const prefix = parts.slice(1).join('/')
  return { bucket, prefix }
}

function joinPath(...parts: string[]) {
  return parts
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}

function safeFileName(s: string) {
  return String(s || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 160)
}

const RAW_STORAGE = process.env.JOB_MESSAGE_STORAGE || 'site-photos/job-messages'
const { bucket: CHAT_BUCKET, prefix: CHAT_PREFIX } = parseBucketRef(RAW_STORAGE, 'site-photos')

export function getChatBucketClient() {
  return localPhotoBucket(CHAT_BUCKET)
}

export function buildChatObjectPath(jobId: string, messageId: string, fileName: string) {
  const base = CHAT_PREFIX
    ? joinPath(CHAT_PREFIX, jobId, messageId, safeFileName(fileName))
    : joinPath(jobId, messageId, safeFileName(fileName))
  return base
}

export function mimeToKind(mime: string): 'image' | 'video' | null {
  const m = mime.toLowerCase()
  if (ALLOWED_IMAGE_MIMES.has(m)) return 'image'
  if (ALLOWED_VIDEO_MIMES.has(m)) return 'video'
  return null
}

export type IncomingFile = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

export function asIncomingFile(v: FormDataEntryValue | null): IncomingFile | null {
  if (!v) return null
  if (typeof v === 'string') return null
  const anyv = v as { arrayBuffer?: () => Promise<ArrayBuffer>; size?: number; name?: string; type?: string }
  if (typeof anyv?.arrayBuffer !== 'function' || typeof anyv?.size !== 'number') return null
  return {
    name: typeof anyv.name === 'string' && anyv.name ? String(anyv.name) : 'file',
    type: typeof anyv.type === 'string' ? String(anyv.type) : '',
    size: Number(anyv.size) || 0,
    arrayBuffer: () => anyv.arrayBuffer!(),
  }
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

function signedTtlSeconds() {
  const raw = Number(process.env.JOB_MESSAGES_SIGNED_URL_TTL || '86400')
  return Number.isFinite(raw) && raw > 0 ? raw : 86400
}

export async function listMessagesPayload(db: CompatClient, jobId: string) {
  const ttl = signedTtlSeconds()

  const { data: msgRows, error: mErr } = await db
    .from('job_messages')
    .select('id,job_id,author_id,author_role,body,created_at')
    .eq('job_id', jobId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (mErr) throw new ApiError(400, mErr.message)

  const messages = (msgRows || []) as JobMessageRow[]
  const messageIds = messages.map((m) => m.id)
  let attachments: JobAttachmentRow[] = []

  if (messageIds.length) {
    for (const part of chunk(messageIds, 100)) {
      const { data: attRows, error: aErr } = await db
        .from('job_message_attachments')
        .select('id,message_id,job_id,storage_path,public_url,mime_type,file_name,file_size_bytes,kind,created_at')
        .in('message_id', part)
        .order('created_at', { ascending: true })
      if (aErr) throw new ApiError(400, aErr.message)
      attachments = attachments.concat((attRows || []) as JobAttachmentRow[])
    }
  }

  const authorIds = Array.from(new Set(messages.map((m) => String(m.author_id))))
  const profileById = new Map<string, { full_name: string | null }>()
  if (authorIds.length) {
    const { data: profs } = await db.from('profiles').select('id,full_name').in('id', authorIds)
    for (const p of profs || []) {
      profileById.set(String((p as { id: string }).id), { full_name: (p as { full_name?: string | null }).full_name ?? null })
    }
  }

  const bucket = getChatBucketClient()
  const pathSet = Array.from(new Set(attachments.map((a) => a.storage_path).filter(Boolean)))
  const urlByPath = new Map<string, string>()
  if (pathSet.length) {
    const { data: signed } = await bucket.createSignedUrls(pathSet, ttl)
    if (Array.isArray(signed)) {
      for (const s of signed as { path?: string; signedUrl?: string }[]) {
        const p = s?.path ? String(s.path) : ''
        const u = s?.signedUrl ? String(s.signedUrl) : ''
        if (p && u) urlByPath.set(p, u)
      }
    }
  }

  const attByMsg = new Map<string, JobAttachmentRow[]>()
  for (const a of attachments) {
    if (!attByMsg.has(a.message_id)) attByMsg.set(a.message_id, [])
    attByMsg.get(a.message_id)!.push(a)
  }

  const out = messages.map((m) => {
    const prof = profileById.get(String(m.author_id))
    const name = String(prof?.full_name || '').trim()
    const author_name =
      name || (m.author_role === 'admin' ? 'Admin' : `${String(m.author_id).slice(0, 8)}`)

    const atts = (attByMsg.get(m.id) || []).map((a) => ({
      id: a.id,
      kind: a.kind,
      mime_type: a.mime_type,
      file_name: a.file_name,
      file_size_bytes: a.file_size_bytes,
      url: urlByPath.get(a.storage_path) || a.public_url || '',
    }))

    return {
      id: m.id,
      job_id: m.job_id,
      author_id: m.author_id,
      author_role: m.author_role,
      author_name,
      body: m.body,
      created_at: m.created_at,
      attachments: atts,
    }
  })

  return { messages: out }
}

export async function markJobMessagesRead(
  _db: CompatClient,
  params: { jobId: string; userId: string; readerRole: JobMessageReaderRole }
) {
  const { jobId, userId, readerRole } = params
  await dbQuery(
    `insert into job_message_reads (job_id, user_id, reader_role, last_read_at, updated_at)
     values ($1::uuid, $2::uuid, $3::text, now(), now())
     on conflict (job_id, user_id) do update set
       reader_role = excluded.reader_role,
       last_read_at = now(),
       updated_at = now()`,
    [jobId, userId, readerRole],
  )
}

export async function getUnreadCountForJob(
  _db: CompatClient,
  params: { jobId: string; userId: string; readerRole: JobMessageReaderRole }
): Promise<number> {
  const { jobId, userId } = params
  const result = await dbQuery<{ n: string }>(
    `select count(*)::text as n
       from job_messages m
      where m.job_id = $1::uuid
        and m.deleted_at is null
        and m.author_id::text <> $2::text
        and (
          not exists (
            select 1 from job_message_reads r
             where r.job_id = m.job_id
               and r.user_id = $2::uuid
          )
          or m.created_at > (
            select r2.last_read_at from job_message_reads r2
             where r2.job_id = $1::uuid and r2.user_id = $2::uuid
             limit 1
          )
        )`,
    [jobId, userId],
  )
  const row = result.rows[0]
  return row?.n ? parseInt(String(row.n), 10) || 0 : 0
}

export async function listUnreadCountsForJobs(
  _db: CompatClient,
  params: { jobIds: string[]; userId: string; readerRole: JobMessageReaderRole }
): Promise<Record<string, number>> {
  const { jobIds, userId } = params
  const ids = Array.from(new Set(jobIds.map((x) => String(x).trim()).filter(Boolean)))
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = 0
  if (!ids.length) return out

  const result = await dbQuery<{ job_id: string; n: string }>(
    `select m.job_id::text as job_id, count(*)::text as n
       from job_messages m
       left join job_message_reads r
         on r.job_id = m.job_id and r.user_id = $2::uuid
      where m.job_id = any($1::uuid[])
        and m.deleted_at is null
        and m.author_id::text <> $2::text
        and (r.last_read_at is null or m.created_at > r.last_read_at)
      group by m.job_id`,
    [ids, userId],
  )
  for (const row of result.rows) {
    out[String(row.job_id)] = row?.n ? parseInt(String(row.n), 10) || 0 : 0
  }
  return out
}

export async function insertJobMessage(
  db: CompatClient,
  params: { jobId: string; authorId: string; authorRole: 'admin' | 'worker'; body: string | null }
) {
  const bodyTrim = params.body != null ? String(params.body).trim() : ''
  const { data, error } = await db
    .from('job_messages')
    .insert({
      job_id: params.jobId,
      author_id: params.authorId,
      author_role: params.authorRole,
      body: bodyTrim.length ? bodyTrim : null,
    })
    .select('id,job_id,author_id,author_role,body,created_at')
    .single()

  if (error || !data) throw new ApiError(400, error?.message || 'failed to create message')

  const full = await listMessagesPayload(db, params.jobId)
  const one = full.messages.find((x) => x.id === (data as JobMessageRow).id)
  if (!one) throw new ApiError(500, 'message created but not readable')
  return { message: one }
}

export async function insertChatAttachment(params: {
  db: CompatClient
  jobId: string
  messageId: string
  file: IncomingFile
}) {
  const { db, jobId, messageId, file } = params

  const { data: msg, error: msgErr } = await db
    .from('job_messages')
    .select('id,job_id')
    .eq('id', messageId)
    .maybeSingle()

  if (msgErr || !msg || String((msg as { job_id: string }).job_id) !== jobId) {
    throw new ApiError(404, 'Message not found')
  }

  const mime = String(file.type || '').toLowerCase()
  const kind = mimeToKind(mime)
  if (!kind) throw new ApiError(400, 'Unsupported file type')

  if (kind === 'image') {
    if (file.size <= 0) throw new ApiError(400, 'Empty file')
    if (file.size > CHAT_MAX_IMAGE_BYTES) throw new ApiError(400, 'Image too large')
  } else {
    if (file.size <= 0) throw new ApiError(400, 'Empty file')
    if (file.size > CHAT_MAX_VIDEO_BYTES) throw new ApiError(400, 'Video too large (max 200 MB)')
  }

  const { data: existing, error: exErr } = await db.from('job_message_attachments').select('kind').eq('message_id', messageId)
  if (exErr) throw new ApiError(400, exErr.message)

  const rows = (existing || []) as { kind: string }[]
  const imgCount = rows.filter((r) => r.kind === 'image').length
  const vidCount = rows.filter((r) => r.kind === 'video').length

  if (kind === 'image' && imgCount >= CHAT_MAX_IMAGES_PER_MESSAGE) {
    throw new ApiError(400, 'Maximum 5 images per message')
  }
  if (kind === 'video' && vidCount >= CHAT_MAX_VIDEOS_PER_MESSAGE) {
    throw new ApiError(400, 'Maximum 1 video per message')
  }

  const defaultName = kind === 'video' ? 'video.mp4' : 'photo.jpg'
  const objectPath = buildChatObjectPath(jobId, messageId, file.name || defaultName)
  const buf = Buffer.from(await file.arrayBuffer())

  const bucket = getChatBucketClient()
  const { error: upErr } = await bucket.upload(objectPath, buf, {
    contentType: mime || (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
    upsert: false,
  })
  if (upErr) throw new ApiError(500, upErr.message)

  const { data: ins, error: insErr } = await db
    .from('job_message_attachments')
    .insert({
      message_id: messageId,
      job_id: jobId,
      storage_path: objectPath,
      public_url: null,
      mime_type: mime,
      file_name: file.name || null,
      file_size_bytes: file.size,
      kind,
    })
    .select('id,storage_path')
    .single()

  if (insErr || !ins) throw new ApiError(500, insErr?.message || 'insert failed')

  const ttl = signedTtlSeconds()
  const { data: signed } = await bucket.createSignedUrls([objectPath], ttl)
  let url = ''
  if (Array.isArray(signed) && signed[0] && (signed[0] as { signedUrl?: string }).signedUrl) {
    url = String((signed[0] as { signedUrl: string }).signedUrl)
  }

  return {
    attachment: {
      id: (ins as { id: string }).id,
      kind,
      mime_type: mime,
      file_name: file.name || null,
      file_size_bytes: file.size,
      url,
    },
  }
}
