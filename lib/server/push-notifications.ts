import type { CompatClient } from '@/lib/server/compat/client'
import {
  getWorkerAdminUnreadCount,
  type WorkerAdminMessageRow,
} from '@/lib/server/worker-admin-chat'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_CHUNK_SIZE = 100
const PREVIEW_MAX_LEN = 120

function truncatePreview(text: string, maxLen: number): string {
  const t = text.trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`
}

function buildAdminChatPushBody(message: WorkerAdminMessageRow): string {
  const body = String(message.body || '').trim()
  if (body) return truncatePreview(body, PREVIEW_MAX_LEN)
  if (message.attachments?.length) return 'Новое фото в чате'
  return 'Новое сообщение'
}

type ExpoTicket = {
  status?: string
  message?: string
  details?: { error?: string }
}

function ticketIsDeviceNotRegistered(t: ExpoTicket): boolean {
  const code = String(t.details?.error || '').trim()
  if (code === 'DeviceNotRegistered') return true
  const msg = String(t.message || '')
  return msg.includes('DeviceNotRegistered')
}

export async function notifyWorkerAdminChatMessageSent(
  db: CompatClient,
  workerId: string,
  message: WorkerAdminMessageRow,
): Promise<void> {
  try {
    await notifyWorkerAdminChatMessageSentInner(db, workerId, message)
  } catch {
    console.error('[push] admin chat notify failed')
  }
}

async function notifyWorkerAdminChatMessageSentInner(
  db: CompatClient,
  workerId: string,
  message: WorkerAdminMessageRow,
): Promise<void> {
  const previewBody = buildAdminChatPushBody(message)
  const unread_count = await getWorkerAdminUnreadCount(db, {
    workerId,
    userId: workerId,
    readerRole: 'worker',
  })

  const { data: rows, error } = await db
    .from('worker_push_tokens')
    .select('id,token')
    .eq('worker_id', workerId)
    .is('disabled_at', null)

  if (error || !rows?.length) return

  const registered = rows as Array<{ id: string; token: string }>
  const badge = Number.isFinite(unread_count) ? unread_count : 0

  for (let offset = 0; offset < registered.length; offset += EXPO_CHUNK_SIZE) {
    const chunk = registered.slice(offset, offset + EXPO_CHUNK_SIZE)
    const payload = chunk.map((row) => ({
      to: row.token,
      title: 'Tanjusha',
      body: previewBody,
      sound: 'default' as const,
      badge,
      data: { type: 'admin_chat' },
    }))

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.error('[push] Expo push HTTP error')
      continue
    }

    let json: unknown
    try {
      json = await res.json()
    } catch {
      continue
    }

    const tickets = (json as { data?: ExpoTicket[] })?.data
    if (!Array.isArray(tickets)) continue

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i] as ExpoTicket
      if (ticket?.status !== 'error' || !ticketIsDeviceNotRegistered(ticket)) continue
      const row = chunk[i]
      if (!row?.id) continue
      await db
        .from('worker_push_tokens')
        .update({ disabled_at: new Date().toISOString() })
        .eq('id', row.id)
    }
  }
}

