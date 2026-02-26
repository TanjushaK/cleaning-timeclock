'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch'

type WorkerRow = {
  id: string
  full_name: string | null
  role: string | null
  active: boolean | null
}

type ReportDay = {
  date: string
  minutes: number
  jobs_count: number
  logged_jobs: number
}

type ReportJob = {
  job_id: string
  job_date: string
  site_id: string
  site_name: string | null
  minutes: number
}

type ReportResp = {
  from: string
  to: string
  total_minutes: number
  by_day?: ReportDay[]
  by_job?: ReportJob[]
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

function fmtMinutesHM(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  return `${h}:${pad2(r)}`
}

function weekRangeToday() {
  const d = new Date()
  const day = d.getDay() // 0 Sun
  const diffToMon = (day + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { from: toISODate(mon), to: toISODate(sun) }
}

function monthRangeToday() {
  const d = new Date()
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: toISODate(from), to: toISODate(to) }
}

export default function AdminHoursPage() {
  const [booting, setBooting] = useState(true)
  const [token, setToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const initialWeek = useMemo(() => weekRangeToday(), [])
  const [dateFrom, setDateFrom] = useState(initialWeek.from)
  const [dateTo, setDateTo] = useState(initialWeek.to)

  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [workerId, setWorkerId] = useState('')

  const [data, setData] = useState<ReportResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const authed = !!token

  const loadWorkers = useCallback(async () => {
    const res = await authFetchJson<{ workers: WorkerRow[] }>('/api/admin/workers/list', { cache: 'no-store' })
    const list = Array.isArray(res?.workers) ? res.workers : []
    const filtered = list
      .filter((w) => String(w.role || '') === 'worker')
      .filter((w) => w.active !== false)
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
    setWorkers(filtered)
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      if (!workerId) throw new Error('Выбери работника')
      const url = `/api/admin/reports?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}&worker_id=${encodeURIComponent(
        workerId
      )}&by_day=1`
      const res = await authFetchJson<ReportResp>(url, { cache: 'no-store' })
      setData(res)
    } catch (e: any) {
      setData(null)
      setError(String(e?.message || e || 'Ошибка'))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, workerId])

  useEffect(() => {
    ;(async () => {
      try {
        const t = getAccessToken()
        setToken(t)
        if (t) {
          await loadWorkers()
        }
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
  }, [loadWorkers])

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
      await loadWorkers()
      setNotice('Вход выполнен.')
    } catch (e: any) {
      setError(String(e?.message || e || 'Ошибка входа'))
    } finally {
      setBusy(false)
      setBooting(false)
    }
  }, [email, password, loadWorkers])

  const doLogout = useCallback(() => {
    clearAuthTokens()
    setToken(null)
    setWorkers([])
    setWorkerId('')
    setData(null)
    setNotice('Вы вышли.')
  }, [])

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
          <div className="text-xl font-semibold">Tanija • Admin • Часы</div>
          <div className="text-sm opacity-80 mt-1">Вход по email/паролю</div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
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

  const workerName = workers.find((w) => w.id === workerId)?.full_name || '—'
  const total = data?.total_minutes ?? 0
  const days = Array.isArray(data?.by_day) ? (data?.by_day as ReportDay[]) : []
  const jobs = Array.isArray(data?.by_job) ? (data?.by_job as ReportJob[]) : []

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Tanija • Admin • Часы</div>
            <div className="text-sm opacity-80 mt-1">Сколько часов отработал работник за период</div>
          </div>

          <div className="flex gap-2">
            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
              Админка
            </a>
            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin/fact">
              Факт
            </a>
            <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout}>
              Выйти
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs opacity-80">Работник</span>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="min-w-[260px] rounded-xl border border-amber-500/20 bg-zinc-900/40 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
            >
              <option value="">— выбери —</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || w.id}
                </option>
              ))}
            </select>
          </label>

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
            onClick={() => {
              const d = new Date()
              const iso = toISODate(d)
              setDateFrom(iso)
              setDateTo(iso)
            }}
            className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
          >
            День
          </button>

          <button
            onClick={() => {
              const w = weekRangeToday()
              setDateFrom(w.from)
              setDateTo(w.to)
            }}
            className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
          >
            Неделя
          </button>

          <button
            onClick={() => {
              const m = monthRangeToday()
              setDateFrom(m.from)
              setDateTo(m.to)
            }}
            className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
          >
            Месяц
          </button>

          <button
            onClick={async () => {
              setBusy(true)
              try {
                await load()
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy || loading}
            className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
          >
            {loading ? 'Считаю…' : 'Показать'}
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4">
            <div className="text-xs opacity-80">Работник</div>
            <div className="mt-1 text-sm font-semibold">{workerName}</div>
            <div className="mt-3 text-xs opacity-80">Период</div>
            <div className="mt-1 text-sm">{fmtD(dateFrom)} — {fmtD(dateTo)}</div>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4 md:col-span-2">
            <div className="text-xs opacity-80">Итого</div>
            <div className="mt-1 text-3xl font-semibold">{fmtMinutesHM(total)}</div>
            <div className="mt-1 text-xs opacity-70">часы:минуты</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 overflow-hidden">
          <div className="grid grid-cols-12 gap-0 border-b border-amber-500/10 bg-black/20 px-4 py-3 text-xs text-zinc-200">
            <div className="col-span-3">Дата</div>
            <div className="col-span-4">Смен</div>
            <div className="col-span-5">Часы</div>
          </div>
          {days.length === 0 ? (
            <div className="px-4 py-6 text-sm opacity-70">Нет данных за период (или не нажал «Показать»).</div>
          ) : (
            days.map((d) => (
              <div key={d.date} className="grid grid-cols-12 items-center gap-0 border-t border-amber-500/10 px-4 py-3 text-sm">
                <div className="col-span-3 opacity-90">{fmtD(d.date)}</div>
                <div className="col-span-4 text-xs opacity-80">{d.logged_jobs}/{d.jobs_count} с логами</div>
                <div className="col-span-5 font-semibold">{fmtMinutesHM(d.minutes)}</div>
              </div>
            ))
          )}
        </div>

        {jobs.length ? (
          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 overflow-hidden">
            <div className="grid grid-cols-12 gap-0 border-b border-amber-500/10 bg-black/20 px-4 py-3 text-xs text-zinc-200">
              <div className="col-span-3">Дата</div>
              <div className="col-span-7">Объект</div>
              <div className="col-span-2">Часы</div>
            </div>
            {jobs.map((j) => (
              <div key={j.job_id} className="grid grid-cols-12 items-center gap-0 border-t border-amber-500/10 px-4 py-3 text-sm">
                <div className="col-span-3 opacity-90">{fmtD(j.job_date)}</div>
                <div className="col-span-7 font-semibold">{j.site_name || '—'}</div>
                <div className="col-span-2 font-semibold">{fmtMinutesHM(j.minutes)}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
