'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type TabKey = 'sites' | 'workers' | 'jobs' | 'plan'
type JobsView = 'board' | 'table'
type PlanView = 'day' | 'week' | 'month'
type PlanMode = 'workers' | 'sites'

type SitePhoto = {
  path: string
  url: string
  created_at?: string
}

type Site = {
  id: string
  name?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  radius?: number | null
  category?: number | null
  notes?: string | null
  photos?: SitePhoto[] | null
  archived_at?: string | null
}

type Worker = {
  id: string
  full_name?: string | null
  role?: string | null
  active?: boolean | null
  email?: string | null
  phone?: string | null
  avatar_url?: string | null
  notes?: string | null
}

type Assignment = {
  site_id: string
  worker_id: string
  extra_note?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type JobStatus = 'planned' | 'in_progress' | 'done' | 'cancelled' | string

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

type SiteCategory = { id: number; label: string; dotClass: string }

const SITE_CATEGORIES: SiteCategory[] = [
  { id: 1, label: 'Категория 1', dotClass: 'bg-emerald-400' },
  { id: 2, label: 'Категория 2', dotClass: 'bg-sky-400' },
  { id: 3, label: 'Категория 3', dotClass: 'bg-violet-400' },
  { id: 4, label: 'Категория 4', dotClass: 'bg-fuchsia-400' },
  { id: 5, label: 'Категория 5', dotClass: 'bg-rose-400' },
  { id: 6, label: 'Категория 6', dotClass: 'bg-amber-400' },
  { id: 7, label: 'Категория 7', dotClass: 'bg-lime-400' },
  { id: 8, label: 'Категория 8', dotClass: 'bg-cyan-400' },
  { id: 9, label: 'Категория 9', dotClass: 'bg-indigo-400' },
  { id: 10, label: 'Категория 10', dotClass: 'bg-orange-400' },
  { id: 11, label: 'Категория 11', dotClass: 'bg-teal-400' },
  { id: 12, label: 'Категория 12', dotClass: 'bg-pink-400' },
]

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
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

function timeHHMM(t?: string | null) {
  if (!t) return '—'
  const x = String(t)
  return x.length >= 5 ? x.slice(0, 5) : x
}

function statusRu(s: string) {
  if (s === 'planned') return 'Запланировано'
  if (s === 'in_progress') return 'В процессе'
  if (s === 'done') return 'Завершено'
  if (s === 'cancelled') return 'Отменено'
  return s || '—'
}

function initials(name?: string | null) {
  const s = String(name || '').trim()
  if (!s) return '??'
  const parts = s.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return (a + b).toUpperCase()
}

function siteCategoryMeta(category: number | null | undefined) {
  const c = SITE_CATEGORIES.find((x) => x.id === category)
  return c || ({ id: 0, label: 'Без категории', dotClass: 'bg-zinc-500' } as SiteCategory)
}

function googleNavUrl(lat: number, lng: number) {
  const dest = `${lat},${lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

function appleNavUrl(lat: number, lng: number) {
  const dest = `${lat},${lng}`
  return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`
}

function osmEmbedUrl(lat: number, lng: number, delta = 0.006) {
  const left = (lng - delta).toFixed(6)
  const bottom = (lat - delta).toFixed(6)
  const right = (lng + delta).toFixed(6)
  const top = (lat + delta).toFixed(6)
  const marker = `${lat.toFixed(6)},${lng.toFixed(6)}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${encodeURIComponent(marker)}`
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
  if (!res.ok) throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`)
  return payload as T
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-yellow-400/15 bg-yellow-400/5 px-2 py-0.5 text-[11px] text-yellow-100/70">
      {children}
    </span>
  )
}

function Modal(props: { open: boolean; title: string; onClose: () => void; children: ReactNode; maxW?: string }) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={props.onClose} />
      <div
        className={cn(
          'relative w-full rounded-3xl border border-yellow-400/20 bg-zinc-950/90 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.75)]',
          props.maxW || 'max-w-3xl'
        )}
      >
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

function CategoryPicker(props: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const meta = siteCategoryMeta(props.value)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return
      const el = ref.current
      if (!el) return
      if (e.target && el.contains(e.target as any)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none transition',
          props.disabled ? 'opacity-60' : 'hover:border-yellow-300/50'
        )}
      >
        <span className={cn('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', meta.dotClass)} />
        <span className="font-semibold">{props.value ? `#${props.value}` : '—'}</span>
        <span className="hidden sm:inline text-zinc-400">{meta.label}</span>
        <span className="ml-1 text-zinc-500">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-yellow-400/15 bg-zinc-950/95 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
          <button
            onClick={() => {
              props.onChange(null)
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-yellow-400/5"
          >
            <span className={cn('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', 'bg-zinc-500')} />
            <span className="font-semibold">—</span>
            <span className="text-zinc-300">Без категории</span>
          </button>
          <div className="h-px bg-yellow-400/10" />
          {SITE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                props.onChange(c.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-200 hover:bg-yellow-400/5"
            >
              <span className={cn('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', c.dotClass)} />
              <span className="font-semibold">#{c.id}</span>
              <span className="text-zinc-400">{c.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MapMini(props: { lat: number | null; lng: number | null; onClick: () => void }) {
  if (props.lat == null || props.lng == null) {
    return (
      <div className="flex h-[92px] w-[150px] items-center justify-center rounded-2xl border border-yellow-400/10 bg-black/20 text-[11px] text-zinc-500">
        Нет координат
      </div>
    )
  }

  return (
    <div className="relative h-[92px] w-[150px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(props.lat, props.lng, 0.004)} className="h-full w-full" loading="lazy" />
      <button onClick={props.onClick} className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" title="Открыть навигацию" />
      <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">Навигация</div>
    </div>
  )
}

function MapLarge(props: { lat: number; lng: number }) {
  return (
    <div className="relative h-[180px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(props.lat, props.lng, 0.01)} className="h-full w-full" loading="lazy" />
      <button
        onClick={() => window.open(googleNavUrl(props.lat, props.lng), '_blank', 'noopener,noreferrer')}
        className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0"
        title="Открыть навигацию"
      />
      <div className="absolute bottom-2 left-3 text-xs font-semibold text-yellow-100/90">Открыть навигацию</div>
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
                      on
                        ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100'
                        : 'border-yellow-400/15 bg-black/30 text-zinc-300'
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

type DragPayload = { job_id: string }

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('jobs')

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

  const [jobsView, setJobsView] = useState<JobsView>('table')

  const [anchorDate, setAnchorDate] = useState<string>(toISODate(new Date()))
  const [dateFrom, setDateFrom] = useState<string>(toISODate(startOfWeek(new Date())))
  const [dateTo, setDateTo] = useState<string>(toISODate(endOfWeek(new Date())))

  const [filterSite, setFilterSite] = useState<string>('')
  const [filterWorker, setFilterWorker] = useState<string>('')

  const [qaSite, setQaSite] = useState<string>('')
  const [qaWorker, setQaWorker] = useState<string>('')

  const [workerPickSite, setWorkerPickSite] = useState<Record<string, string>>({})

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')
  const [invitePassword, setInvitePassword] = useState('')

  const [siteCreateOpen, setSiteCreateOpen] = useState(false)
  const [siteEditOpen, setSiteEditOpen] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteAddress, setNewSiteAddress] = useState('')
  const [newSiteRadius, setNewSiteRadius] = useState('150')
  const [newSiteCategory, setNewSiteCategory] = useState<number | null>(null)
  const [newSiteNotes, setNewSiteNotes] = useState('')

  const [editSiteId, setEditSiteId] = useState<string>('')
  const [editSiteName, setEditSiteName] = useState('')
  const [editSiteAddress, setEditSiteAddress] = useState('')
  const [editSiteRadius, setEditSiteRadius] = useState('150')
  const [editSiteLat, setEditSiteLat] = useState('')
  const [editSiteLng, setEditSiteLng] = useState('')
  const [editSiteCategory, setEditSiteCategory] = useState<number | null>(null)
  const [editSiteNotes, setEditSiteNotes] = useState('')
  const [editSitePhotos, setEditSitePhotos] = useState<SitePhoto[]>([])

  const [newSiteId, setNewSiteId] = useState<string>('')
  const [newWorkers, setNewWorkers] = useState<string[]>([])
  const [newDate, setNewDate] = useState<string>(toISODate(new Date()))
  const [newTime, setNewTime] = useState<string>('09:00')

  const [editOpen, setEditOpen] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [editJobSiteId, setEditJobSiteId] = useState<string>('')
  const [editWorkerId, setEditWorkerId] = useState<string>('')
  const [editDate, setEditDate] = useState<string>(toISODate(new Date()))
  const [editTime, setEditTime] = useState<string>('09:00')
  const [editStatus, setEditStatus] = useState<JobStatus>('planned')

  const [workerCardOpen, setWorkerCardOpen] = useState(false)
  const [workerCardId, setWorkerCardId] = useState<string>('')
  const [workerCardItems, setWorkerCardItems] = useState<ScheduleItem[]>([])

  const [planView, setPlanView] = useState<PlanView>('week')
  const [planMode, setPlanMode] = useState<PlanMode>('workers')

  const [moveJobOpen, setMoveJobOpen] = useState(false)
  const [moveJobId, setMoveJobId] = useState<string>('')
  const [moveJobTargetWorker, setMoveJobTargetWorker] = useState<string>('')

  const [moveDayOpen, setMoveDayOpen] = useState(false)
  const [moveDayFromWorker, setMoveDayFromWorker] = useState<string>('')
  const [moveDayToWorker, setMoveDayToWorker] = useState<string>('')
  const [moveDayDate, setMoveDayDate] = useState<string>(toISODate(new Date()))
  const [moveDayOnlyPlanned, setMoveDayOnlyPlanned] = useState(true)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelJobId, setCancelJobId] = useState<string>('')

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites])
  const workersById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers])

  const activeSites = useMemo(() => sites.filter((s) => !s.archived_at), [sites])

  const workersForSelect = useMemo(() => {
    return workers
      .filter((w) => (w.role || 'worker') !== 'admin')
      .filter((w) => w.active !== false)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }, [workers])

  const workersForPicker = useMemo(
    () => workersForSelect.map((w) => ({ id: w.id, name: w.full_name || w.email || 'Работник' })),
    [workersForSelect]
  )

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
  const cancelled = useMemo(() => scheduleFiltered.filter((x) => x.status === 'cancelled'), [scheduleFiltered])

  const planDates = useMemo(() => enumerateDates(dateFrom, dateTo), [dateFrom, dateTo])

  const planEntities = useMemo(() => {
    if (planMode === 'workers') {
      return workersForSelect.map((w) => ({ id: w.id, name: w.full_name || w.email || 'Работник' }))
    }
    return activeSites.map((s) => ({ id: s.id, name: s.name || 'Объект' }))
  }, [planMode, workersForSelect, activeSites])

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => pad2(i) + ':00'), [])

  function recalcRange(nextPlanView: PlanView, baseISO: string) {
    const d = new Date(baseISO + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return
    if (nextPlanView === 'day') {
      const iso = toISODate(d)
      setDateFrom(iso)
      setDateTo(iso)
      setAnchorDate(iso)
      return
    }
    if (nextPlanView === 'week') {
      setDateFrom(toISODate(startOfWeek(d)))
      setDateTo(toISODate(endOfWeek(d)))
      setAnchorDate(toISODate(d))
      return
    }
    setDateFrom(toISODate(startOfMonth(d)))
    setDateTo(toISODate(endOfMonth(d)))
    setAnchorDate(toISODate(d))
  }

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

  async function setArchived(siteId: string, archived: boolean) {
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/sites/set-archived', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, archived }),
      })
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить архив')
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

  async function createSite() {
    if (!newSiteName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSiteName.trim(),
          address: newSiteAddress.trim() || null,
          radius: Number(newSiteRadius || '150'),
          category: newSiteCategory,
          notes: newSiteNotes || null,
        }),
      })

      setNewSiteName('')
      setNewSiteAddress('')
      setNewSiteRadius('150')
      setNewSiteCategory(null)
      setNewSiteNotes('')
      setSiteCreateOpen(false)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать объект')
    } finally {
      setBusy(false)
    }
  }

  function openEditSite(s: Site) {
    setEditSiteId(s.id)
    setEditSiteName(s.name || '')
    setEditSiteAddress(s.address || '')
    setEditSiteRadius(String(s.radius ?? 150))
    setEditSiteLat(s.lat == null ? '' : String(s.lat))
    setEditSiteLng(s.lng == null ? '' : String(s.lng))
    setEditSiteCategory(s.category ?? null)
    setEditSiteNotes(s.notes || '')
    setEditSitePhotos(Array.isArray(s.photos) ? s.photos : [])
    setSiteEditOpen(true)
  }

  async function saveEditSite() {
    if (!editSiteId || !editSiteName.trim()) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson(`/api/admin/sites/${editSiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editSiteName.trim(),
          address: editSiteAddress.trim() || null,
          radius: Number(editSiteRadius || '150'),
          lat: editSiteLat === '' ? null : Number(editSiteLat),
          lng: editSiteLng === '' ? null : Number(editSiteLng),
          category: editSiteCategory,
          notes: editSiteNotes || null,
        }),
      })
      setSiteEditOpen(false)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить объект')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSite(siteId: string) {
    const ok = window.confirm('Удалить объект? Он пропадёт из списка (можно восстановить через базу).')
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson(`/api/admin/sites/${siteId}`, { method: 'DELETE' })
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить объект')
    } finally {
      setBusy(false)
    }
  }

  async function setSiteCategoryQuick(siteId: string, cat: number | null) {
    setBusy(true)
    setError(null)
    try {
      await authFetchJson(`/api/admin/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat }),
      })
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить категорию')
    } finally {
      setBusy(false)
    }
  }

  async function uploadSitePhotos(siteId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setPhotoBusy(true)
    setError(null)

    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Нужно войти (нет активной сессии)')

      let current = editSitePhotos

      for (const f of Array.from(files)) {
        if (current.length >= 5) break

        const fd = new FormData()
        fd.append('file', f)

        const resp = await fetch(`/api/admin/sites/${siteId}/photos`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: fd,
          cache: 'no-store',
        })

        const json = await resp.json().catch(() => null)

        if (!resp.ok) {
          const msg = json?.error || json?.message || `Upload failed (${resp.status})`
          throw new Error(msg)
        }

        const next = Array.isArray(json?.site?.photos) ? (json.site.photos as SitePhoto[]) : []
        current = next
        setEditSitePhotos(next)
      }

      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить фото')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removeSitePhoto(siteId: string, path: string) {
    const ok = window.confirm('Удалить фото?')
    if (!ok) return
    setPhotoBusy(true)
    setError(null)
    try {
      const r = await authFetchJson<{ site: Site }>(`/api/admin/sites/${siteId}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const next = Array.isArray(r?.site?.photos) ? (r.site.photos as SitePhoto[]) : []
      setEditSitePhotos(next)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить фото')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function makePrimaryPhoto(siteId: string, path: string) {
    setPhotoBusy(true)
    setError(null)
    try {
      const r = await authFetchJson<{ site: Site }>(`/api/admin/sites/${siteId}/photos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'make_primary', path }),
      })
      const next = Array.isArray(r?.site?.photos) ? (r.site.photos as SitePhoto[]) : []
      setEditSitePhotos(next)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось сделать фото главным')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function inviteWorker() {
    if (!inviteEmail.trim() || !invitePassword) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/workers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          full_name: inviteFullName.trim() || null,
          password: invitePassword,
        }),
      })
      setInviteEmail('')
      setInviteFullName('')
      setInvitePassword('')
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось пригласить')
    } finally {
      setBusy(false)
    }
  }

  function openEditForJob(j: ScheduleItem) {
    setEditJobId(j.id)
    setEditJobSiteId(j.site_id || '')
    setEditWorkerId(j.worker_id || '')
    setEditDate(j.job_date || toISODate(new Date()))
    setEditTime(timeHHMM(j.scheduled_time))
    setEditStatus((j.status || 'planned') as JobStatus)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!editJobId) return
    if (!editDate || !editTime) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/jobs/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: editJobId,
          job_date: editDate,
          scheduled_time: editTime,
          worker_id: editWorkerId || null,
          site_id: editJobSiteId || null,
          status: editStatus || null,
        }),
      })
      setEditOpen(false)
      await refreshSchedule()
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
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

  async function createJobs() {
    if (!newSiteId || newWorkers.length === 0 || !newDate || !newTime) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: newSiteId, worker_ids: newWorkers, job_date: newDate, scheduled_time: newTime }),
      })
      setNewWorkers([])
      setJobsView('table')
      await refreshSchedule()
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать смену')
    } finally {
      setBusy(false)
    }
  }

  function dragSet(e: React.DragEvent, payload: DragPayload) {
    try {
      e.dataTransfer.setData('application/json', JSON.stringify(payload))
    } catch {}
    e.dataTransfer.setData('text/plain', payload.job_id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function dragGet(e: React.DragEvent): DragPayload | null {
    const raw = e.dataTransfer.getData('application/json')
    if (raw) {
      try {
        const x = JSON.parse(raw)
        if (x?.job_id) return { job_id: String(x.job_id) }
      } catch {}
    }
    const id = e.dataTransfer.getData('text/plain')
    if (id) return { job_id: id }
    return null
  }

  async function moveJob(jobId: string, patch: { job_date?: string; scheduled_time?: string; worker_id?: string | null; site_id?: string | null }) {
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/jobs/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, ...patch }),
      })
      await refreshSchedule()
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось перенести')
    } finally {
      setBusy(false)
    }
  }

  async function cancelJob(jobId: string) {
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/jobs/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      setCancelOpen(false)
      await refreshSchedule()
    } catch (e: any) {
      setError(e?.message || 'Не удалось отменить')
    } finally {
      setBusy(false)
    }
  }

  async function moveDay() {
    if (!moveDayFromWorker || !moveDayToWorker || !moveDayDate) return
    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/jobs/move-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_worker_id: moveDayFromWorker,
          to_worker_id: moveDayToWorker,
          job_date: moveDayDate,
          only_planned: moveDayOnlyPlanned,
        }),
      })
      setMoveDayOpen(false)
      await refreshSchedule()
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось перенести день')
    } finally {
      setBusy(false)
    }
  }

  function jobsInCell(args: { entityId: string; dateISO: string; hour?: string }) {
    const { entityId, dateISO, hour } = args
    return schedule
      .filter((j) => {
        if ((j.job_date || '') !== dateISO) return false
        if (planMode === 'workers') {
          if ((j.worker_id || '') !== entityId) return false
        } else {
          if ((j.site_id || '') !== entityId) return false
        }
        if (hour) {
          const hh = timeHHMM(j.scheduled_time)
          if (hh === '—') return false
          if (hh.slice(0, 2) !== hour.slice(0, 2)) return false
        }
        return true
      })
      .sort((a, b) => timeHHMM(a.scheduled_time).localeCompare(timeHHMM(b.scheduled_time)))
  }

  function jobCard(j: ScheduleItem, compact: boolean) {
    const left = planMode === 'workers' ? (j.site_name || 'Объект') : (j.worker_name || 'Работник')
    const right = `${timeHHMM(j.scheduled_time)} • ${statusRu(String(j.status || ''))}`
    return (
      <div
        key={j.id}
        draggable
        onDragStart={(e) => dragSet(e, { job_id: j.id })}
        onClick={() => openEditForJob(j)}
        className={cn(
          'group cursor-pointer select-none rounded-2xl border bg-black/35 px-3 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.55)]',
          'border-yellow-400/15 hover:border-yellow-300/40',
          compact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-yellow-100">{left}</div>
            <div className="mt-0.5 text-zinc-300">{right}</div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setCancelJobId(j.id)
                setCancelOpen(true)
              }}
              className="rounded-xl border border-yellow-400/10 bg-black/25 px-2 py-1 text-[10px] text-zinc-200 hover:border-yellow-300/30"
            >
              отменить
            </button>

            {planMode === 'workers' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMoveJobId(j.id)
                  setMoveJobTargetWorker(j.worker_id || '')
                  setMoveJobOpen(true)
                }}
                className="rounded-xl border border-yellow-400/10 bg-black/25 px-2 py-1 text-[10px] text-zinc-200 hover:border-yellow-300/30"
              >
                перенести
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  function PlanToolbar() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-yellow-400/15 bg-black/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setPlanView('day')
              recalcRange('day', anchorDate)
            }}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planView === 'day'
                ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            День
          </button>
          <button
            onClick={() => {
              setPlanView('week')
              recalcRange('week', anchorDate)
            }}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planView === 'week'
                ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            Неделя
          </button>
          <button
            onClick={() => {
              setPlanView('month')
              recalcRange('month', anchorDate)
            }}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planView === 'month'
                ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            Месяц
          </button>

          <div className="mx-2 h-7 w-px bg-yellow-400/10" />

          <button
            onClick={() => setPlanMode('workers')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planMode === 'workers'
                ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            По работникам
          </button>
          <button
            onClick={() => setPlanMode('sites')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planMode === 'sites'
                ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            По объектам
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Дата</span>
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => {
                const v = e.target.value
                setAnchorDate(v)
                recalcRange(planView, v)
              }}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none transition focus:border-yellow-300/60"
            />
          </label>

          <button
            onClick={() => {
              const t = toISODate(new Date())
              setAnchorDate(t)
              recalcRange(planView, t)
            }}
            className="mt-5 rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
          >
            Сегодня
          </button>

          <button
            onClick={() => {
              setMoveDayFromWorker('')
              setMoveDayToWorker('')
              setMoveDayDate(dateFrom)
              setMoveDayOnlyPlanned(true)
              setMoveDayOpen(true)
            }}
            className="mt-5 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70"
          >
            Перенести день
          </button>
        </div>
      </div>
    )
  }

  function PlanWeekGrid() {
    return (
      <div className="mt-4 overflow-auto rounded-3xl border border-yellow-400/15 bg-black/15">
        <div className="min-w-[980px]">
          <div className="grid" style={{ gridTemplateColumns: `320px repeat(${planDates.length}, minmax(220px, 1fr))` }}>
            <div className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-4 py-3 text-xs font-semibold text-zinc-200">
              {planMode === 'workers' ? 'Работник' : 'Объект'}
            </div>

            {planDates.map((d) => (
              <div key={d.iso} className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-4 py-3 text-xs font-semibold text-zinc-200">
                <div className="flex items-center justify-between">
                  <span>
                    {d.dow} • {d.label}
                  </span>
                  <span className="text-[11px] text-zinc-400">{fmtD(d.iso)}</span>
                </div>
              </div>
            ))}

            {planEntities.map((ent) => (
              <div key={ent.id} className="contents">
                <div className="border-b border-yellow-400/10 bg-black/10 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-yellow-100">{ent.name}</div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        {planMode === 'workers'
                          ? `Объекты: ${(workerSites.get(ent.id) || []).length}`
                          : `Назначены: ${(siteWorkers.get(ent.id) || []).filter((w) => (w.role || '') !== 'admin').length}`}
                      </div>
                    </div>

                    {planMode === 'workers' ? (
                      <button
                        onClick={() => openWorkerCard(ent.id)}
                        className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-[11px] text-zinc-200 hover:border-yellow-300/40"
                      >
                        карточка
                      </button>
                    ) : null}
                  </div>
                </div>

                {planDates.map((d) => (
                  <div
                    key={ent.id + '|' + d.iso}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const p = dragGet(e)
                      if (!p) return
                      const job = schedule.find((x) => x.id === p.job_id)
                      if (!job) return
                      const patch: any = { job_date: d.iso }
                      if (planMode === 'workers') patch.worker_id = ent.id
                      else patch.site_id = ent.id
                      void moveJob(p.job_id, patch)
                    }}
                    className="border-b border-yellow-400/10 bg-black/5 px-3 py-3"
                  >
                    <div className="grid gap-2">
                      {jobsInCell({ entityId: ent.id, dateISO: d.iso }).map((j) => jobCard(j, true))}
                      <div className="rounded-2xl border border-dashed border-yellow-400/10 bg-black/10 px-3 py-2 text-[11px] text-zinc-500">
                        перетащи сюда
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function PlanDayGrid() {
    const dayISO = dateFrom
    return (
      <div className="mt-4 overflow-auto rounded-3xl border border-yellow-400/15 bg-black/15">
        <div className="min-w-[980px]">
          <div className="grid" style={{ gridTemplateColumns: `100px repeat(${planEntities.length}, minmax(220px, 1fr))` }}>
            <div className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-3 py-3 text-xs font-semibold text-zinc-200">
              Время
            </div>

            {planEntities.map((ent) => (
              <div key={ent.id} className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-yellow-100">{ent.name}</div>
                    <div className="text-[10px] text-zinc-400">{fmtD(dayISO)}</div>
                  </div>

                  {planMode === 'workers' ? (
                    <button
                      onClick={() => openWorkerCard(ent.id)}
                      className="rounded-xl border border-yellow-400/10 bg-black/25 px-2 py-1 text-[10px] text-zinc-200 hover:border-yellow-300/30"
                    >
                      карточка
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {hours.map((h) => (
              <div key={h} className="contents">
                <div className="border-b border-yellow-400/10 bg-black/10 px-3 py-3 text-[11px] font-semibold text-zinc-300">{h}</div>

                {planEntities.map((ent) => (
                  <div
                    key={ent.id + '|' + h}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const p = dragGet(e)
                      if (!p) return
                      const job = schedule.find((x) => x.id === p.job_id)
                      if (!job) return
                      const patch: any = { job_date: dayISO, scheduled_time: h }
                      if (planMode === 'workers') patch.worker_id = ent.id
                      else patch.site_id = ent.id
                      void moveJob(p.job_id, patch)
                    }}
                    className="border-b border-yellow-400/10 bg-black/5 px-2 py-2"
                  >
                    <div className="grid gap-2">
                      {jobsInCell({ entityId: ent.id, dateISO: dayISO, hour: h }).map((j) => jobCard(j, true))}
                      <div className="rounded-2xl border border-dashed border-yellow-400/10 bg-black/10 px-3 py-2 text-[11px] text-zinc-500">
                        перетащи сюда
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function PlanMonthGrid() {
    const from = new Date(dateFrom + 'T00:00:00')
    const to = new Date(dateTo + 'T00:00:00')
    const first = new Date(from.getFullYear(), from.getMonth(), 1)
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate())

    const start = startOfWeek(first)
    const end = endOfWeek(last)
    const days = enumerateDates(toISODate(start), toISODate(end))

    return (
      <div className="mt-4 overflow-auto rounded-3xl border border-yellow-400/15 bg-black/15">
        <div className="min-w-[980px] p-4">
          <div className="grid grid-cols-7 gap-3">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d} className="text-xs font-semibold text-zinc-300">
                {d}
              </div>
            ))}

            {days.map((d) => {
              const inMonth = d.iso >= dateFrom && d.iso <= dateTo
              return (
                <div
                  key={d.iso}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const p = dragGet(e)
                    if (!p) return
                    void moveJob(p.job_id, { job_date: d.iso })
                  }}
                  className={cn(
                    'min-h-[140px] rounded-3xl border p-3',
                    inMonth ? 'border-yellow-400/12 bg-black/20' : 'border-yellow-400/8 bg-black/10 opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-yellow-100">
                      {d.label} <span className="text-zinc-500">({d.dow})</span>
                    </div>
                    <div className="text-[10px] text-zinc-400">{fmtD(d.iso)}</div>
                  </div>

                  <div className="mt-2 grid gap-2">
                    {schedule
                      .filter((j) => (j.job_date || '') === d.iso)
                      .sort((a, b) => timeHHMM(a.scheduled_time).localeCompare(timeHHMM(b.scheduled_time)))
                      .slice(0, 3)
                      .map((j) => jobCard(j, true))}

                    {schedule.filter((j) => (j.job_date || '') === d.iso).length > 3 ? (
                      <div className="rounded-2xl border border-yellow-400/10 bg-black/15 px-3 py-2 text-[11px] text-zinc-400">
                        ещё {schedule.filter((j) => (j.job_date || '') === d.iso).length - 3}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-dashed border-yellow-400/10 bg-black/10 px-3 py-2 text-[11px] text-zinc-500">
                      перетащи сюда
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (sessionLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-6xl px-4 py-10">
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
              <div className="text-xs text-yellow-200/70">Tanija • объекты • работники • смены • график</div>
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
              <div className="text-xs text-yellow-200/70">Tanija • объекты • работники • смены • график</div>
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
                    tab === k
                      ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100'
                      : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
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
                Объекты: {sites.length} • Работники: {workers.length} • Смены: {schedule.length}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}

          {tab === 'sites' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">Объекты</div>
                    <div className="mt-1 text-xs text-zinc-300">Карточка, категории, OSM-миникарта, фото (до 5), адрес и заметки.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setSiteCreateOpen(true)}
                      disabled={busy}
                      className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 disabled:opacity-60"
                    >
                      Добавить объект
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-yellow-400/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold text-yellow-100">Быстрое назначение</div>
                  <div className="mt-1 text-xs text-zinc-300">Назначение = доступ к объекту. Расписание делай во вкладках “Смены” / “График”.</div>

                  <div className="mt-4 flex flex-wrap items-end gap-2">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Объект</span>
                      <select
                        value={qaSite}
                        onChange={(e) => setQaSite(e.target.value)}
                        className="w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">Выбери объект…</option>
                        {activeSites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name || s.id}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Работник</span>
                      <select
                        value={qaWorker}
                        onChange={(e) => setQaWorker(e.target.value)}
                        className="w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">Выбери работника…</option>
                        {workersForSelect.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.full_name || w.email || 'Работник'}
                          </option>
                        ))}
                      </select>
                    </label>

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

              <div className="grid gap-3">
                {sites
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((s) => {
                    const archived = !!s.archived_at
                    const assigned = (siteWorkers.get(s.id) || []).filter((w) => (w.role || '') !== 'admin')
                    const photos = Array.isArray(s.photos) ? s.photos : []
                    const primary = photos[0]?.url || null
                    const meta = siteCategoryMeta(s.category ?? null)

                    return (
                      <div key={s.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-yellow-400/15 bg-black/20">
                              {primary ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={primary} alt="photo" className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[11px] text-zinc-500">фото</div>
                              )}
                              <span className={cn('absolute left-2 top-2 h-3 w-3 rounded-full ring-2 ring-black/50', meta.dotClass)} />
                            </div>

                            <div className="min-w-0">
                              <div className="text-base font-semibold text-yellow-100">
                                {s.name || 'Объект'}{' '}
                                {archived ? (
                                  <span className="ml-2 rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">в архиве</span>
                                ) : (
                                  <span className="ml-2 rounded-xl border border-yellow-300/40 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">активен</span>
                                )}
                              </div>

                              <div className="mt-1 text-xs text-zinc-300">{s.address || '—'}</div>

                              {s.notes ? <div className="mt-2 line-clamp-2 max-w-[720px] text-[11px] text-zinc-400">{s.notes}</div> : null}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <Pill>
                                  {meta.label} {s.category ? `(#${s.category})` : ''}
                                </Pill>
                                <Pill>radius: {s.radius ?? 150}м</Pill>
                                <Pill>
                                  lat/lng: {s.lat ?? '—'}/{s.lng ?? '—'}
                                </Pill>
                                <Pill>фото: {photos.length}/5</Pill>
                              </div>

                              <div className="mt-3 text-xs text-zinc-300">Назначены:</div>
                              {assigned.length === 0 ? (
                                <div className="mt-1 text-xs text-zinc-500">—</div>
                              ) : (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {assigned.map((w) => (
                                    <div key={w.id} className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs">
                                      <span className="text-zinc-100">{w.full_name || w.email || 'Работник'}</span>
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
                          </div>

                          <div className="flex flex-col items-end gap-3">
                            <div className="flex flex-wrap items-start justify-end gap-3">
                              <div className="grid gap-2">
                                <CategoryPicker value={s.category ?? null} disabled={busy} onChange={(v) => void setSiteCategoryQuick(s.id, v)} />

                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    onClick={() => openEditSite(s)}
                                    disabled={busy}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-zinc-200 hover:border-yellow-300/40 disabled:opacity-60"
                                  >
                                    Карточка
                                  </button>

                                  <button
                                    onClick={() => void deleteSite(s.id)}
                                    disabled={busy}
                                    className="rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100/90 hover:border-red-400/45 disabled:opacity-60"
                                  >
                                    Удалить
                                  </button>

                                  <button
                                    onClick={() => {
                                      navigator.clipboard?.writeText(s.id)
                                      setError('ID скопирован')
                                      setTimeout(() => setError(null), 900)
                                    }}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-zinc-200 hover:border-yellow-300/40"
                                  >
                                    ID
                                  </button>
                                </div>
                              </div>

                              <div className="grid gap-2">
                                <MapMini
                                  lat={s.lat ?? null}
                                  lng={s.lng ?? null}
                                  onClick={() => {
                                    if (s.lat == null || s.lng == null) return
                                    window.open(googleNavUrl(s.lat, s.lng), '_blank', 'noopener,noreferrer')
                                  }}
                                />
                                {s.lat != null && s.lng != null ? (
                                  <div className="flex items-center justify-end gap-2 text-[11px] text-zinc-300">
                                    <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={googleNavUrl(s.lat, s.lng)} target="_blank" rel="noreferrer">
                                      Google
                                    </a>
                                    <span className="text-zinc-600">•</span>
                                    <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={appleNavUrl(s.lat, s.lng)} target="_blank" rel="noreferrer">
                                      Apple
                                    </a>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <button
                              onClick={() => setArchived(s.id, !archived)}
                              disabled={busy}
                              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                            >
                              {archived ? 'Вернуть из архива' : 'В архив'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ) : null}

          {tab === 'plan' ? (
            <div className="mt-6">
              <PlanToolbar />
              {planView === 'week' ? <PlanWeekGrid /> : null}
              {planView === 'day' ? <PlanDayGrid /> : null}
              {planView === 'month' ? <PlanMonthGrid /> : null}
            </div>
          ) : null}

          {/* Остальные вкладки (workers/jobs) оставлены без изменений в логике;
              они завязаны на существующие /api/admin/workers/* /api/admin/jobs/* /api/admin/schedule эндпоинты. */}
        </div>
      </div>

      <Modal open={siteCreateOpen} title="Добавить объект" onClose={() => setSiteCreateOpen(false)} maxW="max-w-3xl">
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Название</span>
            <input
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              placeholder="Например: Квартира 12"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Адрес</span>
            <input
              value={newSiteAddress}
              onChange={(e) => setNewSiteAddress(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              placeholder="Улица, дом, город"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Радиус (м)</span>
              <input
                value={newSiteRadius}
                onChange={(e) => setNewSiteRadius(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                placeholder="150"
              />
            </label>

            <div className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Категория</span>
              <CategoryPicker value={newSiteCategory} onChange={setNewSiteCategory} disabled={busy} />
            </div>
          </div>

          <label className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Заметки</span>
            <textarea
              value={newSiteNotes}
              onChange={(e) => setNewSiteNotes(e.target.value)}
              className="min-h-[120px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-yellow-300/60"
              placeholder="Коды, инструкции, доступ…"
            />
          </label>

          <button
            onClick={createSite}
            disabled={busy || !newSiteName.trim()}
            className="mt-2 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
          >
            Создать
          </button>
        </div>
      </Modal>

      <Modal open={siteEditOpen} title="Карточка объекта" onClose={() => setSiteEditOpen(false)} maxW="max-w-5xl">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Название</span>
              <input
                value={editSiteName}
                onChange={(e) => setEditSiteName(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Адрес</span>
              <input
                value={editSiteAddress}
                onChange={(e) => setEditSiteAddress(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[11px] text-zinc-300">Радиус (м)</span>
                <input
                  value={editSiteRadius}
                  onChange={(e) => setEditSiteRadius(e.target.value)}
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                />
              </label>

              <div className="grid gap-1">
                <span className="text-[11px] text-zinc-300">Категория</span>
                <CategoryPicker value={editSiteCategory} onChange={setEditSiteCategory} disabled={busy} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[11px] text-zinc-300">Широта (lat)</span>
                <input
                  value={editSiteLat}
                  onChange={(e) => setEditSiteLat(e.target.value)}
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="52.3702"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[11px] text-zinc-300">Долгота (lng)</span>
                <input
                  value={editSiteLng}
                  onChange={(e) => setEditSiteLng(e.target.value)}
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="4.8952"
                />
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Заметки</span>
              <textarea
                value={editSiteNotes}
                onChange={(e) => setEditSiteNotes(e.target.value)}
                className="min-h-[160px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm text-zinc-100 outline-none transition focus:border-yellow-300/60"
                placeholder="Коды, инструкции, ключи…"
              />
            </label>

            <button
              onClick={() => void saveEditSite()}
              disabled={busy || !editSiteId || !editSiteName.trim()}
              className="mt-1 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
            >
              Сохранить
            </button>
          </div>

          <div className="grid gap-3 rounded-3xl border border-yellow-400/10 bg-black/20 p-4">
            <div className="text-sm font-semibold text-yellow-100">Мини-карта (OSM)</div>

            <div className="grid gap-2">
              {(() => {
                const lat = editSiteLat === '' ? null : Number(editSiteLat)
                const lng = editSiteLng === '' ? null : Number(editSiteLng)
                if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
                  return (
                    <div className="flex h-[180px] items-center justify-center rounded-2xl border border-yellow-400/10 bg-black/20 text-xs text-zinc-400">
                      Укажи lat/lng и сохрани
                    </div>
                  )
                }
                return <MapLarge lat={lat} lng={lng} />
              })()}
            </div>

            <div className="mt-2 text-sm font-semibold text-yellow-100">Фото (до 5)</div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-zinc-300">Сейчас: {editSitePhotos.length}/5</div>

                <div className="flex flex-wrap gap-2">
                  <label
                    className={cn(
                      'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-zinc-200 hover:border-yellow-300/40',
                      photoBusy || !editSiteId || editSitePhotos.length >= 5 ? 'opacity-60' : ''
                    )}
                  >
                    Загрузить фото
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={photoBusy || !editSiteId || editSitePhotos.length >= 5}
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files
                        e.target.value = ''
                        if (!editSiteId) return
                        await uploadSitePhotos(editSiteId, files)
                      }}
                    />
                  </label>

                  <label
                    className={cn(
                      'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70',
                      photoBusy || !editSiteId || editSitePhotos.length >= 5 ? 'opacity-60' : ''
                    )}
                  >
                    Сделать фото
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={photoBusy || !editSiteId || editSitePhotos.length >= 5}
                      className="hidden"
                      onChange={async (e) => {
                        const files = e.target.files
                        e.target.value = ''
                        if (!editSiteId) return
                        await uploadSitePhotos(editSiteId, files)
                      }}
                    />
                  </label>
                </div>
              </div>

              {editSitePhotos.length === 0 ? (
                <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-zinc-400">Фото нет</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {editSitePhotos.map((p, idx) => (
                    <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="site" className="h-36 w-full object-cover" loading="lazy" />

                      <div className="absolute left-2 top-2 rounded-xl border border-yellow-400/15 bg-black/50 px-2 py-1 text-[11px] text-zinc-200">
                        {idx === 0 ? 'главное' : ''}
                      </div>

                      <div className="absolute right-2 top-2 flex gap-2">
                        {idx !== 0 ? (
                          <button
                            onClick={() => {
                              if (!editSiteId) return
                              void makePrimaryPhoto(editSiteId, p.path)
                            }}
                            disabled={photoBusy || !editSiteId}
                            className={cn(
                              'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-2 py-1 text-[11px] font-semibold text-yellow-100',
                              photoBusy ? 'opacity-60' : 'hover:border-yellow-200/70'
                            )}
                          >
                            Главное
                          </button>
                        ) : null}

                        <button
                          onClick={() => {
                            if (!editSiteId) return
                            void removeSitePhoto(editSiteId, p.path)
                          }}
                          disabled={photoBusy || !editSiteId}
                          className={cn(
                            'rounded-xl border border-red-500/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-100/90',
                            photoBusy ? 'opacity-60' : 'hover:border-red-400/45'
                          )}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {photoBusy ? <div className="text-xs text-zinc-400">Обработка…</div> : null}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={editOpen} title="Правка смены" onClose={() => setEditOpen(false)} maxW="max-w-2xl">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Объект</span>
            <select
              value={editJobSiteId}
              onChange={(e) => setEditJobSiteId(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">—</option>
              {activeSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Работник</span>
            <select
              value={editWorkerId}
              onChange={(e) => setEditWorkerId(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">—</option>
              {workersForSelect.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || w.email || 'Работник'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Дата</span>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Время</span>
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
          </div>

          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Статус</span>
            <select
              value={String(editStatus)}
              onChange={(e) => setEditStatus(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="planned">Запланировано</option>
              <option value="in_progress">В процессе</option>
              <option value="done">Завершено</option>
              <option value="cancelled">Отменено</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => {
                if (!editJobId) return
                setCancelJobId(editJobId)
                setCancelOpen(true)
              }}
              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
            >
              Отменить смену
            </button>

            <button
              onClick={saveEdit}
              disabled={busy || !editJobId}
              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
            >
              Сохранить
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={moveJobOpen} title="Перенести смену" onClose={() => setMoveJobOpen(false)} maxW="max-w-2xl">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Кому перенести</span>
            <select
              value={moveJobTargetWorker}
              onChange={(e) => setMoveJobTargetWorker(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">Выбери работника…</option>
              {workersForSelect.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || w.email || 'Работник'}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              if (!moveJobId || !moveJobTargetWorker) return
              void moveJob(moveJobId, { worker_id: moveJobTargetWorker })
              setMoveJobOpen(false)
            }}
            disabled={busy || !moveJobId || !moveJobTargetWorker}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            Перенести
          </button>
        </div>
      </Modal>

      <Modal open={moveDayOpen} title="Перенести день" onClose={() => setMoveDayOpen(false)} maxW="max-w-2xl">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Дата</span>
            <input
              type="date"
              value={moveDayDate}
              onChange={(e) => setMoveDayDate(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">С кого</span>
              <select
                value={moveDayFromWorker}
                onChange={(e) => setMoveDayFromWorker(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              >
                <option value="">Выбери работника…</option>
                {workersForSelect.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name || w.email || 'Работник'}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">На кого</span>
              <select
                value={moveDayToWorker}
                onChange={(e) => setMoveDayToWorker(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              >
                <option value="">Выбери работника…</option>
                {workersForSelect.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name || w.email || 'Работник'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-zinc-200">
            <input
              type="checkbox"
              checked={moveDayOnlyPlanned}
              onChange={(e) => setMoveDayOnlyPlanned(e.target.checked)}
              className="h-4 w-4 accent-yellow-400"
            />
            Переносить только “Запланировано”
          </label>

          <button
            onClick={moveDay}
            disabled={busy || !moveDayFromWorker || !moveDayToWorker || !moveDayDate}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            Перенести день
          </button>
        </div>
      </Modal>

      <Modal open={cancelOpen} title="Отмена смены" onClose={() => setCancelOpen(false)} maxW="max-w-2xl">
        <div className="grid gap-3">
          <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">
            Это поставит статус “Отменено”.
          </div>

          <button
            onClick={() => cancelJob(cancelJobId)}
            disabled={busy || !cancelJobId}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            Отменить
          </button>
        </div>
      </Modal>
    </main>
  )
}

