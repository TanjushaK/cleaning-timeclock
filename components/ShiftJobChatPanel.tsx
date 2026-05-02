'use client'

import { useCallback, useEffect, useState } from 'react'

import { clearClientAuthState, getAccessToken } from '@/lib/auth-fetch'

function getAccessTokenOrNull(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return getAccessToken()
  } catch {
    return null
  }
}

async function authFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getAccessTokenOrNull()
  if (!token) throw new Error('admin.main.errNoToken')

  const ctrl = new AbortController()
  const ms = 15000
  const t = setTimeout(() => ctrl.abort(), ms)

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
      signal: ctrl.signal,
    })

    const payload = await res.json().catch(() => ({} as Record<string, unknown>))

    if (res.status === 401) {
      clearClientAuthState()
      throw new Error('admin.main.errSessionExpired')
    }
    if (!res.ok) {
      const code = payload?.errorCode
      if (code) throw new Error(`admin.api.${code}`)
      throw new Error(String(payload?.error || `HTTP ${res.status}`))
    }
    return payload as T
  } catch (e: unknown) {
    if ((e as { name?: string }).name === 'AbortError') {
      throw new Error('admin.main.errRequestTimeout')
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

type ChatAttachment = {
  id: string
  kind: string
  mime_type: string
  file_name: string | null
  file_size_bytes: number
  url: string
}

type ChatMessage = {
  id: string
  author_id: string
  author_role: string
  author_name: string
  body: string | null
  created_at: string
  attachments: ChatAttachment[]
}

const MAX_IMAGES = 5
const MAX_VIDEO_MB = 200
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024
const MAX_IMAGE_BYTES = 25 * 1024 * 1024

const ALLOWED_IMG = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const ALLOWED_VID = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

export function ShiftJobChatPanel(props: {
  jobId: string | null
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const { jobId, t } = props
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [pickFiles, setPickFiles] = useState<File[]>([])
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!jobId) return
    const baseUrl = `/api/admin/jobs/${encodeURIComponent(jobId)}`
    setLoading(true)
    setErr(null)
    try {
      const res = await authFetchJson<{ messages: ChatMessage[] }>(`${baseUrl}/messages`)
      setMessages(Array.isArray(res?.messages) ? res.messages : [])
    } catch (e: unknown) {
      setErr(String((e as Error)?.message || t('admin.main.shiftNotesErrLoad')))
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [jobId, t])

  useEffect(() => {
    void load()
  }, [load])

  async function send() {
    if (!jobId || busy) return
    const text = draft.trim()
    const files = pickFiles
    if (!text && files.length === 0) return

    const baseUrl = `/api/admin/jobs/${encodeURIComponent(jobId)}`
    setBusy(true)
    setErr(null)
    try {
      const msgRes = await authFetchJson<{ message: ChatMessage }>(`${baseUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.length ? text : null }),
      })
      const messageId = msgRes?.message?.id
      if (!messageId) throw new Error(t('admin.main.shiftNotesErrSend'))

      let imgUsed = 0
      let vidUsed = 0
      for (const file of files) {
        const mime = String(file.type || '').toLowerCase()
        const isImg = ALLOWED_IMG.has(mime)
        const isVid = ALLOWED_VID.has(mime)
        if (!isImg && !isVid) throw new Error(t('admin.main.shiftNotesErrMime'))
        if (isImg) {
          if (file.size > MAX_IMAGE_BYTES) throw new Error(t('admin.main.shiftNotesErrImgSize'))
          if (imgUsed >= MAX_IMAGES) throw new Error(t('admin.main.shiftNotesErrImgLimit'))
          imgUsed += 1
        } else {
          if (file.size > MAX_VIDEO_BYTES) throw new Error(t('admin.main.shiftNotesErrVidSize'))
          if (vidUsed >= 1) throw new Error(t('admin.main.shiftNotesErrVidLimit'))
          vidUsed += 1
        }

        const fd = new FormData()
        fd.append('file', file)
        await authFetchJson(`${baseUrl}/messages/${encodeURIComponent(messageId)}/attachments`, {
          method: 'POST',
          body: fd,
        })
      }

      setDraft('')
      setPickFiles([])
      await load()
    } catch (e: unknown) {
      setErr(String((e as Error)?.message || t('admin.main.shiftNotesErrSend')))
    } finally {
      setBusy(false)
    }
  }

  function onPickFiles(next: FileList | null) {
    if (!next?.length) return
    setPickFiles(Array.from(next))
  }

  if (!jobId) return null

  return (
    <div className="grid gap-2 rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-yellow-100/90">{t('admin.main.shiftNotesTitle')}</span>
        <button
          type="button"
          className="rounded-lg border border-yellow-400/25 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-yellow-300/45 disabled:opacity-50"
          onClick={() => void load()}
          disabled={loading || busy}
        >
          {t('admin.main.shiftNotesRefresh')}
        </button>
      </div>

      <p className="text-[10px] leading-snug text-zinc-500">{t('admin.main.shiftNotesAttachHint')}</p>

      {err ? <div className="rounded-lg border border-rose-500/40 bg-rose-900/20 px-2 py-1 text-[11px] text-rose-100">{err}</div> : null}

      <div className="max-h-56 overflow-y-auto rounded-xl border border-yellow-400/10 bg-black/40 px-2 py-2">
        {loading && messages.length === 0 ? (
          <div className="text-[11px] text-zinc-500">{t('admin.main.shiftNotesLoading')}</div>
        ) : messages.length === 0 ? (
          <div className="text-[11px] text-zinc-500">{t('admin.main.shiftNotesEmpty')}</div>
        ) : (
          <ul className="grid gap-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg border border-yellow-400/10 bg-black/35 px-2 py-1.5 text-[11px]">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <span className="font-semibold text-yellow-100/90">{m.author_name}</span>
                  <span className="text-zinc-500">{new Date(m.created_at).toLocaleString()}</span>
                </div>
                {m.body ? <p className="mt-1 whitespace-pre-wrap text-zinc-200">{m.body}</p> : null}
                {m.attachments?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) =>
                      a.kind === 'image' && a.url ? (
                        <img key={a.id} src={a.url} alt="" className="max-h-24 max-w-[140px] rounded-md border border-yellow-400/15 object-cover" />
                      ) : a.kind === 'video' && a.url ? (
                        <video key={a.id} src={a.url} controls className="max-h-36 max-w-[220px] rounded-md border border-yellow-400/15" />
                      ) : (
                        <a
                          key={a.id}
                          href={a.url || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-yellow-200 underline"
                        >
                          {a.file_name || a.mime_type}
                        </a>
                      )
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('admin.main.shiftNotesPlaceholder')}
        rows={2}
        disabled={busy}
        className="w-full resize-y rounded-xl border border-yellow-400/20 bg-black/45 px-3 py-2 text-xs text-zinc-100 outline-none transition focus:border-yellow-300/55 disabled:opacity-60"
      />

      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
        className="block w-full text-[11px] text-zinc-400 file:mr-2 file:rounded-lg file:border file:border-yellow-400/25 file:bg-black/40 file:px-2 file:py-1 file:text-[11px]"
        disabled={busy}
        onChange={(e) => {
          onPickFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {pickFiles.length > 0 ? (
        <div className="text-[10px] text-zinc-500">
          {pickFiles.map((f) => f.name).join(', ')}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void send()}
        disabled={busy || (!draft.trim() && pickFiles.length === 0)}
        className="rounded-2xl border border-yellow-300/35 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/55 disabled:opacity-50"
      >
        {busy ? t('admin.main.shiftNotesSending') : t('admin.main.shiftNotesSend')}
      </button>
    </div>
  )
}
