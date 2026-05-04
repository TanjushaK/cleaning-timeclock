'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { authFetch, authFetchJson } from '@/lib/auth-fetch'
import { FetchApiError } from '@/lib/fetch-api-error'

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

type WorkerAdminThread = {
  worker_id: string
  worker_name: string
  worker_email: string
  last_message: string
  last_message_at: string
  unread_count: number
}

type WorkerAdminAttachment = {
  id: string
  path: string
  url: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

type WorkerAdminMessage = {
  id: string
  worker_id: string
  author_role: string
  author_name: string | null
  body: string
  created_at: string
  attachments: WorkerAdminAttachment[]
}

const MAX_PHOTOS = 5
const DEFAULT_VISIBLE_MESSAGES = 20

const ALLOWED_CHAT_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function isAllowedChatImageFile(file: File): boolean {
  const type = String(file.type || '').toLowerCase()
  return ALLOWED_CHAT_IMAGE_TYPES.has(type)
}

function safeFileName(name: string | null | undefined): string {
  const value = String(name || '').replace(/[<>]/g, '').trim()
  return value || 'image'
}

const ADMIN_ATTACHMENT_PREFIX = '/api/admin/worker-chat/attachments/'

function safeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = String(raw).trim()
  if (!value) return null

  if (value.startsWith(ADMIN_ATTACHMENT_PREFIX)) return value
  if (value.startsWith('/api/storage/') || value.startsWith('/_next/image')) return value

  if (typeof window === 'undefined') return null

  try {
    const parsed = new URL(value, window.location.origin)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.origin !== window.location.origin) return null

    if (
      parsed.pathname.startsWith('/api/storage/') ||
      parsed.pathname.startsWith(ADMIN_ATTACHMENT_PREFIX)
    ) {
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}

/** Loads attachment bytes with Bearer auth (plain img/a cannot send Authorization). */
function WorkerChatAttachmentImage({ safeUrl }: { safeUrl: string }) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBlobSrc(null)
    setFailed(false)
    void (async () => {
      try {
        const res = await authFetch(safeUrl, { cache: 'no-store' })
        if (!res.ok) throw new Error('load failed')
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setBlobSrc(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      setBlobSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [safeUrl])

  if (failed) {
    return (
      <div className="flex h-20 w-[120px] items-center justify-center rounded-lg border border-dashed border-zinc-600/50 bg-black/40 text-[10px] text-zinc-500">
        Фото недоступно
      </div>
    )
  }
  if (!blobSrc) {
    return (
      <div className="flex h-20 w-[120px] items-center justify-center rounded-lg border border-yellow-400/10 bg-black/40 text-[10px] text-zinc-500">
        …
      </div>
    )
  }
  return (
    <img
      src={blobSrc}
      alt="Фото"
      className="max-h-28 max-w-[160px] rounded-lg border border-yellow-400/15 object-cover"
    />
  )
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtThreadTime(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function mapSendErr(e: unknown): string {
  if ((e as { name?: string })?.name === 'AbortError') return 'Не удалось отправить сообщение'
  const m = String((e as Error)?.message || '')
  if (m.startsWith('admin.api.')) return 'Не удалось отправить сообщение'
  return m.trim() || 'Не удалось отправить сообщение'
}

export function WorkerAdminChatPanel() {
  const [threads, setThreads] = useState<WorkerAdminThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [threadsErr, setThreadsErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WorkerAdminMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesErr, setMessagesErr] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [pickFiles, setPickFiles] = useState<File[]>([])
  const [sendBusy, setSendBusy] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null)
  const [attachDeleteErr, setAttachDeleteErr] = useState<string | null>(null)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [messageDeleteErr, setMessageDeleteErr] = useState<string | null>(null)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [cleanupNotice, setCleanupNotice] = useState<string | null>(null)
  const [showAllMessages, setShowAllMessages] = useState(false)

  const baseUrl = useMemo(() => '/api/admin/worker-chat', [])

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    setThreadsErr(null)
    try {
      const res = await authFetchJson<{ threads?: WorkerAdminThread[] }>(`${baseUrl}/threads`, {
        cache: 'no-store',
      })
      setThreads(Array.isArray(res?.threads) ? res.threads : [])
    } catch {
      setThreadsErr('Не удалось загрузить чат')
      setThreads([])
    } finally {
      setThreadsLoading(false)
    }
  }, [baseUrl])

  const loadMessages = useCallback(
    async (workerId: string) => {
      setMessagesLoading(true)
      setMessagesErr(null)
      try {
        const res = await authFetchJson<{ messages?: WorkerAdminMessage[] }>(
          `${baseUrl}/threads/${encodeURIComponent(workerId)}/messages`,
          { cache: 'no-store' },
        )
        setMessages(Array.isArray(res?.messages) ? res.messages : [])
        try {
          await authFetchJson(`${baseUrl}/threads/${encodeURIComponent(workerId)}/read`, {
            method: 'POST',
            cache: 'no-store',
          })
          await loadThreads()
        } catch {
          // messages still shown if mark-read fails
        }
      } catch {
        setMessagesErr('Не удалось загрузить чат')
        setMessages([])
      } finally {
        setMessagesLoading(false)
      }
    },
    [baseUrl, loadThreads],
  )

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    setShowAllMessages(false)
  }, [selectedId])

  useEffect(() => {
    setMessageDeleteErr(null)
    setCleanupNotice(null)
    setAttachDeleteErr(null)
    if (!selectedId) {
      setMessages([])
      return
    }
    void loadMessages(selectedId)
  }, [selectedId, loadMessages])

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return
    const incoming = Array.from(list).filter(isAllowedChatImageFile)
    const next = [...pickFiles, ...incoming]
    setPickFiles(next.slice(0, MAX_PHOTOS))
  }

  function removePhotoAt(i: number) {
    setPickFiles((prev) => prev.filter((_, j) => j !== i))
  }

  async function refresh() {
    await loadThreads()
    if (selectedId) await loadMessages(selectedId)
  }

  async function deleteMessage(messageId: string) {
    if (!selectedId) return
    if (typeof window !== 'undefined' && !window.confirm('Удалить сообщение из чата?')) return
    setDeletingMessageId(messageId)
    setMessageDeleteErr(null)
    try {
      const url = `${baseUrl}/threads/${encodeURIComponent(selectedId)}/messages/${encodeURIComponent(messageId)}`
      await authFetchJson<{ ok?: boolean }>(url, { method: 'DELETE', cache: 'no-store' })
      await loadThreads()
      await loadMessages(selectedId)
    } catch {
      setMessageDeleteErr('Не удалось удалить сообщение')
    } finally {
      setDeletingMessageId(null)
    }
  }

  async function cleanupOldMessages() {
    if (!selectedId) return
    if (typeof window !== 'undefined' && !window.confirm('Удалить сообщения старше 30 дней в этом чате?')) return
    setCleanupBusy(true)
    setCleanupNotice(null)
    setMessageDeleteErr(null)
    try {
      const url = `${baseUrl}/threads/${encodeURIComponent(selectedId)}/messages/old?days=30`
      const res = await authFetchJson<{ ok?: boolean; deleted_messages?: number }>(url, {
        method: 'DELETE',
        cache: 'no-store',
      })
      const n = typeof res?.deleted_messages === 'number' ? res.deleted_messages : 0
      setCleanupNotice(`Удалено сообщений: ${n}`)
      await loadThreads()
      await loadMessages(selectedId)
    } catch {
      setMessageDeleteErr('Не удалось очистить старые сообщения')
    } finally {
      setCleanupBusy(false)
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!selectedId) return
    if (typeof window !== 'undefined' && !window.confirm('Удалить фото из чата?')) return
    setDeletingAttachmentId(attachmentId)
    setAttachDeleteErr(null)
    try {
      await authFetchJson<{ ok?: boolean }>(
        `${ADMIN_ATTACHMENT_PREFIX}${encodeURIComponent(attachmentId)}`,
        { method: 'DELETE', cache: 'no-store' },
      )
      await loadThreads()
      await loadMessages(selectedId)
    } catch {
      setAttachDeleteErr('Не удалось удалить фото')
    } finally {
      setDeletingAttachmentId(null)
    }
  }

  async function send() {
    if (!selectedId || sendBusy) return
    const text = draft.trim()
    const files = pickFiles
    if (!text && files.length === 0) return

    setSendBusy(true)
    setSendErr(null)
    try {
      const url = `${baseUrl}/threads/${encodeURIComponent(selectedId)}/messages`

      if (files.length === 0) {
        await authFetchJson<{ message?: WorkerAdminMessage }>(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
          cache: 'no-store',
        })
      } else {
        const fd = new FormData()
        if (text) fd.append('body', text)
        for (const f of files) fd.append('photos', f)

        const res = await authFetch(url, { method: 'POST', body: fd, cache: 'no-store' })
        const ct = res.headers.get('content-type') || ''
        let payload: unknown = null
        if (ct.includes('application/json')) payload = await res.json().catch(() => null)
        else payload = await res.text().catch(() => null)

        if (!res.ok) {
          const obj =
            payload && typeof payload === 'object'
              ? (payload as { error?: string; message?: string })
              : null
          const fallback =
            (obj?.error || obj?.message) ||
            (typeof payload === 'string' && payload.trim()) ||
            `HTTP ${res.status}`
          throw new FetchApiError(String(fallback), { status: res.status })
        }
      }

      setDraft('')
      setPickFiles([])
      await loadThreads()
      await loadMessages(selectedId)
    } catch (e: unknown) {
      setSendErr(mapSendErr(e))
    } finally {
      setSendBusy(false)
    }
  }

  const selectedThread = threads.find((t) => t.worker_id === selectedId)
  const uiLocked = sendBusy || messagesLoading || threadsLoading || !!deletingMessageId || cleanupBusy

  const visibleMessages = useMemo(() => {
    if (showAllMessages) return messages
    return messages.slice(Math.max(0, messages.length - DEFAULT_VISIBLE_MESSAGES))
  }, [messages, showAllMessages])

  return (
    <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-yellow-100">Чаты сотрудников</div>
          <div className="mt-1 text-xs text-zinc-400">Можно прикрепить до 5 фото.</div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={uiLocked}
          className="rounded-2xl border border-yellow-400/25 bg-black/40 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-300/45 disabled:opacity-50"
        >
          Обновить
        </button>
      </div>

      {threadsErr ? (
        <div className="mt-4 rounded-2xl border border-rose-500/35 bg-rose-950/25 px-4 py-3 text-sm text-rose-100">
          {threadsErr}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(220px,280px)_1fr]">
        <aside className="flex max-h-[min(70vh,520px)] flex-col rounded-2xl border border-yellow-400/15 bg-black/30">
          <div className="border-b border-yellow-400/10 px-3 py-2 text-[11px] font-semibold text-zinc-400">
            Сотрудники
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {threadsLoading && threads.length === 0 ? (
              <div className="px-2 py-4 text-[11px] text-zinc-500">…</div>
            ) : threads.length === 0 ? (
              <div className="px-2 py-4 text-[11px] text-zinc-500">Нет сообщений</div>
            ) : (
              <ul className="grid gap-1.5">
                {threads.map((th) => (
                  <li key={th.worker_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(th.worker_id)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2 text-left text-[11px] transition',
                        selectedId === th.worker_id
                          ? 'border-yellow-300/50 bg-yellow-400/10 text-yellow-50'
                          : 'border-yellow-400/10 bg-black/25 text-zinc-200 hover:border-yellow-400/25',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold text-yellow-100/95">
                          {th.worker_name || th.worker_id.slice(0, 8)}
                        </span>
                        {th.unread_count > 0 ? (
                          <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">
                            {th.unread_count > 99 ? '99+' : th.unread_count}
                          </span>
                        ) : null}
                      </div>
                      {th.worker_email ? (
                        <div className="mt-0.5 truncate text-[10px] text-zinc-500">{th.worker_email}</div>
                      ) : null}
                      <div className="mt-1 line-clamp-2 text-[10px] text-zinc-400">{th.last_message || '—'}</div>
                      <div className="mt-1 text-[10px] text-zinc-600">{fmtThreadTime(th.last_message_at)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-[min(70vh,520px)] flex-col rounded-2xl border border-yellow-400/15 bg-black/30">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center px-4 text-sm text-zinc-500">
              Выберите сотрудника
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-yellow-400/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-yellow-100">
                    {selectedThread?.worker_name || selectedId.slice(0, 8)}
                  </div>
                  {selectedThread?.worker_email ? (
                    <div className="mt-0.5 text-[11px] text-zinc-500">{selectedThread.worker_email}</div>
                  ) : null}
                  {messages.length > DEFAULT_VISIBLE_MESSAGES && !showAllMessages ? (
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Показаны последние {DEFAULT_VISIBLE_MESSAGES} из {messages.length}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => void cleanupOldMessages()}
                    disabled={cleanupBusy || messagesLoading}
                    className="rounded-lg border border-zinc-600/40 bg-black/30 px-2 py-1 text-[10px] text-zinc-500 transition hover:border-zinc-500/50 hover:text-zinc-400 disabled:opacity-50"
                  >
                    {cleanupBusy ? '…' : 'Очистить старые'}
                  </button>
                  {messages.length > DEFAULT_VISIBLE_MESSAGES ? (
                    <button
                      type="button"
                      onClick={() => setShowAllMessages((v) => !v)}
                      className="shrink-0 rounded-xl border border-yellow-400/25 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-yellow-100 transition hover:border-yellow-300/45"
                    >
                      {showAllMessages
                        ? `Показать последние ${DEFAULT_VISIBLE_MESSAGES}`
                        : 'Показать все'}
                    </button>
                  ) : null}
                </div>
              </div>

              {messagesErr ? (
                <div className="mx-4 mt-3 rounded-xl border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-[11px] text-rose-100">
                  {messagesErr}
                </div>
              ) : null}

              {attachDeleteErr ? (
                <div className="mx-4 mt-3 rounded-xl border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-[11px] text-rose-100">
                  {attachDeleteErr}
                </div>
              ) : null}

              {messageDeleteErr ? (
                <div className="mx-4 mt-3 rounded-xl border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-[11px] text-rose-100">
                  {messageDeleteErr}
                </div>
              ) : null}

              {cleanupNotice ? (
                <div className="mx-4 mt-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-100/95">
                  {cleanupNotice}
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {messagesLoading && messages.length === 0 ? (
                  <div className="text-[11px] text-zinc-500">…</div>
                ) : messages.length === 0 ? (
                  <div className="text-[11px] text-zinc-500">Нет сообщений</div>
                ) : (
                  <ul className="grid gap-3">
                    {visibleMessages.map((m) => {
                      const isAdmin = String(m.author_role).toLowerCase() === 'admin'
                      return (
                        <li
                          key={m.id}
                          className={cn(
                            'flex',
                            isAdmin ? 'justify-end' : 'justify-start',
                          )}
                        >
                          <div
                            className={cn(
                              'relative max-w-[min(100%,420px)] rounded-2xl border px-3 py-2 text-[11px]',
                              isAdmin
                                ? 'border-yellow-400/25 bg-yellow-400/10 text-yellow-50'
                                : 'border-zinc-600/35 bg-zinc-900/50 text-zinc-100',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => void deleteMessage(m.id)}
                              disabled={deletingMessageId !== null}
                              className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-zinc-500/55 bg-zinc-950/90 px-1 text-[11px] leading-none text-zinc-300 shadow hover:bg-zinc-900 disabled:opacity-50"
                              aria-label="Удалить сообщение"
                              title="Удалить сообщение"
                            >
                              {deletingMessageId === m.id ? '…' : '×'}
                            </button>
                            <div className="flex flex-wrap items-baseline justify-between gap-2 pr-5">
                              <span className="font-semibold">{m.author_name || '—'}</span>
                              <span className="text-[10px] text-zinc-500">
                                {fmtThreadTime(m.created_at)}
                              </span>
                            </div>
                            {m.body ? (
                              <p className="mt-1.5 whitespace-pre-wrap text-zinc-200">{m.body}</p>
                            ) : null}
                            {m.attachments?.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {m.attachments.map((a) => {
                                  const safeUrl = safeImageUrl(a.url)
                                  return (
                                    <div key={a.id} className="relative inline-block">
                                      {safeUrl ? (
                                        <WorkerChatAttachmentImage safeUrl={safeUrl} />
                                      ) : (
                                        <div className="flex h-20 w-[120px] items-center justify-center rounded-lg border border-dashed border-zinc-600/50 bg-black/40 text-[10px] text-zinc-500">
                                          Фото недоступно
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => void deleteAttachment(a.id)}
                                        disabled={deletingAttachmentId === a.id}
                                        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-rose-400/50 bg-rose-950 text-[11px] leading-none text-rose-100 shadow hover:bg-rose-900 disabled:opacity-50"
                                        aria-label="Удалить"
                                        title="Удалить"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-yellow-400/10 p-3">
                {sendErr ? (
                  <div className="mb-2 rounded-lg border border-rose-500/35 bg-rose-950/25 px-2 py-1 text-[11px] text-rose-100">
                    {sendErr}
                  </div>
                ) : null}
                <label className="mb-1 block text-[11px] text-zinc-400">Написать сообщение</label>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  disabled={sendBusy}
                  placeholder="Написать сообщение"
                  className="mb-2 w-full resize-y rounded-xl border border-yellow-400/20 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-yellow-300/55 disabled:opacity-60"
                />

                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-xl border border-yellow-400/25 bg-black/40 px-3 py-1.5 text-[11px] font-semibold text-yellow-100 transition hover:border-yellow-300/45">
                    Прикрепить фото
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      multiple
                      disabled={sendBusy || pickFiles.length >= MAX_PHOTOS}
                      className="hidden"
                      onChange={(e) => {
                        onPickFiles(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <span className="text-[11px] text-zinc-500">
                    Выбрано: {pickFiles.length}/{MAX_PHOTOS}
                  </span>
                </div>

                {pickFiles.length > 0 ? (
                  <div className="mb-3 flex flex-col gap-2">
                    {pickFiles.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-yellow-400/15 bg-black/35 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1 truncate text-[11px] text-zinc-200">
                          Фото {i + 1}: {safeFileName(f.name)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePhotoAt(i)}
                          disabled={sendBusy}
                          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/50 bg-rose-950 text-sm leading-none text-rose-100 transition hover:bg-rose-900 disabled:opacity-50"
                          aria-label="Убрать"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sendBusy || (!draft.trim() && pickFiles.length === 0)}
                  className="rounded-2xl border border-yellow-300/35 bg-yellow-400/10 px-5 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/55 disabled:opacity-50"
                >
                  {sendBusy ? '…' : 'Отправить'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
