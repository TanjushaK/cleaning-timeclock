import fs from 'fs/promises'
import path from 'path'

function deliveryLogFile(): string {
  return path.join(process.cwd(), 'var', 'logs', 'auth-delivery.log')
}

export type AuthDeliveryKind = 'password_reset' | 'sms_otp'

/**
 * Self-host dev path: append structured lines when email/SMS providers are not configured.
 * Does not replace audit logs; safe for local testing only.
 */
export async function appendAuthDeliveryLog(entry: {
  kind: AuthDeliveryKind
  detail: Record<string, string>
}): Promise<void> {
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      ...entry,
    }) + '\n'
  const file = deliveryLogFile()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, line, 'utf8')
}
