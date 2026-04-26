function cleanEnv(value: string | undefined | null): string {
  const raw = String(value ?? '').replace(/^\uFEFF/, '').trim()
  if (!raw) return ''
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim()
  }
  return raw
}

export function env(name: string, fallback = ''): string {
  const value = cleanEnv(process.env[name])
  return value || fallback
}

export function envInt(name: string, fallback: number): number {
  const raw = env(name)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function envBool(name: string, fallback = false): boolean {
  const raw = env(name)
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

export function mustEnv(name: string): string {
  const value = env(name)
  if (!value) throw new Error(`Missing env: ${name}`)
  return value
}

export function appOrigin(): string {
  return env('APP_PUBLIC_ORIGIN', 'http://localhost:3001').replace(/\/$/, '')
}

export function uploadRoot(): string {
  return env('UPLOAD_ROOT', './var/uploads')
}

export function jwtSecret(): string {
  return mustEnv('JWT_SECRET')
}

export function storageSigningSecret(): string {
  return mustEnv('STORAGE_SIGNING_SECRET')
}

export function accessTokenTtlSeconds(): number {
  return Math.max(60, envInt('JWT_ACCESS_TTL_SECONDS', 15 * 60))
}

export function refreshTokenTtlSeconds(): number {
  return Math.max(60 * 60, envInt('REFRESH_TOKEN_TTL_SECONDS', 30 * 24 * 60 * 60))
}

export function recoveryCodeTtlSeconds(): number {
  const minutes = envInt('PASSWORD_RESET_TTL_MINUTES', 0)
  if (minutes > 0) {
    return Math.max(300, minutes * 60)
  }
  return Math.max(300, envInt('PASSWORD_RECOVERY_TTL_SECONDS', 60 * 60))
}

export function otpCodeTtlSeconds(): number {
  return Math.max(60, envInt('SMS_OTP_TTL_SECONDS', 10 * 60))
}

/** Intention to send real SMS (provider must also be configured). Default: off. */
export function smsSendEnabled(): boolean {
  return envBool('SMS_SEND_ENABLED', false)
}

/** Intention to send real email (Resend or SMTP). Default: off. */
export function emailSendEnabled(): boolean {
  return envBool('EMAIL_SEND_ENABLED', false)
}

export function resendApiKey(): string {
  return env('RESEND_API_KEY', '')
}

/** From address for Resend (and transactional email). */
export function mailFrom(): string {
  return env('MAIL_FROM', '')
}

/** Resend is ready when outbound email is enabled and API + from are set. */
export function resendOutboundReady(): boolean {
  return emailSendEnabled() && Boolean(resendApiKey()) && Boolean(mailFrom())
}

export function smtpHost(): string {
  return env('SMTP_HOST', '')
}

export function smtpPort(): number {
  return envInt('SMTP_PORT', 587)
}

export function smsProviderName(): string {
  return env('SMS_PROVIDER', '').toLowerCase()
}

/** Twilio Account SID — TWILIO_ACCOUNT_SID or legacy SMS_TWILIO_ACCOUNT_SID */
export function twilioAccountSid(): string {
  return env('TWILIO_ACCOUNT_SID', '') || env('SMS_TWILIO_ACCOUNT_SID', '')
}

/** Twilio Auth Token — TWILIO_AUTH_TOKEN or legacy SMS_TWILIO_AUTH_TOKEN */
export function twilioAuthToken(): string {
  return env('TWILIO_AUTH_TOKEN', '') || env('SMS_TWILIO_AUTH_TOKEN', '')
}

/** Twilio sender number — TWILIO_FROM_NUMBER or legacy SMS_TWILIO_FROM */
export function twilioFromNumber(): string {
  return env('TWILIO_FROM_NUMBER', '') || env('SMS_TWILIO_FROM', '')
}

/** SMTP path — only when host is set (delivery still requires a working sender; see recovery-store). */
export function smtpOutboundReady(): boolean {
  return emailSendEnabled() && Boolean(smtpHost())
}

/** True when Resend can send (primary self-host path). */
export function emailOutboundReady(): boolean {
  return resendOutboundReady()
}

/** Outbound SMS via Twilio when enabled and credentials present (canonical + legacy env names). */
export function smsOutboundReady(): boolean {
  if (!smsSendEnabled()) return false
  return Boolean(twilioAccountSid() && twilioAuthToken() && twilioFromNumber())
}

/** Safe diagnostics for UI / health: which canonical keys are missing (no secret values). */
export function smsOutboundMissingKeys(): string[] {
  const missing: string[] = []
  if (!smsSendEnabled()) missing.push('SMS_SEND_ENABLED')
  if (!twilioAccountSid()) missing.push('TWILIO_ACCOUNT_SID')
  if (!twilioAuthToken()) missing.push('TWILIO_AUTH_TOKEN')
  if (!twilioFromNumber()) missing.push('TWILIO_FROM_NUMBER')
  return missing
}

/** When true, GET /api/geocode works without admin Bearer (rate-limited). Use for local self-host / smoke tests. */
export function geocodePublicEnabled(): boolean {
  return envBool('GEOCODE_PUBLIC', false)
}

/** Feature gate for SMS worker invites from admin panel. Default: off. */
export function workerInviteSmsEnabled(): boolean {
  return env('WORKER_INVITE_SMS_ENABLED', '') === '1'
}
