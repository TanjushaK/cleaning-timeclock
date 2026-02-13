// app/admin/page.tsx
'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TabKey = 'sites' | 'workers' | 'jobs'
type JobsView = 'board' | 'table'

type Site = {
  id: string
  name?: string | null
  lat?: number | null
  lng?: number | null
  radius?: number | null
  archived_at?: string | null
}

type Worker = {
  id: string
  full_name?: string | null
  role?: 'admin' | 'worker' | string | null
  active?: boolean | null
}

type Assignment = {
  site_id: string
  worker_id: string
}

type JobStatus = 'planned' | 'in_progress' | 'done'

type ScheduleItem = {
  id: string
  status: JobStatus
  job_date: string | null
  scheduled_time: string | null
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

function fmtDT(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtD(v?: string | null) {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay() // 0..6 (0 = Sunday)
  const diff = (day === 0 ? -6 : 1) - day // Monday start
  x.setDate(x.getDate() + diff)
  return new Date(x.getFullYear(), x.getMonth(), x.getDate())
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d)
  const e = new Date(s)
  e.setDate(e.getDate() + 6)
  return e
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

async function authFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Нет входа. Авторизуйся в админке.')

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })

  const payload = await res.json().catch(() => ({} as any))
  if (!res.ok) {
    const msg = payload?.error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return payload as T
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('sites')
  const [jobsView, setJobsView] = useState<JobsView>('board')

  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showArchivedSites, setShowArchivedSites] = useState(false)

  const [sites, setSites] = useState<Site[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [dateFrom, setDateFrom] = useState<string>(toISODate(startOfWeek(new Date())))
  const [dateTo, setDateTo] = useState<string>(toISODate(endOfWeek(new Date())))

  const [qaSite, setQaSite] = useState<string>('')
  const [qaWorker, setQaWorker] = useState<string>('')

  const [newSiteId, setNewSiteId] = useState<string>('')
  const [newWorkers, setNewWorkers] = useState<string[]>([])
  const [newDate, setNewDate] = useState<string>(toISODate(new Date()))
  const [newTime, setNewTime] = useState<string>('09:00')

  const workersById = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.id, w)
    return m
  }, [workers])

  const sitesById = useMemo(() => {
    const m = new Map<string, Site>()
    for (const s of sites) m.set(s.id, s)
    return m
  }, [sites])

  const siteWorkers = useMemo(() => {
    const m = new Map<string, Worker[]>()
    for (const a of assignments) {
      const w = workersById.get(a.worker_id)
      if (!w) continue
      const arr = m.get(a.site_id) || []
      arr.push(w)
      m.set(a.site_id, arr)
    }
    return m
  }, [assignments, workersById])

  const workerSites = useMemo(() => {
    const m = new Map<string, Site[]>()
    for (const a of assignments) {
      const s = sitesById.get(a.site_id)
      if (!s) continue
      const arr = m.get(a.worker_id) || []
      arr.push(s)
      m.set(a.worker_id, arr)
    }
    return m
  }, [assignments, sitesById])

  const activeSitesForAssign = useMemo(() => sites.filter((s) => !s.archived_at), [sites])

  const planned = useMemo(() => schedule.filter((x) => x.status === 'planned'), [schedule])
  const inProgress = useMemo(() => schedule.filter((x) => x.status === 'in_progress'), [schedule])
  const done = useMemo(() => schedule.filter((x) => x.status === 'done'), [schedule])

  async function refreshAll() {
    setBusy(true)
    setError(null)
    try {
      const sitesUrl = showArchivedSites ? '/api/admin/sites/list?include_archived=1' : '/api/admin/sites/list'
      const scheduleUrl = `/api/admin/schedule?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`
      const [s, w, a, sch] = await Promise.all([
        authFetchJson<{ sites: Site[] }>(sitesUrl),
        authFetchJson<{ workers: Worker[] }>('/api/admin/workers/list'),
        authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments'),
        authFetchJson<{ items: ScheduleItem[] }>(scheduleUrl),
      ])

      setSites(Array.isArray(s?.sites) ? s.sites : [])
      setWorkers(Array.isArray(w?.workers) ? w.workers : [])
      setAssignments(Array.isArray(a?.assignments) ? a.assignments : [])
      setSchedule(Array.isArray(sch?.items) ? sch.items : [])
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  async function boot() {
    setSessionLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token ?? null
      setSessionToken(token)
      if (token) await refreshAll()
    } finally {
      setSessionLoading(false)
    }
  }

  useEffect(() => {
    void boot()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const token = newSession?.access_token ?? null
      setSessionToken(token)
      setError(null)
      if (token) {
        await refreshAll()
      } else {
        setSites([])
        setWorkers([])
        setAssignments([])
        setSchedule([])
      }
    })

    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (sessionToken) void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedSites, dateFrom, dateTo])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message || 'Ошибка входа')
        return
      }
    } catch (e: any) {
      setError(e?.message || 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      await supabase.auth.signOut()
      setSessionToken(null)
      setSites([])
      setWorkers([])
      setAssignments([])
      setSchedule([])
    } finally {
      setBusy(false)
    }
  }

  async function quickAssign() {
    if (!qaSite || !qaWorker) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', site_id: qaSite, worker_id: qaWorker }),
      })
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка назначения')
    } finally {
      setBusy(false)
    }
  }

  async function unassign(siteId: string, workerId: string) {
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unassign', site_id: siteId, worker_id: workerId }),
      })
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка снятия назначения')
    } finally {
      setBusy(false)
    }
  }

  async function createJobs() {
    if (!newSiteId || newWorkers.length === 0 || !newDate || !newTime) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: newSiteId,
          worker_ids: newWorkers,
          job_date: newDate,
          scheduled_time: newTime,
        }),
      })
      setNewWorkers([])
      await refreshAll()
      setTab('jobs')
      setJobsView('table')
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать смену')
    } finally {
      setBusy(false)
    }
  }

  function setRangeToday() {
    const t = new Date()
    const d = toISODate(t)
    setDateFrom(d)
    setDateTo(d)
  }

  function setRangeWeek() {
    const t = new Date()
    setDateFrom(toISODate(startOfWeek(t)))
    setDateTo(toISODate(endOfWeek(t)))
  }

  function setRangeMonth() {
    const t = new Date()
    setDateFrom(toISODate(startOfMonth(t)))
    setDateTo(toISODate(endOfMonth(t)))
  }

  const workersForSelect = useMemo(() => {
    return workers
      .filter((w) => (w.role || 'worker') !== 'admin')
      .filter((w) => w.active !== false)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [workers])

  const workersAssignedToSite = useMemo(() => {
    if (!newSiteId) return []
    const list = siteWorkers.get(newSiteId) || []
    return list
      .filter((w) => (w.role || 'worker') !== 'admin')
      .filter((w) => w.active !== false)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [newSiteId, siteWorkers])

  if (sessionLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
            <div className="text-sm text-zinc-300">Проверяю вход…</div>
          </div>
        </div>
      </main>
    )
  }

  if (!sessionToken) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="mb-8 flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/40 shadow-[0_0_0_1px_rgba(255,215,0,0.12)]">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-2" priority />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">Админ-панель</div>
              <div className="text-xs text-yellow-200/70">Tanija • объекты • работники • смены</div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
            <h1 className="text-xl font-semibold text-yellow-100">Вход в админку</h1>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <form onSubmit={onLogin} className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="you@domain.com"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">Пароль</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="••••••••"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-2xl border border-yellow-300/40 bg-gradient-to-r from-yellow-500/10 via-yellow-400/10 to-yellow-300/10 px-4 py-3 text-sm font-semibold text-yellow-100 shadow-[0_0_0_1px_rgba(255,215,0,0.18)] transition hover:border-yellow-200/70 hover:bg-yellow-400/10 disabled:opacity-60"
              >
                {busy ? 'Вхожу…' : 'Войти'}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-yellow-400/30 bg-black/40 shadow-[0_0_0_1px_rgba(255,215,0,0.12)]">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-2" priority />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">Админ-панель</div>
              <div className="text-xs text-yellow-200/70">Tanija • объекты • работники • смены</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              disabled={busy}
              className="rounded-xl border border-yellow-400/40 bg-black/40 px-4 py-2 text-sm text-yellow-100 transition hover:border-yellow-300/70 hover:bg-black/60 disabled:opacity-60"
            >
              {busy ? 'Обновляю…' : 'Обновить данные'}
            </button>

            <button
              onClick={onLogout}
              disabled={busy}
              className="rounded-xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-sm text-yellow-100/90 transition hover:border-yellow-300/60 hover:bg-black/50 disabled:opacity-60"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(['sites', 'workers', 'jobs'] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={[
                    'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                    tab === k
                      ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                      : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40',
                  ].join(' ')}
                >
                  {k === 'sites' ? 'Объекты' : k === 'workers' ? 'Работники' : 'Смены'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {tab === 'sites' ? (
                <label className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-200">
                  <input
                    type="checkbox"
                    checked={showArchivedSites}
                    onChange={(e) => setShowArchivedSites(e.target.checked)}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  Показать архив
                </label>
              ) : null}

              <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-200">
                Объекты: {sites.length} • Работники: {workers.length} • Смены: {schedule.length}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {tab === 'sites' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">Быстрое назначение</div>
                    <div className="mt-1 text-xs text-zinc-300">Назначение = доступ к объекту. Расписание делается в “Смены”.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={qaSite}
                      onChange={(e) => setQaSite(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                    >
                      <option value="">Объект…</option>
                      {activeSitesForAssign.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.id}
                        </option>
                      ))}
                    </select>

                    <select
                      value={qaWorker}
                      onChange={(e) => setQaWorker(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                    >
                      <option value="">Работник…</option>
                      {workers
                        .filter((w) => (w.role || 'worker') !== 'admin')
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {(w.full_name || 'Работник') + (w.active === false ? ' (отключён)' : '')}
                          </option>
                        ))}
                    </select>

                    <button
                      onClick={quickAssign}
                      disabled={busy || !qaSite || !qaWorker}
                      className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                    >
                      Назначить
                    </button>
                  </div>
                </div>
              </div>

              {sites.map((s) => {
                const assigned = siteWorkers.get(s.id) || []
                const gpsOk = s.lat != null && s.lng != null
                const archived = Boolean(s.archived_at)

                return (
                  <div key={s.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5 shadow-[0_0_0_1px_rgba(255,215,0,0.08)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-yellow-100">
                          {s.name || 'Объект'}{' '}
                          {archived ? (
                            <span className="ml-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                              архив
                            </span>
                          ) : (
                            <span className="ml-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                              активен
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-zinc-300">
                          GPS:{' '}
                          <span className={gpsOk ? 'text-zinc-100' : 'text-red-200'}>
                            {gpsOk ? `${s.lat}, ${s.lng}` : 'нет lat/lng'}
                          </span>{' '}
                          • радиус: <span className="text-zinc-100">{s.radius ?? '—'}</span>
                        </div>

                        <div className="mt-3 text-xs text-zinc-300">Назначены:</div>
                        {assigned.length === 0 ? (
                          <div className="mt-1 text-xs text-zinc-500">—</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {assigned.map((w) => (
                              <div key={w.id} className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs">
                                <span className="text-zinc-100">{w.full_name || 'Работник'}</span>
                                <button
                                  onClick={() => unassign(s.id, w.id)}
                                  disabled={busy}
                                  className="rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-yellow-100/80 transition hover:border-yellow-300/50 disabled:opacity-60"
                                >
                                  снять
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                        Расписание: вкладка “Смены”
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {tab === 'workers' ? (
            <div className="mt-6 grid gap-3">
              {workers.map((w) => {
                const sitesList = workerSites.get(w.id) || []
                const isAdmin = (w.role || '') === 'admin'
                return (
                  <div key={w.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5 shadow-[0_0_0_1px_rgba(255,215,0,0.08)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-yellow-100">
                          {w.full_name || 'Без имени'}{' '}
                          {isAdmin ? (
                            <span className="ml-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">
                              админ
                            </span>
                          ) : (
                            <span className="ml-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                              работник
                            </span>
                          )}
                          {w.active === false ? (
                            <span className="ml-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                              отключён
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 text-xs text-zinc-300">Объекты:</div>
                        {sitesList.length === 0 ? (
                          <div className="mt-1 text-xs text-zinc-500">—</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {sitesList.map((s) => (
                              <div key={s.id} className="rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs text-zinc-100">
                                {s.name || s.id}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                        Расписание: вкладка “Смены”
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {tab === 'jobs' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">Создать смену</div>
                    <div className="mt-1 text-xs text-zinc-300">Объект + дата + время + несколько работников.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={setRangeToday}
                      disabled={busy}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                    >
                      Сегодня
                    </button>
                    <button
                      onClick={setRangeWeek}
                      disabled={busy}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                    >
                      Неделя
                    </button>
                    <button
                      onClick={setRangeMonth}
                      disabled={busy}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                    >
                      Месяц
                    </button>

                    <div className="mx-2 hidden h-8 w-px bg-yellow-400/10 md:block" />

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">С</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">По</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">Объект</span>
                    <select
                      value={newSiteId}
                      onChange={(e) => {
                        setNewSiteId(e.target.value)
                        setNewWorkers([])
                      }}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                    >
                      <option value="">Выбери объект…</option>
                      {activeSitesForAssign.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-[11px] text-zinc-300">Работники (можно несколько)</span>
                    <select
                      multiple
                      value={newWorkers}
                      onChange={(e) => {
                        const opts = Array.from(e.target.selectedOptions).map((o) => o.value)
                        setNewWorkers(opts)
                      }}
                      className="h-[52px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                    >
                      {(workersAssignedToSite.length ? workersAssignedToSite : workersForSelect).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.full_name || 'Работник'}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Дата</span>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Время</span>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setJobsView('board')}
                      className={[
                        'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                        jobsView === 'board'
                          ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                          : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40',
                      ].join(' ')}
                    >
                      Доска
                    </button>
                    <button
                      onClick={() => setJobsView('table')}
                      className={[
                        'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                        jobsView === 'table'
                          ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                          : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40',
                      ].join(' ')}
                    >
                      Календарь
                    </button>
                  </div>

                  <button
                    onClick={createJobs}
                    disabled={busy || !newSiteId || newWorkers.length === 0 || !newDate || !newTime}
                    className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                  >
                    Создать смену
                  </button>
                </div>
              </div>

              {jobsView === 'board' ? (
                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    { title: 'Запланировано', list: planned },
                    { title: 'В процессе', list: inProgress },
                    { title: 'Завершено', list: done },
                  ].map((col) => (
                    <div key={col.title} className="rounded-3xl border border-yellow-400/15 bg-black/20 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold text-yellow-100">{col.title}</div>
                        <div className="rounded-xl border border-yellow-400/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                          {col.list.length}
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {col.list.length === 0 ? (
                          <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-zinc-500">
                            —
                          </div>
                        ) : null}

                        {col.list.map((j) => (
                          <div key={j.id} className="rounded-2xl border border-yellow-400/10 bg-black/35 p-3 text-sm">
                            <div className="text-sm font-semibold text-zinc-100">{j.site_name || 'Объект'}</div>
                            <div className="mt-1 text-[11px] text-zinc-300">
                              {fmtD(j.job_date)} {j.scheduled_time ? String(j.scheduled_time).slice(0, 5) : ''}
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-300">Работник: <span className="text-zinc-100">{j.worker_name || '—'}</span></div>
                            <div className="mt-1 text-[11px] text-zinc-300">
                              Старт: <span className="text-zinc-100">{fmtDT(j.started_at)}</span> • Стоп:{' '}
                              <span className="text-zinc-100">{fmtDT(j.stopped_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-yellow-400/15 bg-black/20 p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-xs text-zinc-300">
                          <th className="py-2 pr-3">Дата</th>
                          <th className="py-2 pr-3">Время</th>
                          <th className="py-2 pr-3">Объект</th>
                          <th className="py-2 pr-3">Работник</th>
                          <th className="py-2 pr-3">Статус</th>
                          <th className="py-2 pr-3">Начал</th>
                          <th className="py-2 pr-3">Закончил</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-4 text-xs text-zinc-500">
                              Нет смен в выбранном диапазоне.
                            </td>
                          </tr>
                        ) : null}

                        {schedule.map((j) => {
                          const st =
                            j.status === 'planned'
                              ? 'Запланировано'
                              : j.status === 'in_progress'
                                ? 'В процессе'
                                : 'Завершено'
                          return (
                            <tr key={j.id} className="border-t border-yellow-400/10">
                              <td className="py-3 pr-3 text-zinc-100">{fmtD(j.job_date)}</td>
                              <td className="py-3 pr-3 text-zinc-100">{j.scheduled_time ? String(j.scheduled_time).slice(0, 5) : '—'}</td>
                              <td className="py-3 pr-3 text-zinc-100">{j.site_name || '—'}</td>
                              <td className="py-3 pr-3 text-zinc-100">{j.worker_name || '—'}</td>
                              <td className="py-3 pr-3 text-zinc-100">{st}</td>
                              <td className="py-3 pr-3 text-zinc-100">{fmtDT(j.started_at)}</td>
                              <td className="py-3 pr-3 text-zinc-100">{fmtDT(j.stopped_at)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
