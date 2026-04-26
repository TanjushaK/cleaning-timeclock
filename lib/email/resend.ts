import { env } from '@/lib/server/env'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendPasswordResetEmailViaResend(to: string, resetUrl: string): Promise<void> {
  const apiKey = env('RESEND_API_KEY', '')
  const from = env('MAIL_FROM', '')
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY or MAIL_FROM missing')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Password reset',
      html: `<p>Use this link to reset your password:</p><p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>`,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resend error HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
}

const WORKER_APP_URL = 'https://timeclock.tanjusha.nl'

export async function sendWorkerInviteEmailViaResend(
  to: string,
  login: string,
  tempPassword: string,
): Promise<void> {
  const apiKey = env('RESEND_API_KEY', '')
  const from = env('MAIL_FROM', '')
  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY or MAIL_FROM missing')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your time clock login',
      html: [
        '<p>Your account was created. Sign in with:</p>',
        `<p><b>Login:</b> ${escapeHtml(login)}</p>`,
        `<p><b>Temporary password:</b> ${escapeHtml(tempPassword)}</p>`,
        `<p><a href="${escapeHtml(WORKER_APP_URL)}">${escapeHtml(WORKER_APP_URL)}</a></p>`,
        '<p>Please change your password after first login.</p>',
      ].join(''),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resend error HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
}
