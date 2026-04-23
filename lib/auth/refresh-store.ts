import crypto from 'crypto'
import { dbQuery } from '@/lib/server/pool'
import { refreshTokenTtlSeconds } from '@/lib/server/env'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function expiresAtIso(): string {
  return new Date(Date.now() + refreshTokenTtlSeconds() * 1000).toISOString()
}

export async function issueRefreshToken(userId: string, options?: { userAgent?: string | null; ip?: string | null }): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  await dbQuery(
    `insert into refresh_sessions (id, user_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, $3, $4::timestamptz, $5, $6)`,
    [crypto.randomUUID(), userId, tokenHash, expiresAtIso(), options?.userAgent ?? null, options?.ip ?? null],
  )
  return token
}

export async function consumeRefreshToken(token: string): Promise<{ user_id: string } | null> {
  const tokenHash = hashToken(token)
  const result = await dbQuery<{ id: string; user_id: string }>(
    `update refresh_sessions
        set revoked_at = now(),
            updated_at = now()
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
      returning id, user_id`,
    [tokenHash],
  )
  const row = result.rows[0]
  if (!row) return null
  return { user_id: String(row.user_id) }
}

export async function revokeRefreshSessionsForUser(userId: string): Promise<void> {
  await dbQuery(
    `update refresh_sessions set revoked_at = now(), updated_at = now() where user_id = $1 and revoked_at is null`,
    [userId],
  )
}
