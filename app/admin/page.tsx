'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TabKey = 'sites' | 'workers' | 'jobs' | 'plan'
type JobsView = 'board' | 'table'
type PlanView = 'day' | 'week' | 'month'
type PlanMode = 'workers' | 'sites'

type SitePhoto = { path: string; url?: string; created_at?: string | null }

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
}

type Assignment = {
  site_id: string
  worker_id: string
}

type JobStatus = 'planned' | 'in_progress' | 'done' | 'cancelled' | string

type ScheduleItem = {
  id: string
  status: JobStatus
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

function timeRangeHHMM(from?: string | null, to?: string | null) {
  const a = timeHHMM(from)
  const b = timeHHMM(to)
  if (a === '—') return a
  if (b && b !== '—') return `${a}–${b}`
  return a
}

function statusRu(s: string) {
  if (s === 'planned') return 'Запланировано'
  if (s === 'in_progress') return 'В процессе'
  if (s === 'done') return 'Завершено'
  if (s === 'cancelled') return 'Отменено'
  return s || '—'
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
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

async function getAccessToken(): Promise<string> {
  const s1 = await supabase.auth.getSession()
  const t1 = s1?.data?.session?.access_token
  if (t1) return t1

  // Иногда сессия ещё не гидратировалась или токен протух — пробуем refresh 1 раз
  const s2 = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } } as any))
  const t2 = (s2 as any)?.data?.session?.access_token
  if (t2) return t2

  throw new Error('Сессия не найдена или истекла. Перелогинься в админке.')
}

async function authFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController()
  const ms = 15000
  const t = setTimeout(() => ctrl.abort(), ms)

  try {
    let token = await getAccessToken()

    const attempt = async (tok: string) => {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${tok}`,
        },
        cache: 'no-store',
        signal: ctrl.signal,
      })

      const payload = await res.json().catch(() => ({} as any))
      return { res, payload }
    }

    let out = await attempt(token)

    // Если словили 401/403 — часто это просто протухший access_token.
    // Пытаемся refresh + retry один раз.
    if (!out.res.ok && (out.res.status === 401 || out.res.status === 403)) {
      const s2 = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } } as any))
      const token2 = (s2 as any)?.data?.session?.access_token
      if (token2 && token2 !== token) {
        token = token2
        out = await attempt(token)
      }
    }

    if (!out.res.ok) throw new Error(out.payload?.error || `HTTP ${out.res.status}`)
    return out.payload as T
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('Таймаут запроса (15с). Нажми “Обновить данные” ещё раз.')
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}
function Modal(props: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 py-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={props.onClose} />
      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-yellow-400/20 bg-zinc-950/90 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.75)] max-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-yellow-100">{props.title}</div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
          >
            Закрыть
          </button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto pr-1">{props.children}</div>
      </div>
    </div>
  )
}


function Pill({ children }: { children: any }) {
  return (
    <span className="inline-flex items-center rounded-full border border-yellow-400/15 bg-yellow-400/5 px-2 py-0.5 text-[11px] text-yellow-100/70">
      {children}
    </span>
  )
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
  { id: 13, label: 'Категория 13', dotClass: 'bg-red-400' },
  { id: 14, label: 'Категория 14', dotClass: 'bg-purple-400' },
  { id: 15, label: 'Категория 15', dotClass: 'bg-green-400' },
]

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
          'flex items-center gap-2 rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/80',
          props.disabled ? 'opacity-70' : 'hover:border-yellow-300/40'
        )}
      >
        <span className={cn('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', meta.dotClass)} />
        <span className="font-semibold">{props.value ? `#${props.value}` : '—'}</span>
        <span className="hidden sm:inline text-yellow-100/55">{meta.label}</span>
        <span className="ml-1 text-yellow-100/35">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-yellow-400/15 bg-zinc-950 shadow-2xl">
          <button
            onClick={() => {
              props.onChange(null)
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-yellow-100/70 hover:bg-yellow-400/5"
          >
            <span className={cn('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', 'bg-zinc-500')} />
            <span className="font-semibold">—</span>
            <span>Без категории</span>
          </button>
          <div className="h-px bg-yellow-400/10" />
          {SITE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                props.onChange(c.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-yellow-100/80 hover:bg-yellow-400/5"
            >
              <span className={cn('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', c.dotClass)} />
              <span className="font-semibold">#{c.id}</span>
              <span className="text-yellow-100/60">{c.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MapMini(props: { lat: number | null; lng: number | null; onClick: () => void }) {
  const { lat, lng } = props
  if (lat == null || lng == null) {
    return (
      <div className="flex h-[92px] w-[150px] items-center justify-center rounded-2xl border border-yellow-400/10 bg-black/20 text-[11px] text-yellow-100/40">
        Нет координат
      </div>
    )
  }

  return (
    <div className="relative h-[92px] w-[150px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(lat, lng, 0.004)} className="h-full w-full" loading="lazy" />
      <button onClick={props.onClick} className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" title="Открыть навигацию" />
      <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">Навигация</div>
    </div>
  )
}

function MapLarge(props: { lat: number; lng: number }) {
  const { lat, lng } = props
  return (
    <div className="relative h-[180px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(lat, lng, 0.01)} className="h-full w-full" loading="lazy" />
      <button
        onClick={() => window.open(googleNavUrl(lat, lng), '_blank', 'noopener,noreferrer')}
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

type DragPayload = {
  job_id: string
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('jobs')

  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [busySeq, setBusySeq] = useState(0)
  const refreshSeqRef = useRef(0)
  const [error, setError] = useState<string | null>(null)

  // Safety-net: если UI залип на "Обновляю…" — отпускаем кнопку и показываем ошибку
  // Важно: учитываем "поколение" обновления, чтобы не стрелять в ногу при параллельных refresh.
  useEffect(() => {
    if (!busy) return
    const seq = busySeq
    const t = window.setTimeout(() => {
      if (refreshSeqRef.current !== seq) return
      setBusy(false)
      setError('Обновление зависло. Обычно это сеть/таймаут. Нажми “Обновить данные” ещё раз.')
    }, 25000)
    return () => window.clearTimeout(t)
  }, [busy, busySeq])

  const [showArchivedSites, setShowArchivedSites] = useState(false)

  const [photoBusy, setPhotoBusy] = useState(false)

  const [siteCreateOpen, setSiteCreateOpen] = useState(false)
  const [newObjName, setNewObjName] = useState('')
  const [newObjAddress, setNewObjAddress] = useState('')
  const [newObjRadius, setNewObjRadius] = useState('150')
  const [newObjCategory, setNewObjCategory] = useState<number | null>(null)
  const [newObjNotes, setNewObjNotes] = useState('')

  const [siteCardOpen, setSiteCardOpen] = useState(false)
  const [siteCardId, setSiteCardId] = useState<string | null>(null)
  const [siteCardName, setSiteCardName] = useState('')
  const [siteCardAddress, setSiteCardAddress] = useState('')
  const [siteCardRadius, setSiteCardRadius] = useState('150')
  const [siteCardCategory, setSiteCardCategory] = useState<number | null>(null)
  const [siteCardLat, setSiteCardLat] = useState('')
  const [siteCardLng, setSiteCardLng] = useState('')
  const [siteCardNotes, setSiteCardNotes] = useState('')
  const [siteCardPhotos, setSiteCardPhotos] = useState<SitePhoto[]>([])


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

  const [newSiteId, setNewSiteId] = useState<string>('')
  const [newWorkers, setNewWorkers] = useState<string[]>([])
  const [newDate, setNewDate] = useState<string>(toISODate(new Date()))
  const [newTime, setNewTime] = useState<string>('09:00')

    const [newTimeTo, setNewTimeTo] = useState<string>('')
const [editOpen, setEditOpen] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [editSiteId, setEditSiteId] = useState<string>('')
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

  const workersForPicker = useMemo(() => workersForSelect.map((w) => ({ id: w.id, name: w.full_name || 'Работник' })), [workersForSelect])

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
      return workersForSelect.map((w) => ({ id: w.id, name: w.full_name || 'Работник' }))
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
    const seq = ++refreshSeqRef.current
    setBusySeq(seq)
    setBusy(true)
    setError(null)
    try {
      // Раньше было последовательно (core -> schedule) и в сумме могло переваливать за safety-net.
      // Параллелим: максимум = один таймаут fetch, а не два подряд.
      await Promise.all([refreshCore(), refreshSchedule()])
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки')
    } finally {
      if (seq === refreshSeqRef.current) setBusy(false)
    }
  }

  async function boot() {
    setSessionLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token ?? null
      setSessionToken(token)
      setMeId(data?.session?.user?.id ?? null)

      if (token) await refreshAll()
    } catch {
      setSessionToken(null)
      setMeId(null)
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

      setMeId(newSession?.user?.id ?? null)

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


  function fillSiteCardFromSite(s: Site) {
    setSiteCardId(s.id)
    setSiteCardName(String(s.name || ''))
    setSiteCardAddress(String(s.address || ''))
    setSiteCardRadius(String(s.radius ?? 150))
    setSiteCardCategory(s.category ?? null)
    setSiteCardLat(s.lat == null ? '' : String(s.lat))
    setSiteCardLng(s.lng == null ? '' : String(s.lng))
    setSiteCardNotes(String(s.notes || ''))
    setSiteCardPhotos(Array.isArray(s.photos) ? (s.photos as any) : [])
  }

  function applySiteUpdate(next: Site) {
    setSites((prev) => {
      const idx = prev.findIndex((x) => x.id === next.id)
      if (idx < 0) return [next, ...prev]
      const copy = prev.slice()
      copy[idx] = next
      return copy
    })

    if (siteCardId === next.id) {
      fillSiteCardFromSite(next)
    }
  }

  function openSiteCard(s: Site) {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    fillSiteCardFromSite(s)
    setSiteCardOpen(true)
  }

  async function createObjectSite() {
    const name = newObjName.trim()
    if (!name) return

    const radiusNum = Number(newObjRadius)
    const radius = Number.isFinite(radiusNum) ? radiusNum : 150

    setBusy(true)
    setError(null)
    try {
      await authFetchJson<{ site: Site }>('/api/admin/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address: newObjAddress.trim() || null,
          radius,
          category: newObjCategory,
          notes: newObjNotes || null,
        }),
      })

      setSiteCreateOpen(false)
      setNewObjName('')
      setNewObjAddress('')
      setNewObjRadius('150')
      setNewObjCategory(null)
      setNewObjNotes('')

      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось создать объект')
    } finally {
      setBusy(false)
    }
  }

  async function saveSiteCard() {
    if (!siteCardId) return
    const name = siteCardName.trim()
    if (!name) return

    const radiusNum = Number(siteCardRadius)
    const radius = Number.isFinite(radiusNum) ? radiusNum : 150

    const latNum = siteCardLat.trim() === '' ? null : Number(siteCardLat)
    const lngNum = siteCardLng.trim() === '' ? null : Number(siteCardLng)

    const lat = latNum != null && Number.isFinite(latNum) ? latNum : null
    const lng = lngNum != null && Number.isFinite(lngNum) ? lngNum : null

    setBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteCardId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address: siteCardAddress.trim() || null,
          radius,
          lat,
          lng,
          category: siteCardCategory,
          notes: siteCardNotes || null,
        }),
      })

      if (res?.site) applySiteUpdate(res.site)
      setSiteCardOpen(false)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось сохранить объект')
    } finally {
      setBusy(false)
    }
  }

  async function deleteObjectSite(siteId: string) {
    const ok = window.confirm('Удалить объект? Это действие нельзя отменить.')
    if (!ok) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson(`/api/admin/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' })
      if (siteCardId === siteId) setSiteCardOpen(false)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить объект')
    } finally {
      setBusy(false)
    }
  }

  async function setSiteCategoryQuick(siteId: string, category: number | null) {
    setBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      })
      if (res?.site) applySiteUpdate(res.site)
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
      const current = (siteCardId === siteId ? siteCardPhotos.length : (sitesById.get(siteId)?.photos || []).length) || 0
      const left = Math.max(0, 5 - current)
      const toUpload = Array.from(files).slice(0, left)

      for (const f of toUpload) {
        const fd = new FormData()
        fd.append('file', f)
        const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}/photos`, {
          method: 'POST',
          body: fd,
        })
        if (res?.site) applySiteUpdate(res.site)
      }

      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить фото')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function makePrimaryPhoto(siteId: string, path: string) {
    setPhotoBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}/photos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'make_primary', path }),
      })
      if (res?.site) applySiteUpdate(res.site)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось сделать фото главным')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removeSitePhoto(siteId: string, path: string) {
    setPhotoBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (res?.site) applySiteUpdate(res.site)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить фото')
    } finally {
      setPhotoBusy(false)
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

  async function setWorkerArchived(workerId: string, archive: boolean) {
    if (meId && workerId === meId) {
      setError('Нельзя архивировать самого себя.')
      return
    }

    const ok = window.confirm(
      archive
        ? 'Заархивировать работника? Он не сможет работать в приложении.'
        : 'Вернуть работника из архива?'
    )
    if (!ok) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/workers/toggle-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId, active: !archive }),
      })
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось обновить статус работника')
    } finally {
      setBusy(false)
    }
  }

  async function deleteWorker(workerId: string) {
    if (meId && workerId === meId) {
      setError('Нельзя удалить самого себя.')
      return
    }

    const ok = window.confirm(
      'Удалить работника НАВСЕГДА?\n\nВажно: если у него есть таймлоги/смены, сервер запретит удаление (и это нормально).'
    )
    if (!ok) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson('/api/admin/workers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId }),
      })
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'Не удалось удалить работника')
    } finally {
      setBusy(false)
    }
  }

  async function quickAssign() {
    if (!qaSite || !qaWorker) return
    await assign(qaSite, qaWorker)
  }

  function openEditForJob(j: ScheduleItem) {
    setEditJobId(j.id)
    setEditSiteId(j.site_id || '')
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
          site_id: editSiteId || null,
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
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
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
        body: JSON.stringify({ site_id: newSiteId, worker_ids: newWorkers, job_date: newDate, scheduled_time: newTime, scheduled_end_time: newTimeTo || null }),
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
    const right = `${timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)} • ${statusRu(String(j.status || ''))}`
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
              planView === 'day' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
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
              planView === 'week' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
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
              planView === 'month' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            Месяц
          </button>

          <div className="mx-2 h-7 w-px bg-yellow-400/10" />

          <button
            onClick={() => setPlanMode('workers')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planMode === 'workers' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            По работникам
          </button>
          <button
            onClick={() => setPlanMode('sites')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planMode === 'sites' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
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
                <div className="border-b border-yellow-400/10 bg-black/10 px-3 py-3 text-[11px] font-semibold text-zinc-300">
                  {h}
                </div>

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
                Объекты: {sites.length} • Работники: {workers.length} • Смены: {schedule.length}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}

          {/* ОБЪЕКТЫ */}
                    {tab === 'sites' ? (
                      <div className="mt-6 grid gap-4">
                        <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-yellow-100">Объекты</div>
                              <div className="mt-1 text-xs text-zinc-300">Назначение = доступ к объекту. Расписание делается в “Смены” и “График”.</div>
                            </div>

                            <button
                              onClick={() => setSiteCreateOpen(true)}
                              disabled={busy}
                              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                            >
                              + Добавить объект
                            </button>
                          </div>

                          <div className="mt-4 flex flex-wrap items-end gap-2">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Быстрое назначение: объект</span>
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
                              <span className="text-[11px] text-zinc-300">Быстрое назначение: работник</span>
                              <select
                                value={qaWorker}
                                onChange={(e) => setQaWorker(e.target.value)}
                                className="w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                              >
                                <option value="">Выбери работника…</option>
                                {workersForSelect.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.full_name || 'Работник'}
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

                        {sites
                          .slice()
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map((s) => {
                            const archived = !!s.archived_at
                            const assigned = (siteWorkers.get(s.id) || []).filter((w) => (w.role || '') !== 'admin')
                            const meta = siteCategoryMeta(s.category ?? null)
                            const photos = Array.isArray(s.photos) ? s.photos : []
                            const primaryUrl = photos?.[0]?.url || null

                            return (
                              <div key={s.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
                                    <div className="w-[150px] shrink-0">
                                      {primaryUrl ? (
                                        <div className="relative h-[92px] w-[150px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={primaryUrl} alt="site" className="h-full w-full object-cover" loading="lazy" />
                                          <button
                                            onClick={() => {
                                              if (s.lat != null && s.lng != null) {
                                                window.open(googleNavUrl(s.lat, s.lng), '_blank', 'noopener,noreferrer')
                                              } else {
                                                openSiteCard(s)
                                              }
                                            }}
                                            className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0"
                                            title={s.lat != null && s.lng != null ? 'Открыть навигацию' : 'Открыть карточку'}
                                          />
                                          <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">
                                            {s.lat != null && s.lng != null ? 'Навигация' : 'Карточка'}
                                          </div>
                                        </div>
                                      ) : (
                                        <MapMini
                                          lat={s.lat ?? null}
                                          lng={s.lng ?? null}
                                          onClick={() => {
                                            if (s.lat == null || s.lng == null) return
                                            window.open(googleNavUrl(s.lat, s.lng), '_blank', 'noopener,noreferrer')
                                          }}
                                        />
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          onClick={() => openSiteCard(s)}
                                          className="truncate text-left text-base font-semibold text-yellow-100 hover:underline"
                                          title="Открыть карточку объекта"
                                        >
                                          {s.name || 'Объект'}
                                        </button>

                                        {archived ? (
                                          <span className="rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">в архиве</span>
                                        ) : (
                                          <span className="rounded-xl border border-yellow-300/40 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">активен</span>
                                        )}

                                        <span className="inline-flex items-center gap-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-yellow-100/70">
                                          <span className={cn('h-2.5 w-2.5 rounded-full', meta.dotClass)} />
                                          {s.category ? `#${s.category}` : 'без категории'}
                                        </span>
                                      </div>

                                      {s.address ? <div className="mt-2 text-xs text-zinc-300">Адрес: {s.address}</div> : null}

                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <Pill>радиус: {s.radius ?? 150} м</Pill>
                                        <Pill>GPS: {s.lat != null && s.lng != null ? `${s.lat}, ${s.lng}` : 'нет'}</Pill>
                                        <Pill>фото: {photos.length}/5</Pill>
                                      </div>

                                      {s.notes ? <div className="mt-2 text-xs text-zinc-300">Заметки: {String(s.notes).slice(0, 160)}</div> : null}

                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <CategoryPicker
                                          value={s.category ?? null}
                                          disabled={busy}
                                          onChange={(v) => {
                                            void setSiteCategoryQuick(s.id, v)
                                          }}
                                        />

                                        <button
                                          onClick={() => openSiteCard(s)}
                                          disabled={busy}
                                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                                        >
                                          Карточка
                                        </button>

                                        <button
                                          onClick={() => deleteObjectSite(s.id)}
                                          disabled={busy}
                                          className="rounded-2xl border border-red-500/25 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100/85 transition hover:border-red-400/45 disabled:opacity-60"
                                        >
                                          Удалить
                                        </button>

                                        <button
                                          onClick={() => setArchived(s.id, !archived)}
                                          disabled={busy}
                                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                                        >
                                          {archived ? 'Вернуть из архива' : 'В архив'}
                                        </button>
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
                                  </div>

                                  <div className="flex flex-col items-end gap-2">
                                    {!archived ? (
                                      <div className="flex flex-wrap items-end gap-2">
                                        <label className="grid gap-1">
                                          <span className="text-[11px] text-zinc-300">Добавить работника</span>
                                          <select
                                            value={workerPickSite[s.id] || ''}
                                            onChange={(e) => setWorkerPickSite((p) => ({ ...p, [s.id]: e.target.value }))}
                                            className="w-[240px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                                          >
                                            <option value="">Выбери работника…</option>
                                            {workersForSelect.map((w) => (
                                              <option key={w.id} value={w.id}>
                                                {w.full_name || 'Работник'}
                                              </option>
                                            ))}
                                          </select>
                                        </label>

                                        <button
                                          onClick={() => {
                                            const wid = workerPickSite[s.id]
                                            if (!wid) return
                                            void assign(s.id, wid)
                                          }}
                                          disabled={busy || !workerPickSite[s.id]}
                                          className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                                        >
                                          Назначить
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">Архивный объект</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}

                        <Modal open={siteCreateOpen} title="Новый объект" onClose={() => setSiteCreateOpen(false)}>
                          <div className="grid gap-3">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Название</span>
                              <input
                                value={newObjName}
                                onChange={(e) => setNewObjName(e.target.value)}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder="Например: Дом, офис, объект №1"
                              />
                            </label>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Адрес</span>
                              <input
                                value={newObjAddress}
                                onChange={(e) => setNewObjAddress(e.target.value)}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder="(необязательно)"
                              />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">Радиус (м)</span>
                                <input
                                  value={newObjRadius}
                                  onChange={(e) => setNewObjRadius(e.target.value)}
                                  className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  placeholder="150"
                                />
                              </label>

                              <div className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">Категория</span>
                                <CategoryPicker value={newObjCategory} onChange={setNewObjCategory} disabled={busy} />
                              </div>
                            </div>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Заметки</span>
                              <textarea
                                value={newObjNotes}
                                onChange={(e) => setNewObjNotes(e.target.value)}
                                className="min-h-[100px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder="(необязательно)"
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={createObjectSite}
                                disabled={busy || !newObjName.trim()}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 disabled:opacity-60"
                              >
                                Создать
                              </button>
                              <button
                                onClick={() => setSiteCreateOpen(false)}
                                disabled={busy}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-5 py-3 text-sm text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        </Modal>

                        <Modal open={siteCardOpen} title={siteCardName || 'Карточка объекта'} onClose={() => setSiteCardOpen(false)}>
                          {!siteCardId ? (
                            <div className="text-sm text-zinc-300">Нет объекта</div>
                          ) : (
                            <div className="grid gap-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">Название</span>
                                  <input
                                    value={siteCardName}
                                    onChange={(e) => setSiteCardName(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">Адрес</span>
                                  <input
                                    value={siteCardAddress}
                                    onChange={(e) => setSiteCardAddress(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Радиус (м)</span>
                                  <input
                                    value={siteCardRadius}
                                    onChange={(e) => setSiteCardRadius(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <div className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Категория</span>
                                  <CategoryPicker value={siteCardCategory} onChange={setSiteCardCategory} disabled={busy} />
                                </div>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Lat</span>
                                  <input
                                    value={siteCardLat}
                                    onChange={(e) => setSiteCardLat(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                    placeholder="например 41.40338"
                                  />
                                </label>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Lng</span>
                                  <input
                                    value={siteCardLng}
                                    onChange={(e) => setSiteCardLng(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                    placeholder="например 2.17403"
                                  />
                                </label>

                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">Заметки</span>
                                  <textarea
                                    value={siteCardNotes}
                                    onChange={(e) => setSiteCardNotes(e.target.value)}
                                    className="min-h-[120px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <div className="sm:col-span-2 flex flex-wrap gap-2">
                                  <button
                                    onClick={saveSiteCard}
                                    disabled={busy || !siteCardName.trim()}
                                    className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 disabled:opacity-60"
                                  >
                                    Сохранить
                                  </button>
                                  <button
                                    onClick={() => deleteObjectSite(siteCardId)}
                                    disabled={busy}
                                    className="rounded-2xl border border-red-500/25 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100/85 transition hover:border-red-400/45 disabled:opacity-60"
                                  >
                                    Удалить объект
                                  </button>
                                </div>
                              </div>

                              {(() => {
                                const lat = siteCardLat.trim() === '' ? null : Number(siteCardLat)
                                const lng = siteCardLng.trim() === '' ? null : Number(siteCardLng)
                                if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null
                                return (
                                  <div className="grid gap-2">
                                    <div className="text-sm font-semibold text-yellow-100">Карта</div>
                                    <MapLarge lat={lat} lng={lng} />
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-yellow-100/70">
                                      <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={googleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                                        Google навигация
                                      </a>
                                      <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={appleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                                        Apple навигация
                                      </a>
                                    </div>
                                  </div>
                                )
                              })()}

                              <div className="grid gap-2">
                                <div className="text-sm font-semibold text-yellow-100">Фото (до 5)</div>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs text-yellow-100/55">Сейчас: {siteCardPhotos.length}/5</div>

                                  <div className="flex flex-wrap gap-2">
                                    <label
                                      className={cn(
                                        'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40',
                                        photoBusy || !siteCardId || siteCardPhotos.length >= 5 ? 'opacity-70' : ''
                                      )}
                                    >
                                      Загрузить фото
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        disabled={photoBusy || !siteCardId || siteCardPhotos.length >= 5}
                                        className="hidden"
                                        onChange={async (e) => {
                                          const files = e.target.files
                                          e.target.value = ''
                                          if (!siteCardId) return
                                          await uploadSitePhotos(siteCardId, files)
                                        }}
                                      />
                                    </label>

                                    <label
                                      className={cn(
                                        'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70',
                                        photoBusy || !siteCardId || siteCardPhotos.length >= 5 ? 'opacity-70' : ''
                                      )}
                                    >
                                      Сделать фото
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        disabled={photoBusy || !siteCardId || siteCardPhotos.length >= 5}
                                        className="hidden"
                                        onChange={async (e) => {
                                          const files = e.target.files
                                          e.target.value = ''
                                          if (!siteCardId) return
                                          await uploadSitePhotos(siteCardId, files)
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>

                                {siteCardPhotos.length === 0 ? (
                                  <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">Фото нет</div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    {siteCardPhotos.map((p, idx) => (
                                      <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={p.url || ""} alt="site" className="h-36 w-full object-cover" loading="lazy" />

                                        <div className="absolute left-2 top-2 rounded-xl border border-yellow-400/15 bg-black/50 px-2 py-1 text-[11px] text-yellow-100/80">{idx === 0 ? 'главное' : ''}</div>

                                        <div className="absolute right-2 top-2 flex gap-2">
                                          {idx !== 0 ? (
                                            <button
                                              onClick={() => {
                                                if (!siteCardId) return
                                                void makePrimaryPhoto(siteCardId, p.path)
                                              }}
                                              disabled={photoBusy || !siteCardId}
                                              className={cn(
                                                'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-2 py-1 text-[11px] font-semibold text-yellow-100',
                                                photoBusy ? 'opacity-70' : 'hover:border-yellow-200/70'
                                              )}
                                            >
                                              Главное
                                            </button>
                                          ) : null}

                                          <button
                                            onClick={() => {
                                              if (!siteCardId) return
                                              void removeSitePhoto(siteCardId, p.path)
                                            }}
                                            disabled={photoBusy || !siteCardId}
                                            className={cn(
                                              'rounded-xl border border-red-500/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-100/85',
                                              photoBusy ? 'opacity-70' : 'hover:border-red-400/45'
                                            )}
                                          >
                                            Удалить
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {photoBusy ? <div className="text-xs text-yellow-100/45">Обработка…</div> : null}
                              </div>
                            </div>
                          )}
                        </Modal>
                      </div>
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
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                onClick={() => setWorkerArchived(w.id, w.active !== false)}
                                disabled={busy}
                                className={cn(
                                  'rounded-2xl border px-4 py-2 text-xs font-semibold transition disabled:opacity-60',
                                  w.active === false
                                    ? 'border-yellow-300/45 bg-yellow-400/10 text-yellow-100 hover:border-yellow-200/70 hover:bg-yellow-400/15'
                                    : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                                )}
                              >
                                {w.active === false ? 'Вернуть из архива' : 'Архивировать'}
                              </button>

                              <button
                                onClick={() => deleteWorker(w.id)}
                                disabled={busy}
                                className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/40 hover:bg-red-500/15 disabled:opacity-60"
                              >
                                Удалить
                              </button>
                            </div>
                          ) : null}

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

          {/* СМЕНЫ */}
          {tab === 'jobs' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="text-sm font-semibold text-yellow-100">Создать смену</div>
                <div className="mt-1 text-xs text-zinc-300">Объект + дата + время + несколько работников.</div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1.7fr_0.8fr_0.7fr_0.7fr_auto]">
                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">Объект</span>
                    <select
                      value={newSiteId}
                      onChange={(e) => {
                        const v = e.target.value
                        setNewSiteId(v)
                        setNewWorkers([])
                      }}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
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
                    <span className="text-[11px] text-zinc-300">Работники (можно несколько)</span>
                    <MultiWorkerPicker workers={workersForPicker} value={newWorkers} onChange={setNewWorkers} disabled={!newSiteId} />
                  </label>

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

                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">Конец</span>
                    <input
                      type="time"
                      value={newTimeTo}
                      onChange={(e) => setNewTimeTo(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                    />
                  </label>


                  <button
                    onClick={createJobs}
                    disabled={busy || !newSiteId || newWorkers.length === 0}
                    className="mt-5 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                  >
                    Создать смену
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setJobsView('table')}
                    className={cn(
                      'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                      jobsView === 'table' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                    )}
                  >
                    Расписание
                  </button>
                  <button
                    onClick={() => setJobsView('board')}
                    className={cn(
                      'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                      jobsView === 'board' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                    )}
                  >
                    Доска
                  </button>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setAnchorDate(toISODate(new Date()))
                        recalcRange('day', toISODate(new Date()))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      Сегодня
                    </button>
                    <button
                      onClick={() => {
                        const t = new Date()
                        setAnchorDate(toISODate(t))
                        setDateFrom(toISODate(startOfWeek(t)))
                        setDateTo(toISODate(endOfWeek(t)))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      Неделя
                    </button>
                    <button
                      onClick={() => {
                        const t = new Date()
                        setAnchorDate(toISODate(t))
                        setDateFrom(toISODate(startOfMonth(t)))
                        setDateTo(toISODate(endOfMonth(t)))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      Месяц
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-yellow-100">Фильтры</div>

                  <div className="flex flex-wrap items-end gap-2">
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

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Объект</span>
                      <select
                        value={filterSite}
                        onChange={(e) => setFilterSite(e.target.value)}
                        className="w-[220px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">Все</option>
                        {sites
                          .slice()
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name || s.id}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Работник</span>
                      <select
                        value={filterWorker}
                        onChange={(e) => setFilterWorker(e.target.value)}
                        className="w-[220px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">Все</option>
                        {workers
                          .slice()
                          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name || 'Без имени'}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>

                {jobsView === 'board' ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    {[
                      { key: 'planned', title: 'Запланировано', items: planned },
                      { key: 'in_progress', title: 'В процессе', items: inProgress },
                      { key: 'done', title: 'Завершено', items: done },
                      { key: 'cancelled', title: 'Отменено', items: cancelled },
                    ].map((col) => (
                      <div key={col.key} className="rounded-3xl border border-yellow-400/12 bg-black/20 p-4">
                        <div className="text-xs font-semibold text-zinc-200">{col.title}</div>
                        <div className="mt-3 grid gap-2">
                          {col.items.map((j) => jobCard(j, false))}
                          {col.items.length === 0 ? <div className="text-xs text-zinc-500">—</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 overflow-auto rounded-3xl border border-yellow-400/10 bg-black/20">
                    <table className="min-w-[920px] w-full text-left text-sm">
                      <thead className="bg-black/30 text-xs text-zinc-300">
                        <tr>
                          <th className="px-4 py-3">Дата</th>
                          <th className="px-4 py-3">Время</th>
                          <th className="px-4 py-3">Объект</th>
                          <th className="px-4 py-3">Работник</th>
                          <th className="px-4 py-3">Статус</th>
                          <th className="px-4 py-3">Начал</th>
                          <th className="px-4 py-3">Закончил</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="text-sm text-zinc-100">
                        {scheduleFiltered
                          .slice()
                          .sort((a, b) => `${a.job_date || ''} ${timeHHMM(a.scheduled_time)}`.localeCompare(`${b.job_date || ''} ${timeHHMM(b.scheduled_time)}`))
                          .map((j) => (
                            <tr key={j.id} className="border-t border-yellow-400/5 hover:bg-yellow-400/5">
                              <td className="px-4 py-3">{fmtD(j.job_date)}</td>
                              <td className="px-4 py-3">{timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)}</td>
                              <td className="px-4 py-3">{j.site_name || '—'}</td>
                              <td className="px-4 py-3">
                                {j.worker_id ? (
                                  <button onClick={() => openWorkerCard(j.worker_id!)} className="text-yellow-100 hover:text-yellow-50">
                                    {j.worker_name || '—'}
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-3">{statusRu(String(j.status || ''))}</td>
                              <td className="px-4 py-3">{fmtDT(j.started_at)}</td>
                              <td className="px-4 py-3">{fmtDT(j.stopped_at)}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => openEditForJob(j)}
                                  className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
                                >
                                  править
                                </button>
                              </td>
                            </tr>
                          ))}
                        {scheduleFiltered.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-xs text-zinc-500">
                              Нет смен
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ГРАФИК */}
          {tab === 'plan' ? (
            <div className="mt-6">
              <PlanToolbar />

              {planView === 'week' ? <PlanWeekGrid /> : null}
              {planView === 'day' ? <PlanDayGrid /> : null}
              {planView === 'month' ? <PlanMonthGrid /> : null}

              <div className="mt-4 rounded-3xl border border-yellow-400/15 bg-black/20 p-4 text-xs text-zinc-300">
                Подсказка: перетаскивай смены мышкой. Клик по смене — “править”. “Перенести” — быстрый перевод на другого работника. “Отменить” — убрать из графика.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* МОДАЛКА: ПРАВКА СМЕНЫ */}
      <Modal open={editOpen} title="Правка смены" onClose={() => setEditOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Объект</span>
            <select
              value={editSiteId}
              onChange={(e) => setEditSiteId(e.target.value)}
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
                  {w.full_name || 'Работник'}
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

      {/* МОДАЛКА: КАРТОЧКА РАБОТНИКА */}
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
                  <span className="text-zinc-100">{fmtD(j.job_date)}</span> • <span className="text-zinc-100">{timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)}</span> •{' '}
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

      {/* МОДАЛКА: ПЕРЕНОС СМЕНЫ НА ДРУГОГО РАБОТНИКА */}
      <Modal open={moveJobOpen} title="Перенести смену" onClose={() => setMoveJobOpen(false)}>
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
                  {w.full_name || 'Работник'}
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

      {/* МОДАЛКА: ПЕРЕНОС ДНЯ */}
      <Modal open={moveDayOpen} title="Перенести день" onClose={() => setMoveDayOpen(false)}>
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
                    {w.full_name || 'Работник'}
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
                    {w.full_name || 'Работник'}
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

      {/* МОДАЛКА: ОТМЕНА */}
      <Modal open={cancelOpen} title="Отмена смены" onClose={() => setCancelOpen(false)}>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">
            Это уберёт смену из работы (статус “Отменено”). Отчёты не ломаем.
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
