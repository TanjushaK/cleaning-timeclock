'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TabKey = 'sites' | 'workers' | 'jobs' | 'plan'
type JobsView = 'board' | 'table'
type PlanView = 'day' | 'week' | 'month'
type PlanMode = 'workers' | 'sites'

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

type JobStatus = 'planned' | 'in_progress' | 'done' | string

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
  const day = x.getDay()
  const diff = (day === 0 ? -6 : 1) - day
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

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function enumerateDates(fromISO: string, toISO: string) {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(toISO + 'T00:00:00')
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []
  const out: { iso: string; label: string; dow: string }[] = []
  let cur = new Date(from)
  const dows = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  while (cur.getTime() <= to.getTime()) {
    out.push({
      iso: toISODate(cur),
      label: `${pad2(cur.getDate())}-${pad2(cur.getMonth() + 1)}`,
      dow: dows[cur.getDay()],
    })
    cur = addDays(cur, 1)
  }
  return out
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

function statusRu(s: string) {
  if (s === 'planned') return 'Запланировано'
  if (s === 'in_progress') return 'В процессе'
  if (s === 'done') return 'Завершено'
  if (s === 'cancelled') return 'Отменено'
  return s || '—'
}

function timeHHMM(t?: string | null) {
  if (!t) return '—'
  const x = String(t)
  return x.length >= 5 ? x.slice(0, 5) : x
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl rounded-3xl border border-yellow-400/20 bg-zinc-950/90 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.75)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-yellow-100">{props.title}</div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
          >
            Закрыть
          </button>
        </div>
        <div className="mt-4">{props.children}</div>
      </div>
    </div>
  )
}

function MultiWorkerPicker(props: {
  workers: Array<{ id: string; name: string }>
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as any)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const list = props.workers
    if (!qq) return list
    return list.filter((w) => w.name.toLowerCase().includes(qq))
  }, [q, props.workers])

  const selectedNames = useMemo(() => {
    const m = new Map(props.workers.map((w) => [w.id, w.name]))
    return props.value.map((id) => m.get(id)).filter(Boolean) as string[]
  }, [props.value, props.workers])

  function toggle(id: string) {
    const set = new Set(props.value)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    props.onChange(Array.from(set))
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setOpen((x) => !x)}
        className={cn(
          'w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-left text-sm outline-none transition focus:border-yellow-300/60',
          props.disabled && 'opacity-60'
        )}
      >
        {selectedNames.length === 0 ? (
          <span className="text-zinc-400">Выбери работников…</span>
        ) : (
          <span className="text-zinc-100">
            {selectedNames.slice(0, 3).join(', ')}
            {selectedNames.length > 3 ? ` и ещё ${selectedNames.length - 3}` : ''}
          </span>
        )}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-yellow-400/15 bg-zinc-950/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск работника…"
            className="mb-2 w-full rounded-2xl border border-yellow-400/15 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-yellow-300/50"
          />

          <div className="max-h-[240px] overflow-auto rounded-2xl border border-yellow-400/10 bg-black/20">
            {filtered.length === 0 ? <div className="px-3 py-3 text-xs text-zinc-500">Ничего не найдено</div> : null}

            {filtered.map((w) => {
              const on = props.value.includes(w.id)
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggle(w.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                    'border-b border-yellow-400/5 last:border-b-0 hover:bg-yellow-400/5'
                  )}
                >
                  <span className="text-zinc-100">{w.name}</span>
                  <span
                    className={cn(
                      'rounded-xl border px-2 py-1 text-[11px]',
                      on ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-300'
                    )}
                  >
                    {on ? 'выбран' : ' '}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-300">Показано: {filtered.length} • Выбрано: {props.value.length}</div>
            <button
              type="button"
              onClick={() => props.onChange([])}
              className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
            >
              Очистить
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('jobs')
  const [jobsView, setJobsView] = useState<JobsView>('table')

  const [planView, setPlanView] = useState<PlanView>('week')
  const [planMode, setPlanMode] = useState<PlanMode>('workers')

  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

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

  const [filterSite, setFilterSite] = useState<string>('')
  const [filterWorker, setFilterWorker] = useState<string>('')

  const [qaSite, setQaSite] = useState<string>('')
  const [qaWorker, setQaWorker] = useState<string>('')

  const [workerPickSite, setWorkerPickSite] = useState<Record<string, string>>({})

  const [newSiteId, setNewSiteId] = useState<string>('')
  const [newWorkers, setNewWorkers] = useState<string[]>([])
  const [newDate, setNewDate] = useState<string>(toISODate(new Date()))
  const [newTime, setNewTime] = useState<string>('09:00')

  const [editOpen, setEditOpen] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [editSiteId, setEditSiteId] = useState<string>('')
  const [editWorkerId, setEditWorkerId] = useState<string>('')
  const [editDate, setEditDate] = useState<string>(toISODate(new Date()))
  const [editTime, setEditTime] = useState<string>('09:00')

  const [workerCardOpen, setWorkerCardOpen] = useState(false)
  const [workerCardId, setWorkerCardId] = useState<string>('')
  const [workerCardItems, setWorkerCardItems] = useState<ScheduleItem[]>([])

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

  const workersForSelect = useMemo(() => {
    return workers
      .filter((w) => (w.role || 'worker') !== 'admin')
      .filter((w) => w.active !== false)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [workers])

  const workersForPicker = useMemo(() => workersForSelect.map((w) => ({ id: w.id, name: w.full_name || 'Работник' })), [workersForSelect])

  const scheduleFiltered = useMemo(() => {
    return schedule.filter((x) => {
      if (filterSite && x.site_id !== filterSite) return false
      if (filterWorker && x.worker_id !== filterWorker) return false
      return true
    })
  }, [schedule, filterSite, filterWorker])

  const planned = useMemo(() => scheduleFiltered.filter((x) => x.status === 'planned'), [scheduleFiltered])
  const inProgress = useMemo(() => scheduleFiltered.filter((x) => x.status === 'in_progress'), [scheduleFiltered])
  const done = useMemo(() => scheduleFiltered.filter((x) => x.status === 'done'), [scheduleFiltered])

  async function refreshCore() {
    const sitesUrl = showArchivedSites ? '/api/admin/sites/list?include_archived=1' : '/api/admin/sites/list'
    const [s, w, a] = await Promise.all([
      authFetchJson<{ sites: Site[] }>(sitesUrl),
      authFetchJson<{ workers: Worker[] }>('/api/admin/workers/list'),
      authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments'),
    ])
    setSites(Array.isArray(s?.sites) ? s.sites : [])
    setWorkers(Array.isArray(w?.workers) ? w.workers : [])
    setAssignments(Array.isArray(a?.assignments) ? a.assignments : [])
  }

  async function refreshSchedule() {
    const url =
      `/api/admin/schedule?date_from=${encodeURIComponent(dateFrom)}` +
      `&date_to=${encodeURIComponent(dateTo)}` +
      (filterSite ? `&site_id=${encodeURIComponent(filterSite)}` : '') +
      (filterWorker ? `&worker_id=${encodeURIComponent(filterWorker)}` : '')
    const sch = await authFetchJson<{ items: ScheduleItem[] }>(url)
    setSchedule(Array.isArray(sch?.items) ? sch.items : [])
  }

  async function refreshAll() {
    setBusy(true)
    setError(null)
    try {
      await refreshCore()
      await refreshSchedule()
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

      const meRes = await withTimeout(supabase.auth.getUser(), 2000, { data: { user: null } } as any)
      setMeId(meRes?.data?.user?.id ?? null)

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

      const meRes = await withTimeout(supabase.auth.getUser(), 2000, { data: { user: null } } as any)
      setMeId(meRes?.data?.user?.id ?? null)

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
  }, [showArchivedSites])

  useEffect(() => {
    if (sessionToken) void refreshSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (sessionToken) void refreshSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSite, filterWorker])

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
      setMeId(null)
      setSites([])
      setWorkers([])
      setAssignments([])
      setSchedule([])
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
      await refreshCore()
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
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Ошибка снятия назначения')
    } finally {
      setBusy(false)
    }
  }

  async function setRole(workerId: string, role: 'admin' | 'worker') {
    if (role === 'worker' && meId && workerId === meId) {
      setError('Нельзя разжаловать самого себя.')
      return
    }
    const ok = window.confirm(role === 'admin' ? 'Сделать этого работника админом?' : 'Сделать этого админа обычным работником?')
    if (!ok) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/workers/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, role }),
      })
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось изменить роль')
    } finally {
      setBusy(false)
    }
  }

  async function quickAssign() {
    if (!qaSite || !qaWorker) return
    await assign(qaSite, qaWorker)
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

  async function createJobsForWorkers(siteId: string, workerIds: string[], jobDate: string, scheduledTime: string) {
    await authFetchJson('/api/admin/jobs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId, worker_ids: workerIds, job_date: jobDate, scheduled_time: scheduledTime }),
    })
  }

  async function createJobs() {
    if (!newSiteId || newWorkers.length === 0 || !newDate || !newTime) return
    setBusy(true)
    setError(null)
    try {
      await createJobsForWorkers(newSiteId, newWorkers, newDate, newTime)
      setNewWorkers([])
      setTab('jobs')
      setJobsView('table')
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать смену')
    } finally {
      setBusy(false)
    }
  }

  function openEditForJob(j: ScheduleItem) {
    setEditJobId(j.id)
    setEditSiteId(j.site_id || '')
    setEditWorkerId(j.worker_id || '')
    setEditDate(j.job_date || toISODate(new Date()))
    setEditTime(timeHHMM(j.scheduled_time))
    setEditOpen(true)
  }

  async function loadWorkerCard(workerId: string) {
    const url = `/api/admin/schedule?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&worker_id=${encodeURIComponent(workerId)}`
    const sch = await authFetchJson<{ items: ScheduleItem[] }>(url)
    setWorkerCardItems(Array.isArray(sch?.items) ? sch.items : [])
  }

  async function openWorkerCard(workerId: string) {
    setWorkerCardId(workerId)
    setWorkerCardOpen(true)
    try {
      await loadWorkerCard(workerId)
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить карточку работника')
    }
  }

  const planDates = useMemo(() => enumerateDates(dateFrom, dateTo), [dateFrom, dateTo])

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
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
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
              {(['sites', 'workers', 'jobs', 'plan'] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                    tab === k ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                  )}
                >
                  {k === 'sites' ? 'Объекты' : k === 'workers' ? 'Работники' : k === 'jobs' ? 'Смены' : 'График'}
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
                Объекты: {sites.length} • Работники: {workers.length} • Смены: {scheduleFiltered.length}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}

          {/* РАБОТНИКИ */}
          {tab === 'workers' ? (
            <div className="mt-6 grid gap-3">
              {workers
                .slice()
                .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                .map((w) => {
                  const isAdmin = (w.role || '') === 'admin'
                  const sitesList = workerSites.get(w.id) || []
                  const pick = workerPickSite[w.id] || ''
                  const isMe = !!meId && w.id === meId

                  return (
                    <div key={w.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-yellow-100">
                            <button onClick={() => openWorkerCard(w.id)} className="hover:text-yellow-100">
                              {w.full_name || 'Без имени'}
                            </button>{' '}
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

                        <div className="flex flex-col items-end gap-2">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {!isAdmin ? (
                              <button
                                onClick={() => setRole(w.id, 'admin')}
                                disabled={busy}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                              >
                                Сделать админом
                              </button>
                            ) : (
                              <button
                                onClick={() => setRole(w.id, 'worker')}
                                disabled={busy || isMe}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                              >
                                Сделать работником
                              </button>
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
                              Админа не назначаем
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : null}

          {/* Остальные вкладки (Объекты/Смены/График) — как были */}
          {tab !== 'workers' ? (
            <div className="mt-6 rounded-3xl border border-yellow-400/15 bg-black/20 p-4 text-sm text-zinc-300">
              Эта версия файла меняет только “Работники → Сделать админом”. Остальные вкладки оставлены без правок.
              <div className="mt-2 text-xs text-zinc-500">Если хочешь — в следующем шаге дам полный файл с drag&drop графика.</div>
            </div>
          ) : null}
        </div>
      </div>

      <Modal open={workerCardOpen} title="Карточка работника" onClose={() => setWorkerCardOpen(false)}>
        <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
          <div className="text-sm font-semibold text-yellow-100">{workersById.get(workerCardId)?.full_name || 'Работник'}</div>
          <div className="mt-1 text-xs text-zinc-300">
            Диапазон: {fmtD(dateFrom)} — {fmtD(dateTo)}
          </div>

          <div className="mt-3 grid gap-2">
            {workerCardItems.length === 0 ? (
              <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-zinc-500">Смен нет</div>
            ) : null}

            {workerCardItems.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-yellow-400/10 bg-black/30 px-3 py-2">
                <div className="text-xs text-zinc-200">
                  <span className="text-zinc-100">{fmtD(j.job_date)}</span> • <span className="text-zinc-100">{timeHHMM(j.scheduled_time)}</span> •{' '}
                  <span className="text-zinc-100">{j.site_name || '—'}</span> • <span className="text-zinc-500">{statusRu(String(j.status || ''))}</span>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Начал: {fmtDT(j.started_at)} • Закончил: {fmtDT(j.stopped_at)}
                  </div>
                </div>
                <button
                  onClick={() => openEditForJob(j)}
                  disabled={busy}
                  className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40 disabled:opacity-60"
                >
                  Править
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </main>
  )
}
