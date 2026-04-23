import { twilioAccountSid, twilioAuthToken, twilioFromNumber } from '@/lib/server/env'

function maskE164(e164: string): string {
  const s = String(e164 || '').trim()
  if (s.length <= 5) return '***'
  return `${s.slice(0, 4)}…${s.slice(-3)}`
}

/** Send SMS via Twilio REST API (same account as TWILIO_* / legacy SMS_TWILIO_* env). */
export async function sendTwilioSms(toE164: string, text: string): Promise<void> {
  const sid = twilioAccountSid()
  const token = twilioAuthToken()
  const from = twilioFromNumber()
  if (!sid || !token || !from) {
    throw new Error('Twilio env incomplete')
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64')
  const body = new URLSearchParams({
    To: toE164,
    From: from,
    Body: text,
  })

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body: body.toString(),
  })

  const raw = await res.text().catch(() => '')
  if (!res.ok) {
    let twilioCode: string | number = 'unknown'
    let twilioMessage = raw.slice(0, 300)
    try {
      const j = JSON.parse(raw) as { code?: number; message?: string; more_info?: string; status?: number }
      if (j.code != null) twilioCode = j.code
      if (j.message) twilioMessage = String(j.message)
      if (j.more_info) twilioMessage = `${twilioMessage} (${String(j.more_info).slice(0, 120)})`
    } catch {
      // keep raw slice
    }
    console.error('[twilio-sms] send failed', {
      httpStatus: res.status,
      twilioCode,
      twilioMessage,
      toMasked: maskE164(toE164),
    })
    throw new Error(`Twilio error ${twilioCode}: ${twilioMessage}`)
  }

  let sidMsg: string | undefined
  try {
    const j = JSON.parse(raw) as { sid?: string; status?: string }
    sidMsg = j.sid ? `msg_sid=${String(j.sid).slice(0, 10)}…` : undefined
  } catch {
    /* ignore */
  }

  console.info('[twilio-sms] send ok', {
    httpStatus: res.status,
    toMasked: maskE164(toE164),
    ...(sidMsg ? { detail: sidMsg } : {}),
  })
}
