'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TabKey = 'sites' | 'workers' | 'jobs'

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
  role?: string | null
  active?: boolean | null
}

type Assignment = {
  site_id: string
  worker_id: string
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

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: any
  const timeout = new Promise<T>((resolve) => {
    t = setTimeout(() => resolve(fallback), ms)
  })
  const res = await Promise.race([p, timeout])
  clearTimeout(t)
  return res
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
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`)
  return payload as T
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('sites')

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

  const [qaSite, setQaSite] = useState<string>('')
  const [qaWorker, setQaWorker] = useState<string>('')

  const [workerPickSite, setWorkerPickSite] = useState<Record<string, string>>({})

  const sitesById = useMemo(() => {
    const m = new Map<string, Site>()
    for (const s of sites) m.set(s.id, s)
    return m
  }, [sites])

  const workersById = useMemo(() => {
    const m = new Map<string, Worker>()
    for (const w of workers) m.set(w.id, w)
    return m
  }, [workers])

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

  const activeSites = useMemo(() => sites.filter((s) => !s.archived_at), [sites])

  async function refreshAll() {
    setBusy(true)
    setError(null)
    try {
      const sitesUrl = showArchivedSites ? '/api/admin/sites/list?include_archived=1' : '/api/admin/sites/list'
      const [s, w, a] = await Promise.all([
        authFetchJson<{ sites: Site[] }>(sitesUrl),
        authFetchJson<{ workers: Worker[] }>('/api/admin/workers/list'),
        authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments'),
      ])
      setSites(Array.isArray(s?.sites) ? s.sites : [])
      setWorkers(Array.isArray(w?.workers) ? w.workers : [])
      setAssignments(Array.isArray(a?.assignments) ? a.assignments : [])
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  async function boot() {
    setSessionLoading(true)
    try {
      const sessionRes = await withTimeout(supabase.auth.getSession(), 2000, { data: { session: null } } as any)
      const token = sessionRes?.data?.session?.access_token ?? null
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
      }
    })

    return () => sub?.subscription?.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (sessionToken) void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedSites])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) setError(signInError.message || 'Ошибка входа')
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
    } finally {
      setBusy(false)
    }
  }

  async function assign(siteId: string, workerId: string) {
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', site_id: siteId, worker_id: workerId }),
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

  async function quickAssign() {
    if (!qaSite || !qaWorker) return
    await assign(qaSite, qaWorker)
  }

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
            <h1 className="text-xl font-semibold text-yellow-100">Вход</h1>

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
                Объекты: {sites.length} • Работники: {workers.length} • Назначения: {assignments.length}
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
                    <div className="mt-1 text-xs text-zinc-300">Назначение = доступ к объекту.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={qaSite}
                      onChange={(e) => setQaSite(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                    >
                      <option value="">Объект…</option>
                      {activeSites.map((s) => (
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
                  <div key={s.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-yellow-100">
                          {s.name || 'Объект'}{' '}
                          {archived ? (
                            <span className="ml-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                              архив ({fmtDT(s.archived_at)})
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
                        Назначение можно делать и тут, и во вкладке “Работники”.
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
                const isAdmin = (w.role || '') === 'admin'
                const sitesList = workerSites.get(w.id) || []
                const pick = workerPickSite[w.id] || ''

                return (
                  <div key={w.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
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

                        <div className="mt-3 text-xs text-zinc-300">Объекты:</div>
                        {sitesList.length === 0 ? (
                          <div className="mt-1 text-xs text-zinc-500">—</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {sitesList.map((s) => (
                              <div key={s.id} className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs">
                                <span className="text-zinc-100">{s.name || s.id}</span>
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

                      {!isAdmin ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid gap-1">
                            <span className="text-[11px] text-zinc-300">Добавить объект</span>
                            <select
                              value={pick}
                              onChange={(e) => setWorkerPickSite((p) => ({ ...p, [w.id]: e.target.value }))}
                              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                            >
                              <option value="">Выбери объект…</option>
                              {activeSites.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name || s.id}
                                </option>
                              ))}
                            </select>
                          </label>

                          <button
                            onClick={() => pick && assign(pick, w.id)}
                            disabled={busy || !pick}
                            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                          >
                            Назначить
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                          Админа не назначаем 🙂
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {tab === 'jobs' ? (
            <div className="mt-6 rounded-3xl border border-yellow-400/15 bg-black/25 p-5 text-sm text-zinc-200">
              Вкладка “Смены” будет выглядеть профессионально, когда у тебя будут стабильные поля jobs/time_logs. После SQL-блока это уже без сюрпризов.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
