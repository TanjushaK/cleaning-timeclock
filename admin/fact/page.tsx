'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch'

type ScheduleItem = {
  id: string
  status: string
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time?: string | null
  site_id: string | null
  site_name: string | null
  worker_id: string | null
  worker_name: string | null
  started_at: string | null
  stopped_at: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  return `${y}-${m}-${dd}`
}

function fmtD(iso?: string | null) {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

function timeHHMM(t?: string | null) {
  if (!t) return null
  const x = String(t)
  return x.length >= 5 ? x.slice(0, 5) : x
}

function minutesFromHHMM(t: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(t)
  if (!m) return null
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

function fmtDur(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h <= 0) return `${r}м`
  return `${h}ч ${pad2(r)}м`
}

function fmtHM(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  return `${h}:${pad2(r)}`
}

function plannedMinutes(from?: string | null, to?: string | null) {
  const f = timeHHMM(from)
  const t = timeHHMM(to)
  if (!f || !t) return null
  const a = minutesFromHHMM(f)
  const b = minutesFromHHMM(t)
  if (a == null || b == null) return null
  let d = b - a
  if (d < 0) d += 24 * 60
  return d
}

function actualMinutes(startISO?: string | null, stopISO?: string | null) {
  if (!startISO || !stopISO) return null
  const a = new Date(startISO).getTime()
  const b = new Date(stopISO).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const diff = Math.max(0, b - a)
  return Math.round(diff / 60000)
}

function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim())
  if (!m) return null
  const hh = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

export default function AdminFactPage() {
  const [booting, setBooting] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toISODate(d)
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return toISODate(d)
  })

  const [items, setItems] = useState<ScheduleItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [editHM, setEditHM] = useState<Record<string, string>>({})

  const authed = !!token

  const refresh = useCallback(async () => {
    setError(null)
    setNotice(null)
    const url = `/api/admin/schedule?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
    const res = await authFetchJson<{ items: ScheduleItem[] }>(url, { cache: 'no-store' })
    const list = Array.isArray(res?.items) ? res.items : []
    setItems(list)
    const next: Record<string, string> = {}
    for (const j of list) {
      const am = actualMinutes(j.started_at, j.stopped_at)
      if (am != null) next[j.id] = fmtHM(am)
    }
    setEditHM((prev) => ({ ...next, ...prev }))
  }, [dateFrom, dateTo])

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

  const doLogout = useCallback(() => {
    clearAuthTokens()
    setToken(null)
    setItems([])
    setNotice('Вы вышли.')
  }, [])

  const doneItems = useMemo(() => {
    return items
      .filter((x) => String(x.status || '') === 'done')
      .sort((a, b) => {
        const da = String(a.job_date || '')
        const db = String(b.job_date || '')
        if (da !== db) return da < db ? 1 : -1
        const ta = String(a.scheduled_time || '')
        const tb = String(b.scheduled_time || '')
        if (ta !== tb) return ta < tb ? 1 : -1
        return String(a.id).localeCompare(String(b.id))
      })
  }, [items])

  const saveFact = useCallback(
    async (jobId: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const hm = String(editHM[jobId] || '').trim()
        const mins = parseHM(hm)
        if (mins == null) throw new Error('Факт должен быть в формате H:MM (например 3:15)')
        await authFetchJson('/api/admin/jobs/set-actual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: jobId, hm }),
        })
        setNotice('Факт обновлён.')
        await refresh()
      } catch (e: any) {
        setError(String(e?.message || e || 'Ошибка сохранения'))
      } finally {
        setBusy(false)
      }
    },
    [editHM, refresh]
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
          <div className="text-xl font-semibold">Tanija • Admin • Факт</div>
          <div className="text-sm opacity-80 mt-1">Вход по email/паролю</div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {notice}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <input
              id="email"
              name="email"
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              id="password"
              name="password"
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
              onClick={doLogin}
              disabled={busy || !email.trim() || !password.trim()}
            >
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
            <div className="text-2xl font-semibold">Tanija • Admin • Факт</div>
            <div className="text-sm opacity-80 mt-1">Редактирование фактически отработанного времени</div>
          </div>

          <div className="flex gap-2">
            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
              Админка
            </a>
            <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout}>
              Выйти
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs opacity-80">Дата с</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs opacity-80">Дата по</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
            />
          </label>

          <button
            onClick={async () => {
              setBusy(true)
              setError(null)
              setNotice(null)
              try {
                await refresh()
                setNotice('Обновлено.')
              } catch (e: any) {
                setError(String(e?.message || e || 'Ошибка обновления'))
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
            className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
          >
            {busy ? 'Обновляю…' : 'Обновить'}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 overflow-hidden">
          <div className="grid grid-cols-12 gap-0 border-b border-amber-500/10 bg-black/20 px-4 py-3 text-xs text-zinc-200">
            <div className="col-span-2">Дата</div>
            <div className="col-span-3">Объект</div>
            <div className="col-span-2">Работник</div>
            <div className="col-span-2">План</div>
            <div className="col-span-1">Факт</div>
            <div className="col-span-2">Правка</div>
          </div>

          {doneItems.length === 0 ? (
            <div className="px-4 py-6 text-sm opacity-70">Нет завершённых смен в выбранном диапазоне.</div>
          ) : (
            doneItems.map((j) => {
              const from = timeHHMM(j.scheduled_time)
              const to = timeHHMM(j.scheduled_end_time ?? null)
              const planM = plannedMinutes(from, to)
              const factM = actualMinutes(j.started_at, j.stopped_at)
              const factStr = factM != null ? fmtDur(factM) : '—'
              const planStr = from && to ? `${from}–${to}${planM != null ? ` • ${fmtDur(planM)}` : ''}` : from || '—'

              return (
                <div key={j.id} className="grid grid-cols-12 items-center gap-0 border-t border-amber-500/10 px-4 py-3 text-sm">
                  <div className="col-span-2 opacity-90">{fmtD(j.job_date)}</div>
                  <div className="col-span-3 font-semibold">{j.site_name || '—'}</div>
                  <div className="col-span-2 opacity-90">{j.worker_name || '—'}</div>
                  <div className="col-span-2 text-xs opacity-80">{planStr}</div>
                  <div className="col-span-1 text-xs opacity-80">{factStr}</div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      value={editHM[j.id] ?? ''}
                      onChange={(e) => setEditHM((p) => ({ ...p, [j.id]: e.target.value }))}
                      placeholder="H:MM"
                      className="w-24 rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-xs outline-none focus:border-amber-400/50"
                    />
                    <button
                      onClick={() => saveFact(j.id)}
                      disabled={busy}
                      className="rounded-xl border border-amber-500/30 px-3 py-2 text-xs hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="mt-4 text-xs opacity-70">
          Формат правки: <span className="font-semibold">H:MM</span> (например <span className="font-semibold">3:15</span>). Меняет <span className="font-semibold">stopped_at</span> первого time_log (started_at + длительность).
        </div>
      </div>
    </div>
  )
}
