import { sendTwilioSms } from '@/lib/sms/twilio'

const WORKER_APP_URL = 'https://timeclock.tanjusha.nl'

export function buildWorkerInviteSms(login: string, tempPassword: string): string {
  return `Tanjia Timeclock: login ${login}, temporary password ${tempPassword}. Open ${WORKER_APP_URL}`
}

export async function sendWorkerInviteSms(toE164: string, login: string, tempPassword: string): Promise<void> {
  await sendTwilioSms(toE164, buildWorkerInviteSms(login, tempPassword))
}
