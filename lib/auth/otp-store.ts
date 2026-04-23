import crypto from 'crypto'
import { dbQuery } from '@/lib/server/pool'
import { appendAuthDeliveryLog } from '@/lib/server/auth-delivery-log'
import { sendTwilioSms } from '@/lib/sms/twilio'
import { canonicalPhoneDigits } from '@/lib/auth/phone-canonical'
import { otpCodeTtlSeconds, smsOutboundReady } from '@/lib/server/env'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** E.164-like string for SMS gateways (digits only → leading +). */
function toSmsAddress(input: string): string {
  const d = canonicalPhoneDigits(input)
  return d ? `+${d}` : input.trim()
}

export async function issueSmsOtp(phone: string): Promise<{ code: string }> {
  const key = canonicalPhoneDigits(phone)
  if (!key) throw new Error('invalid phone')
  const code = generateCode()
  await dbQuery(
    `insert into sms_otp_codes (id, phone, code_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
    [crypto.randomUUID(), key, hashCode(code), otpCodeTtlSeconds()],
  )
  return { code }
}

export async function consumeSmsOtp(phone: string, code: string): Promise<boolean> {
  const key = canonicalPhoneDigits(phone)
  if (!key) return false
  const result = await dbQuery(
    `update sms_otp_codes
        set consumed_at = now()
      where phone = $1
        and code_hash = $2
        and consumed_at is null
        and expires_at > now()`,
    [key, hashCode(code)],
  )
  return (result.rowCount ?? 0) > 0
}

export type SmsDeliveryMode = 'sent' | 'dev_log'

export type SmsCodeKind = 'login' | 'password_reset'

/** Real Twilio when configured; otherwise append-only log (no console echo). */
export async function sendSmsCode(
  phone: string,
  code: string,
  kind: SmsCodeKind = 'login',
): Promise<SmsDeliveryMode> {
  const body =
    kind === 'password_reset'
      ? `Password reset code: ${code}. It expires in a few minutes.`
      : `Your verification code: ${code}. It expires in a few minutes.`

  const twilioTo = toSmsAddress(phone)

  if (smsOutboundReady()) {
    await sendTwilioSms(twilioTo, body)
    return 'sent'
  }

  await appendAuthDeliveryLog({
    kind: 'sms_otp',
    detail: {
      phoneKey: canonicalPhoneDigits(phone),
      kind,
      code,
    },
  })
  return 'dev_log'
}
