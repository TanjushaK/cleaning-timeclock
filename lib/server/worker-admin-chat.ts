import type { CompatClient } from '@/lib/server/compat/client'
import { ApiError } from '@/lib/route-db'
import { dbQuery } from '@/lib/server/pool'

export const WORKER_ADMIN_CHAT_MAX_BODY = 10_000

export type WorkerAdminReaderRole = 'worker' | 'admin'

export type WorkerAdminMessageRow = {
  id: string
  worker_id: string
  author_role: string
  author_name: string | null
  body: string
  created_at: string
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

async function resolveAuthorDisplayName(db: CompatClient, authorId: string, authorRole: WorkerAdminReaderRole): Promise<string> {
  const { data, error } = await db.from('profiles').select('id,full_name').eq('id', authorId).maybeSingle()
  if (error) throw new ApiError(400, error.message)
  const fn = String((data as { full_name?: string | null } | null)?.full_name || '').trim()
  if (fn) return fn
  return authorRole === 'admin' ? 'Admin' : authorId.slice(0, 8)
}

function mapMessageRow(m: {
  id: string
  worker_id: string
  author_role: string
  author_name: string | null
  body: string
  created_at: string
}): WorkerAdminMessageRow {
  const role = String(m.author_role || '')
  const name = String(m.author_name || '').trim()
  return {
    id: String(m.id),
    worker_id: String(m.worker_id),
    author_role: role,
    author_name: name || (role === 'admin' ? 'Admin' : String(m.worker_id).slice(0, 8)),
    body: String(m.body ?? ''),
    created_at: typeof m.created_at === 'string' ? m.created_at : new Date(m.created_at as unknown as string).toISOString(),
  }
}

export async function listWorkerAdminMessages(db: CompatClient, workerId: string): Promise<WorkerAdminMessageRow[]> {
  const { data, error } = await db
    .from('worker_admin_messages')
    .select('id,worker_id,author_role,author_name,body,created_at')
    .eq('worker_id', workerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new ApiError(400, error.message)
  return ((data || []) as Array<Record<string, unknown>>).map((row) =>
    mapMessageRow({
      id: String(row.id),
      worker_id: String(row.worker_id),
      author_role: String(row.author_role),
      author_name: row.author_name != null ? String(row.author_name) : null,
      body: String(row.body ?? ''),
      created_at: String(row.created_at),
    }),
  )
}

export async function insertWorkerAdminMessage(
  db: CompatClient,
  params: { workerId: string; authorId: string; authorRole: WorkerAdminReaderRole; body: string },
): Promise<WorkerAdminMessageRow> {
  const author_name = await resolveAuthorDisplayName(db, params.authorId, params.authorRole)
  const { data, error } = await db
    .from('worker_admin_messages')
    .insert({
      worker_id: params.workerId,
      author_id: params.authorId,
      author_role: params.authorRole,
      author_name,
      body: params.body,
    })
    .select('id,worker_id,author_role,author_name,body,created_at')
    .single()

  if (error || !data) throw new ApiError(400, error?.message || 'failed to create message')
  const row = data as {
    id: string
    worker_id: string
    author_role: string
    author_name: string | null
    body: string
    created_at: string
  }
  return mapMessageRow(row)
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
         m.body,
         m.created_at
       from worker_admin_messages m
       where m.deleted_at is null
       order by m.worker_id, m.created_at desc
     )
     select p.id::text as worker_id,
            coalesce(nullif(trim(p.full_name), ''), '') as worker_name,
            coalesce(nullif(trim(p.email), ''), '') as worker_email,
            lm.body as last_message,
            lm.created_at::text as last_message_at,
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
       join latest lm on lm.worker_id = p.id
      where p.role = 'worker'
      order by lm.created_at desc`,
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
