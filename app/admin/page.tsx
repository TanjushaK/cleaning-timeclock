// app/admin/page.tsx
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

type Job = {
  id: string
  status: JobStatus
  site_id?: string | null
  site_name?: string | null
  job_date?: string | null
  scheduled_time?: string | null
  scheduled_at?: string | null
  worker_id?: string | null
  worker_name?: string | null
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

async function authFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Нет токена (Authorization: Bearer …)')

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

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sites, setSites] = useState<Site[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [qaSite, setQaSite] = useState<string>('')
  const [qaWorker, setQaWorker] = useState<string>('')

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

  const jobsPlanned = useMemo(() => jobs.filter((j) => j.status === 'planned'), [jobs])
  const jobsInProgress = useMemo(() => jobs.filter((j) => j.status === 'in_progress'), [jobs])
  const jobsDone = useMemo(() => jobs.filter((j) => j.status === 'done'), [jobs])

  async function refreshAll() {
    setBusy(true)
    setError(null)
    try {
      const [s, w, a, j] = await Promise.all([
        authFetchJson<{ sites: Site[] }>('/api/admin/sites/list'),
        authFetchJson<{ workers: Worker[] }>('/api/admin/workers/list'),
        authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments'),
        authFetchJson<{ jobs: Job[] }>('/api/admin/jobs'),
      ])

      setSites(Array.isArray(s?.sites) ? s.sites : [])
      setWorkers(Array.isArray(w?.workers) ? w.workers : [])
      setAssignments(Array.isArray(a?.assignments) ? a.assignments : [])
      setJobs(Array.isArray(j?.jobs) ? j.jobs : [])
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function deleteSite(siteId: string) {
    const ok = window.confirm('Удалить объект? Если по нему есть смены — сервер запретит.')
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/sites/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId }),
      })
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'Удаление не выполнено')
    } finally {
      setBusy(false)
    }
  }

  async function setWorkerActive(workerId: string, active: boolean) {
    const ok = window.confirm(active ? 'Включить работника обратно?' : 'Отключить работника? (рекомендовано вместо удаления)')
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/workers/set-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, active }),
      })
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'Операция не выполнена')
    } finally {
      setBusy(false)
    }
  }

  async function hardDeleteWorker(workerId: string) {
    const ok1 = window.confirm('Удалить работника НАВСЕГДА? Это риск для отчётов. Продолжить?')
    if (!ok1) return
    const ok2 = window.confirm('Последний шанс: точно удалить? Сервер удалит только если нет логов/смен.')
    if (!ok2) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/workers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId }),
      })
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'Удаление не выполнено')
    } finally {
      setBusy(false)
    }
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
              <div className="text-lg font-semibold tracking-wide">Admin Panel</div>
              <div className="text-xs text-yellow-200/70">Tanija • sites • workers • jobs</div>
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
                  {k === 'sites' ? 'Объекты' : k === 'workers' ? 'Работники' : 'Смены (Kanban)'}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-200">
              Sites: {sites.length} • Workers: {workers.length} • Jobs: {jobs.length}
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
                    <div className="text-sm font-semibold text-yellow-100">QuickAssign</div>
                    <div className="mt-1 text-xs text-zinc-300">Выбери объект и работника → назначить.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={qaSite}
                      onChange={(e) => setQaSite(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                    >
                      <option value="">Объект…</option>
                      {sites.map((s) => (
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
                            {(w.full_name || 'Worker') + (w.active === false ? ' (off)' : '')}
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
                return (
                  <div
                    key={s.id}
                    className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5 shadow-[0_0_0_1px_rgba(255,215,0,0.08)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-yellow-100">{s.name || 'Объект'}</div>
                        <div className="mt-1 text-xs text-zinc-300">
                          GPS:{' '}
                          <span className={gpsOk ? 'text-zinc-100' : 'text-red-200'}>
                            {gpsOk ? `${s.lat}, ${s.lng}` : 'нет lat/lng'}
                          </span>{' '}
                          • radius: <span className="text-zinc-100">{s.radius ?? '—'}</span>
                        </div>

                        <div className="mt-3 text-xs text-zinc-300">Назначены:</div>
                        {assigned.length === 0 ? (
                          <div className="mt-1 text-xs text-zinc-500">—</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {assigned.map((w) => (
                              <div
                                key={w.id}
                                className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs"
                              >
                                <span className="text-zinc-100">{w.full_name || 'Worker'}</span>
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

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteSite(s.id)}
                          disabled={busy}
                          className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/50 disabled:opacity-60"
                        >
                          Удалить объект
                        </button>
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
                  <div
                    key={w.id}
                    className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5 shadow-[0_0_0_1px_rgba(255,215,0,0.08)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-yellow-100">
                          {w.full_name || 'Без имени'}{' '}
                          {isAdmin ? (
                            <span className="ml-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">
                              admin
                            </span>
                          ) : (
                            <span className="ml-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                              worker
                            </span>
                          )}
                          {w.active === false ? (
                            <span className="ml-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                              disabled
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 text-xs text-zinc-300">Объекты:</div>
                        {sitesList.length === 0 ? (
                          <div className="mt-1 text-xs text-zinc-500">—</div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {sitesList.map((s) => (
                              <div
                                key={s.id}
                                className="rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs text-zinc-100"
                              >
                                {s.name || s.id}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isAdmin ? (
                          <>
                            <button
                              onClick={() => setWorkerActive(w.id, w.active === false)}
                              disabled={busy}
                              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                            >
                              {w.active === false ? 'Включить' : 'Отключить'}
                            </button>

                            <button
                              onClick={() => hardDeleteWorker(w.id)}
                              disabled={busy}
                              className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/50 disabled:opacity-60"
                            >
                              Удалить навсегда
                            </button>
                          </>
                        ) : (
                          <div className="rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs text-zinc-300">
                            Админа не трогаем 🙂
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          {tab === 'jobs' ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {[
                { key: 'planned', title: 'Planned', list: jobsPlanned },
                { key: 'in_progress', title: 'In progress', list: jobsInProgress },
                { key: 'done', title: 'Done', list: jobsDone },
              ].map((col) => (
                <div key={col.key} className="rounded-3xl border border-yellow-400/15 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-yellow-100">{col.title}</div>
                    <div className="rounded-xl border border-yellow-400/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                      {col.list.length}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {col.list.map((j) => {
                      const siteName = j.site_name || sitesById.get(j.site_id || '')?.name || 'Объект'
                      const when =
                        j.scheduled_at
                          ? fmtDT(j.scheduled_at)
                          : j.job_date
                            ? `${fmtD(j.job_date)}${j.scheduled_time ? ` ${j.scheduled_time.slice(0, 5)}` : ''}`
                            : '—'

                      return (
                        <div
                          key={j.id}
                          className="rounded-2xl border border-yellow-400/10 bg-black/35 p-3 text-sm"
                        >
                          <div className="text-sm font-semibold text-zinc-100">{siteName}</div>
                          <div className="mt-1 text-[11px] text-zinc-300">{when}</div>
                        </div>
                      )
                    })}
                    {col.list.length === 0 ? (
                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-zinc-500">
                        —
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Админка: удаление безопасное — объект удалится только если нет смен, работник лучше отключать.
        </div>
      </div>
    </main>
  )
}
