import type { CompatClient } from '@/lib/server/compat/client'
import { ApiError } from '@/lib/route-db'
import { dbQuery } from '@/lib/server/pool'
import {
  adminChatPhotoBucket,
  getWorkerPhotosSignedUrlTtl,
  uploadChatImagesToBucket,
  type IncomingImageFile,
  type UploadedChatImage,
} from '@/lib/server/worker-admin-chat-media'

export { collectMultipartImages } from '@/lib/server/worker-admin-chat-media'

export const WORKER_ADMIN_CHAT_MAX_BODY = 10_000

export type WorkerAdminReaderRole = 'worker' | 'admin'

export type WorkerAdminAttachmentRow = {
  id: string
  path: string
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export type WorkerAdminMessageRow = {
  id: string
  worker_id: string
  author_role: string
  author_name: string | null
  body: string
  created_at: string
  attachments: WorkerAdminAttachmentRow[]
}

export type WorkerAdminThreadRow = {
  worker_id: string
  worker_name: string
  worker_email: string
  last_message: string
  last_message_at: string
  unread_count: number
}

function oppositeAuthorRole(readerRole: WorkerAdminReaderRole): 'worker' | 'admin' {
  return readerRole === 'worker' ? 'admin' : 'worker'
}

/** JSON POST (legacy mobile): non-empty body required. */
export function parseWorkerAdminBody(raw: unknown): string {
  const s =
    typeof raw === 'string'
      ? raw.trim()
      : raw != null && typeof raw === 'object' && 'body' in (raw as object)
        ? String((raw as { body?: unknown }).body ?? '').trim()
        : ''
  if (!s) throw new ApiError(400, 'body required')
  if (s.length > WORKER_ADMIN_CHAT_MAX_BODY) {
    throw new ApiError(400, `body too long (max ${WORKER_ADMIN_CHAT_MAX_BODY})`)
  }
  return s
}

/** Multipart `body` field: optional text; null if empty. */
export function parseOptionalWorkerAdminBodyField(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  if (s.length > WORKER_ADMIN_CHAT_MAX_BODY) {
    throw new ApiError(400, `body too long (max ${WORKER_ADMIN_CHAT_MAX_BODY})`)
  }
  return s
}

export function assertMessageHasBodyOrPhotos(body: string | null, photoCount: number) {
  const hasBody = !!(body && body.trim())
  if (!hasBody && photoCount <= 0) {
    throw new ApiError(400, 'body or at least one photo required')
  }
}

async function resolveAuthorDisplayName(db: CompatClient, authorId: string, authorRole: WorkerAdminReaderRole): Promise<string> {
  const { data, error } = await db.from('profiles').select('id,full_name').eq('id', authorId).maybeSingle()
  if (error) throw new ApiError(400, error.message)
  const fn = String((data as { full_name?: string | null } | null)?.full_name || '').trim()
  if (fn) return fn
  return authorRole === 'admin' ? 'Admin' : authorId.slice(0, 8)
}

function mapMessageRow(
  m: {
    id: string
    worker_id: string
    author_role: string
    author_name: string | null
    body: string | null
    created_at: string
  },
  attachments: WorkerAdminAttachmentRow[],
): WorkerAdminMessageRow {
  const role = String(m.author_role || '')
  const name = String(m.author_name || '').trim()
  const bodyStr = m.body != null && String(m.body).trim().length > 0 ? String(m.body) : ''
  return {
    id: String(m.id),
    worker_id: String(m.worker_id),
    author_role: role,
    author_name: name || (role === 'admin' ? 'Admin' : String(m.worker_id).slice(0, 8)),
    body: bodyStr,
    created_at: typeof m.created_at === 'string' ? m.created_at : new Date(m.created_at as unknown as string).toISOString(),
    attachments,
  }
}

async function loadAttachmentsForMessageIds(db: CompatClient, messageIds: string[]): Promise<Map<string, WorkerAdminAttachmentRow[]>> {
  const map = new Map<string, WorkerAdminAttachmentRow[]>()
  if (messageIds.length === 0) return map

  const { data, error } = await db
    .from('worker_admin_message_attachments')
    .select('id,message_id,path,mime_type,size_bytes,created_at')
    .in('message_id', messageIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(400, error.message)

  const rows = (data || []) as Array<Record<string, unknown>>
  const bucketClient = adminChatPhotoBucket()
  const ttl = getWorkerPhotosSignedUrlTtl()
  const paths = [...new Set(rows.map((r) => String(r.path || '')).filter(Boolean))]
  const urlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed, error: signErr } = await bucketClient.createSignedUrls(paths, ttl)
    if (!signErr && Array.isArray(signed)) {
      for (const s of signed as { path?: string; signedUrl?: string }[]) {
        const pp = s?.path ? String(s.path) : ''
        const uu = s?.signedUrl ? String(s.signedUrl) : ''
        if (pp && uu) urlByPath.set(pp, uu)
      }
    }
  }

  for (const r of rows) {
    const mid = String(r.message_id || '')
    if (!mid) continue
    const path = String(r.path || '')
    const att: WorkerAdminAttachmentRow = {
      id: String(r.id),
      path,
      url: urlByPath.get(path) ?? null,
      mime_type: r.mime_type != null ? String(r.mime_type) : null,
      size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
      created_at:
        typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at as unknown as string).toISOString(),
    }
    const list = map.get(mid) || []
    list.push(att)
    map.set(mid, list)
  }

  return map
}

export async function listWorkerAdminMessages(db: CompatClient, workerId: string): Promise<WorkerAdminMessageRow[]> {
  const { data, error } = await db
    .from('worker_admin_messages')
    .select('id,worker_id,author_role,author_name,body,created_at')
    .eq('worker_id', workerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(400, error.message)
  const rows = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    worker_id: String(row.worker_id),
    author_role: String(row.author_role),
    author_name: row.author_name != null ? String(row.author_name) : null,
    body: row.body != null ? String(row.body) : null,
    created_at: String(row.created_at),
  }))

  const ids = rows.map((r) => r.id)
  const attMap = await loadAttachmentsForMessageIds(db, ids)

  return rows.map((row) =>
    mapMessageRow(
      {
        id: row.id,
        worker_id: row.worker_id,
        author_role: row.author_role,
        author_name: row.author_name,
        body: row.body,
        created_at: row.created_at,
      },
      attMap.get(row.id) || [],
    ),
  )
}

export async function insertWorkerAdminMessage(
  db: CompatClient,
  params: { workerId: string; authorId: string; authorRole: WorkerAdminReaderRole; body: string | null },
): Promise<WorkerAdminMessageRow> {
  const author_name = await resolveAuthorDisplayName(db, params.authorId, params.authorRole)
  const bodyVal =
    params.body != null && String(params.body).trim().length > 0 ? String(params.body).trim() : null

  const { data, error } = await db
    .from('worker_admin_messages')
    .insert({
      worker_id: params.workerId,
      author_id: params.authorId,
      author_role: params.authorRole,
      author_name,
      body: bodyVal,
    })
    .select('id,worker_id,author_role,author_name,body,created_at')
    .single()

  if (error || !data) throw new ApiError(400, error?.message || 'failed to create message')
  const row = data as {
    id: string
    worker_id: string
    author_role: string
    author_name: string | null
    body: string | null
    created_at: string
  }
  return mapMessageRow(row, [])
}

async function insertAttachmentRows(
  db: CompatClient,
  params: {
    messageId: string
    workerId: string
    uploaderId: string
    uploaderRole: WorkerAdminReaderRole
    uploaded: UploadedChatImage[]
  },
): Promise<WorkerAdminAttachmentRow[]> {
  if (params.uploaded.length === 0) return []

  const rows = params.uploaded.map((u) => ({
    message_id: params.messageId,
    worker_id: params.workerId,
    uploader_id: params.uploaderId,
    uploader_role: params.uploaderRole,
    path: u.path,
    mime_type: u.mime_type,
    size_bytes: u.size_bytes,
  }))

  const { data, error } = await db.from('worker_admin_message_attachments').insert(rows).select('id,path,mime_type,size_bytes,created_at')

  if (error || !data) throw new ApiError(400, error?.message || 'failed to save attachments')

  const bucketClient = adminChatPhotoBucket()
  const ttl = getWorkerPhotosSignedUrlTtl()
  const paths = (data as Array<{ path?: string }>).map((r) => String(r.path || '')).filter(Boolean)
  const urlByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed, error: signErr } = await bucketClient.createSignedUrls(paths, ttl)
    if (!signErr && Array.isArray(signed)) {
      for (const s of signed as { path?: string; signedUrl?: string }[]) {
        const pp = s?.path ? String(s.path) : ''
        const uu = s?.signedUrl ? String(s.signedUrl) : ''
        if (pp && uu) urlByPath.set(pp, uu)
      }
    }
  }

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    path: String(r.path || ''),
    url: urlByPath.get(String(r.path || '')) ?? null,
    mime_type: r.mime_type != null ? String(r.mime_type) : null,
    size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    created_at:
      typeof r.created_at === 'string' ? r.created_at : new Date(r.created_at as unknown as string).toISOString(),
  }))
}

/** Create message with optional images (multipart flow). */
export async function createWorkerAdminMessageWithPhotos(
  db: CompatClient,
  params: {
    workerId: string
    authorId: string
    authorRole: WorkerAdminReaderRole
    body: string | null
    files: IncomingImageFile[]
  },
): Promise<WorkerAdminMessageRow> {
  assertMessageHasBodyOrPhotos(params.body, params.files.length)

  const msg = await insertWorkerAdminMessage(db, {
    workerId: params.workerId,
    authorId: params.authorId,
    authorRole: params.authorRole,
    body: params.body,
  })

  if (params.files.length === 0) {
    return msg
  }

  const bucketClient = adminChatPhotoBucket()
  const uploaded = await uploadChatImagesToBucket(bucketClient, params.workerId, msg.id, params.files)
  const attachments = await insertAttachmentRows(db, {
    messageId: msg.id,
    workerId: params.workerId,
    uploaderId: params.authorId,
    uploaderRole: params.authorRole,
    uploaded,
  })

  return { ...msg, attachments }
}

export async function markWorkerAdminMessagesRead(
  _db: CompatClient,
  params: { workerId: string; userId: string; readerRole: WorkerAdminReaderRole },
) {
  const { workerId, userId, readerRole } = params
  await dbQuery(
    `insert into worker_admin_message_reads (worker_id, user_id, reader_role, last_read_at)
     values ($1::uuid, $2::uuid, $3::text, now())
     on conflict (worker_id, user_id, reader_role) do update set
       last_read_at = now()`,
    [workerId, userId, readerRole],
  )
}

export async function getWorkerAdminUnreadCount(
  _db: CompatClient,
  params: { workerId: string; userId: string; readerRole: WorkerAdminReaderRole },
): Promise<number> {
  const { workerId, userId, readerRole } = params
  const opp = oppositeAuthorRole(readerRole)
  const result = await dbQuery<{ n: string }>(
    `select count(*)::text as n
       from worker_admin_messages m
      where m.worker_id = $1::uuid
        and m.deleted_at is null
        and m.author_role = $3::text
        and (
          not exists (
            select 1 from worker_admin_message_reads r
             where r.worker_id = m.worker_id
               and r.user_id = $2::uuid
               and r.reader_role = $4::text
          )
          or m.created_at > (
            select r2.last_read_at from worker_admin_message_reads r2
             where r2.worker_id = m.worker_id
               and r2.user_id = $2::uuid
               and r2.reader_role = $4::text
             limit 1
          )
        )`,
    [workerId, userId, opp, readerRole],
  )
  const row = result.rows[0]
  return row?.n ? parseInt(String(row.n), 10) || 0 : 0
}

export async function listWorkerAdminThreads(_db: CompatClient, adminUserId: string): Promise<WorkerAdminThreadRow[]> {
  const result = await dbQuery<{
    worker_id: string
    worker_name: string | null
    worker_email: string | null
    last_message: string
    last_message_at: string
    unread_count: string
  }>(
    `with latest as (
       select distinct on (m.worker_id)
         m.worker_id,
         m.id as message_id,
         m.body,
         m.created_at
       from worker_admin_messages m
       where m.deleted_at is null
       order by m.worker_id, m.created_at desc
     ),
     latest_enriched as (
       select
         l.worker_id,
         l.message_id,
         l.body,
         l.created_at,
         exists (
           select 1 from worker_admin_message_attachments a
           where a.message_id = l.message_id and a.deleted_at is null
         ) as has_attachments
       from latest l
     )
     select p.id::text as worker_id,
            coalesce(nullif(trim(p.full_name), ''), '') as worker_name,
            coalesce(nullif(trim(p.email), ''), '') as worker_email,
            coalesce(
              nullif(trim(coalesce(le.body, '')), ''),
              case when le.has_attachments then 'Фото' else '' end
            ) as last_message,
            le.created_at::text as last_message_at,
            (
              select count(*)::text
                from worker_admin_messages m
               where m.worker_id = p.id
                 and m.deleted_at is null
                 and m.author_role = 'worker'
                 and (
                   not exists (
                     select 1 from worker_admin_message_reads r
                      where r.worker_id = m.worker_id
                        and r.user_id = $1::uuid
                        and r.reader_role = 'admin'
                   )
                   or m.created_at > (
                     select r2.last_read_at from worker_admin_message_reads r2
                      where r2.worker_id = m.worker_id
                        and r2.user_id = $1::uuid
                        and r2.reader_role = 'admin'
                      limit 1
                   )
                 )
            ) as unread_count
       from profiles p
       join latest_enriched le on le.worker_id = p.id
      where p.role = 'worker'
      order by le.created_at desc`,
    [adminUserId],
  )

  return result.rows.map((r) => ({
    worker_id: String(r.worker_id),
    worker_name: String(r.worker_name || ''),
    worker_email: String(r.worker_email || ''),
    last_message: String(r.last_message || ''),
    last_message_at: String(r.last_message_at || ''),
    unread_count: r.unread_count ? parseInt(String(r.unread_count), 10) || 0 : 0,
  }))
}
