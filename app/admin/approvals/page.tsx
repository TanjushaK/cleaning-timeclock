'use client'

import { useCallback, useEffect, useState } from 'react'
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch'

type PendingWorker = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  email_confirmed_at: string | null
  onboarding_submitted_at: string | null
  avatar_url: string | null
  can_activate: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtDT(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export default function AdminApprovalsPage() {
  const [booting, setBooting] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [items, setItems] = useState<PendingWorker[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const authed = !!token

  const refresh = useCallback(async () => {
    setError(null)
    setNotice(null)
    const r = await authFetchJson<{ pending: PendingWorker[] }>('/api/admin/workers/pending', { cache: 'no-store' })
    setItems(Array.isArray(r?.pending) ? r.pending : [])
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const t = getAccessToken()
        setToken(t)
        if (t) await refresh()
      } catch (e: any) {
        const msg = String(e?.message || e || 'Ошибка')
        if (msg.includes('401') || /токен|unauthorized/i.test(msg)) {
          clearAuthTokens()
          setToken(null)
        } else {
          setError(msg)
        }
      } finally {
        setBooting(false)
      }
    })()
  }, [refresh])

  const doLogin = useCallback(async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`)
      setAuthTokens(payload.access_token, payload.refresh_token || null)
      const t = getAccessToken()
      setToken(t)
      await refresh()
      setNotice('Вход выполнен.')
    } catch (e: any) {
      setError(String(e?.message || e || 'Ошибка входа'))
    } finally {
      setBusy(false)
      setBooting(false)
    }
  }, [email, password, refresh])

  const activate = useCallback(
    async (id: string, force: boolean) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        await authFetchJson('/api/admin/workers/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: id, force }),
        })
        setNotice('Активирован.')
        await refresh()
      } catch (e: any) {
        setError(String(e?.message || e || 'Ошибка активации'))
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  if (booting) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center">
        <div className="text-sm opacity-80">Загрузка…</div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
          <div className="text-xl font-semibold">Tanija • Admin • Активации</div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            <input className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" onClick={doLogin} disabled={busy || !email.trim() || !password.trim()}>
              {busy ? 'Вхожу…' : 'Войти'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Tanija • Admin • Активации</div>
            <div className="text-sm opacity-80 mt-1">Новые работники (inactive)</div>
          </div>

          <div className="flex gap-2">
            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
              Админка
            </a>
            <button
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                setNotice(null)
                try {
                  await refresh()
                  setNotice('Обновлено.')
                } catch (e: any) {
                  setError(String(e?.message || e || 'Ошибка'))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Обновляю…' : 'Обновить'}
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

        <div className="mt-6 space-y-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4 text-sm opacity-80">Новых заявок нет.</div>
          ) : (
            items.map((w) => (
              <div key={w.id} className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="h-14 w-14 rounded-xl overflow-hidden border border-amber-500/20 bg-black/30 flex items-center justify-center">
                      {w.avatar_url ? <img src={w.avatar_url} className="h-full w-full object-cover" /> : <div className="text-xs opacity-60">—</div>}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{w.full_name || '—'}</div>
                      <div className="text-xs opacity-80 mt-1">
                        {w.phone ? `📞 ${w.phone}` : ''} {w.email ? ` • ✉️ ${w.email}` : ''}{' '}
                        {w.email ? (w.email_confirmed_at ? ' • email OK' : ' • email НЕ подтверждён') : ''}
                      </div>
                      <div className="text-xs opacity-70 mt-1">Заявка: {fmtDT(w.onboarding_submitted_at)}</div>
                      <div className="text-[10px] opacity-50 mt-1">ID: {w.id}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-xs font-semibold hover:bg-amber-400 disabled:opacity-60"
                      disabled={busy || !w.can_activate}
                      onClick={() => activate(w.id, false)}
                    >
                      Активировать
                    </button>
                    <button
                      className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs hover:bg-amber-500/10 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => activate(w.id, true)}
                    >
                      Force
                    </button>
                  </div>
                </div>

                {!w.can_activate ? (
                  <div className="mt-3 text-xs opacity-70">
                    Нужно: имя + аватар + “Отправить на активацию” {w.email ? '+ подтверждённый email' : ''}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
