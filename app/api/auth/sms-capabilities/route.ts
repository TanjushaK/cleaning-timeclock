import { NextResponse } from 'next/server'
import { smsOutboundMissingKeys, smsOutboundReady } from '@/lib/server/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public capability flags for SMS (no secrets).
 * UI uses `outboundSms` to avoid implying dev-log fallback when Twilio is configured.
 */
export async function GET() {
  const outboundSms = smsOutboundReady()
  const missingKeys = smsOutboundMissingKeys()
  return NextResponse.json({
    outboundSms,
    ...(outboundSms ? {} : { missingKeys }),
  })
}
