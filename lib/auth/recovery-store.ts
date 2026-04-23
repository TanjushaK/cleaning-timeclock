import crypto from 'crypto'
import { dbQuery } from '@/lib/server/pool'
import { appendAuthDeliveryLog } from '@/lib/server/auth-delivery-log'
import { sendPasswordResetEmailViaResend } from '@/lib/email/resend'
import { appOrigin, resendOutboundReady, recoveryCodeTtlSeconds } from '@/lib/server/env'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function issueRecoveryCode(userId: string): Promise<{ code: string; url: string }> {
  const code = crypto.randomBytes(24).toString('base64url')
  await dbQuery(
    `insert into password_recovery_tokens (id, user_id, code_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
    [crypto.randomUUID(), userId, hashCode(code), recoveryCodeTtlSeconds()],
  )
  return { code, url: `${appOrigin()}/reset-password?code=${encodeURIComponent(code)}` }
}

export async function consumeRecoveryCode(code: string): Promise<string | null> {
  const result = await dbQuery<{ user_id: string }>(
    `update password_recovery_tokens
        set consumed_at = now()
      where code_hash = $1
        and consumed_at is null
        and expires_at > now()
      returning user_id`,
    [hashCode(code)],
  )
  return result.rows[0] ? String(result.rows[0].user_id) : null
}

export type RecoveryDeliveryMode = 'sent' | 'dev_log'

/** Resend when configured; otherwise append-only dev log (no console echo). */
export async function sendRecoveryEmail(email: string, url: string): Promise<RecoveryDeliveryMode> {
  if (resendOutboundReady()) {
    await sendPasswordResetEmailViaResend(email, url)
    return 'sent'
  }

  await appendAuthDeliveryLog({
    kind: 'password_reset',
    detail: { email, resetUrl: url },
  })
  return 'dev_log'
}
