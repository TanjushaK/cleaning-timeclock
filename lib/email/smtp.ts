/**
 * Future: send transactional email via SMTP (nodemailer or similar).
 * Wire when EMAIL_SEND_ENABLED=1 and SMTP_* vars are set.
 */
export async function sendPasswordResetEmailViaSmtp(_email: string, _resetUrl: string): Promise<void> {
  throw new Error('SMTP delivery not implemented — set EMAIL_SEND_ENABLED=0 for dev log delivery')
}
