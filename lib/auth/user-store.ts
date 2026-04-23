import crypto from 'crypto'
import { dbQuery } from '@/lib/server/pool'
import type { AppUser } from '@/lib/server/compat/types'
import { hashPassword } from '@/lib/auth/password'
import { canonicalPhoneDigits } from '@/lib/auth/phone-canonical'

function normalizeEmail(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim().toLowerCase()
  return raw || null
}

/** Persist phone as trimmed; prefer digits-only international (no "+") for stable matching. */
function normalizePhone(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const canon = canonicalPhoneDigits(raw)
  return canon || null
}

function mapUser(row: any): AppUser {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    email_confirmed_at: row.email_confirmed_at ? new Date(row.email_confirmed_at).toISOString() : null,
    phone_confirmed_at: row.phone_confirmed_at ? new Date(row.phone_confirmed_at).toISOString() : null,
    user_metadata: row.user_metadata && typeof row.user_metadata === 'object' ? row.user_metadata : {},
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

export type StoredUser = AppUser & {
  password_hash: string | null
  deleted_at: string | null
}

function mapStoredUser(row: any): StoredUser {
  const user = mapUser(row)
  return {
    ...user,
    password_hash: row.password_hash ? String(row.password_hash) : null,
    deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
  }
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const result = await dbQuery(
    `select id, email, phone, password_hash, email_confirmed_at, phone_confirmed_at, user_metadata, deleted_at, created_at, updated_at
       from app_users
      where id = $1
      limit 1`,
    [id],
  )
  return result.rows[0] ? mapStoredUser(result.rows[0]) : null
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const result = await dbQuery(
    `select id, email, phone, password_hash, email_confirmed_at, phone_confirmed_at, user_metadata, deleted_at, created_at, updated_at
       from app_users
      where email = $1 and deleted_at is null
      limit 1`,
    [normalizeEmail(email)],
  )
  return result.rows[0] ? mapStoredUser(result.rows[0]) : null
}

export type PhoneLookupSource = 'app_users' | 'profiles' | 'none'

export async function getUserByPhone(phone: string): Promise<StoredUser | null> {
  const r = await getUserByPhoneWithSource(phone)
  return r.user
}

export async function getUserByPhoneWithSource(phone: string): Promise<{
  user: StoredUser | null
  source: PhoneLookupSource
}> {
  const key = canonicalPhoneDigits(phone)
  if (!key) return { user: null, source: 'none' }

  const result = await dbQuery(
    `select id, email, phone, password_hash, email_confirmed_at, phone_confirmed_at, user_metadata, deleted_at, created_at, updated_at
       from app_users
      where deleted_at is null
        and regexp_replace(coalesce(phone, ''), '\\D', '', 'g') = $1
      limit 1`,
    [key],
  )
  if (result.rows[0]) {
    return { user: mapStoredUser(result.rows[0]), source: 'app_users' }
  }

  const fromProfile = await dbQuery(
    `select u.id, u.email, u.phone, u.password_hash, u.email_confirmed_at, u.phone_confirmed_at, u.user_metadata, u.deleted_at, u.created_at, u.updated_at
       from profiles p
       join app_users u on u.id = p.id
      where u.deleted_at is null
        and regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g') = $1
      limit 1`,
    [key],
  )
  if (fromProfile.rows[0]) {
    return { user: mapStoredUser(fromProfile.rows[0]), source: 'profiles' }
  }

  return { user: null, source: 'none' }
}

export async function listUsers(page = 1, perPage = 100): Promise<AppUser[]> {
  const safePage = Math.max(1, page)
  const safePerPage = Math.max(1, Math.min(1000, perPage))
  const offset = (safePage - 1) * safePerPage
  const result = await dbQuery(
    `select id, email, phone, email_confirmed_at, phone_confirmed_at, user_metadata, created_at, updated_at
       from app_users
      where deleted_at is null
      order by created_at asc, id asc
      limit $1 offset $2`,
    [safePerPage, offset],
  )
  return result.rows.map(mapUser)
}

export async function createUser(input: {
  id?: string
  email?: string | null
  phone?: string | null
  password: string
  email_confirm?: boolean
  phone_confirm?: boolean
  user_metadata?: Record<string, unknown>
}): Promise<AppUser> {
  const id = input.id || crypto.randomUUID()
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone)
  const passwordHash = await hashPassword(input.password)
  const result = await dbQuery(
    `insert into app_users (
        id, email, phone, password_hash, email_confirmed_at, phone_confirmed_at, user_metadata
      ) values (
        $1, $2, $3, $4,
        case when $5 then now() else null end,
        case when $6 then now() else null end,
        $7::jsonb
      )
      returning id, email, phone, email_confirmed_at, phone_confirmed_at, user_metadata, created_at, updated_at`,
    [id, email, phone, passwordHash, !!input.email_confirm, !!input.phone_confirm, JSON.stringify(input.user_metadata ?? {})],
  )
  return mapUser(result.rows[0])
}

export async function updateUserById(id: string, patch: {
  email?: string | null
  phone?: string | null
  password?: string
  email_confirm?: boolean
  phone_confirm?: boolean
  user_metadata?: Record<string, unknown>
}): Promise<AppUser | null> {
  const existing = await getUserById(id)
  if (!existing || existing.deleted_at) return null
  const passwordHash = patch.password ? await hashPassword(patch.password) : existing.password_hash
  const userMetadata = patch.user_metadata ?? existing.user_metadata
  const result = await dbQuery(
    `update app_users
        set email = $2,
            phone = $3,
            password_hash = $4,
            email_confirmed_at = case
              when $5 = true then coalesce(email_confirmed_at, now())
              when $5 = false then null
              else email_confirmed_at
            end,
            phone_confirmed_at = case
              when $6 = true then coalesce(phone_confirmed_at, now())
              when $6 = false then null
              else phone_confirmed_at
            end,
            user_metadata = $7::jsonb,
            updated_at = now()
      where id = $1 and deleted_at is null
      returning id, email, phone, email_confirmed_at, phone_confirmed_at, user_metadata, created_at, updated_at`,
    [
      id,
      patch.email !== undefined ? normalizeEmail(patch.email) : existing.email,
      patch.phone !== undefined ? normalizePhone(patch.phone) : existing.phone,
      passwordHash,
      patch.email_confirm === undefined ? null : patch.email_confirm,
      patch.phone_confirm === undefined ? null : patch.phone_confirm,
      JSON.stringify(userMetadata ?? {}),
    ],
  )
  return result.rows[0] ? mapUser(result.rows[0]) : null
}

/** Same semantics as `/api/me/password`: min 8 chars, confirm contacts, clear temp_password flag. */
export async function applyPasswordRecoveryUpdate(
  userId: string,
  password: string,
): Promise<'ok' | 'missing' | 'short'> {
  if (password.length < 8) return 'short'
  const existing = await getUserById(userId)
  if (!existing || existing.deleted_at) return 'missing'
  const meta = { ...(existing.user_metadata ?? {}), temp_password: false }
  await updateUserById(userId, {
    password,
    ...(existing.email ? { email_confirm: true as const } : {}),
    ...(existing.phone ? { phone_confirm: true as const } : {}),
    user_metadata: meta,
  })
  return 'ok'
}

export async function deleteUserById(id: string): Promise<boolean> {
  const result = await dbQuery(
    `update app_users
        set deleted_at = now(),
            email = null,
            phone = null,
            password_hash = null,
            updated_at = now()
      where id = $1 and deleted_at is null`,
    [id],
  )
  return (result.rowCount ?? 0) > 0
}
