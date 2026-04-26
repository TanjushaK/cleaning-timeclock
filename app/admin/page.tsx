'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAccessToken, setAuthTokens, clearAuthTokens } from '@/lib/auth-fetch'
import { SearchableSelect } from '@/app/_components/SearchableSelect'
import { useI18n } from '@/components/I18nProvider'
import type { Lang } from '@/lib/i18n-config'

function mapAdminErr(e: unknown, t: (key: string, vars?: Record<string, string | number>) => string) {
  const m = String((e as { message?: string })?.message ?? '')
  if (m.startsWith('admin.api.')) return t(m)
  if (/^(admin\.(main|common|approvals)\.|common\.)/.test(m)) return t(m)
  return m
}

// Token (localStorage)
function getAccessTokenOrNull(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return getAccessToken()
  } catch {
    return null
  }
}

type TabKey = 'sites' | 'workers' | 'jobs' | 'plan' | 'reports'
type JobsView = 'board' | 'table'
type PlanView = 'day' | 'week' | 'month'
type PlanMode = 'workers' | 'sites'

type SitePhoto = { path: string; url?: string; created_at?: string | null }

type WorkerPhoto = { path: string; url?: string; created_at?: string | null }

type WorkerPhotoMeta = { count: number; thumb?: string }

function workerPhotoFallbackUrl(path: string): string {
  const clean = String(path || '').replace(/^\/+/, '')
  if (!clean) return ''
  return `/api/storage/public/site-photos/${clean
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')}`
}

function workerPhotoUrl(photo: WorkerPhoto): string {
  const url = String(photo?.url || '').trim()
  if (url) return url
  return workerPhotoFallbackUrl(photo?.path || '')
}

type WorkerProfile = {
  id: string
  full_name?: string | null
  full_name_i18n?: Partial<Record<Lang, string>> | null
  role?: string | null
  active?: boolean | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  notes_i18n?: Partial<Record<Lang, string>> | null
  avatar_path?: string | null
}

type WorkerResetResult = {
  login: string | null
  temp_password: string
}

type Site = {
  id: string
  name?: string | null
  name_i18n?: Partial<Record<Lang, string>> | null
  address?: string | null
  address_i18n?: Partial<Record<Lang, string>> | null
  lat?: number | null
  lng?: number | null
  radius?: number | null
  category?: number | null
  notes?: string | null
  notes_i18n?: Partial<Record<Lang, string>> | null
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

type LocDraft = {
  name: Partial<Record<Lang, string>>
  address: Partial<Record<Lang, string>>
  notes: Partial<Record<Lang, string>>
}

function emptyLocDraft(): LocDraft {
  return { name: {}, address: {}, notes: {} }
}

function locDraftValue(d: Partial<Record<Lang, string>>, locale: Lang): string {
  return d[locale] ?? d.ru ?? ''
}

function siteToLocDraft(s: Site): LocDraft {
  const name = { ...(s.name_i18n || {}) } as Partial<Record<Lang, string>>
  const address = { ...(s.address_i18n || {}) } as Partial<Record<Lang, string>>
  const notes = { ...(s.notes_i18n || {}) } as Partial<Record<Lang, string>>
  if (s.name && !name.ru) name.ru = s.name
  if (s.address && !address.ru) address.ru = s.address
  if (s.notes && !notes.ru) notes.ru = s.notes
  return { name, address, notes }
}

function workerToLocDraft(w: WorkerProfile): LocDraft {
  const name = { ...(w.full_name_i18n || {}) } as Partial<Record<Lang, string>>
  const notes = { ...(w.notes_i18n || {}) } as Partial<Record<Lang, string>>
  if (w.full_name && !name.ru) name.ru = w.full_name
  if (w.notes && !notes.ru) notes.ru = w.notes
  return { name, address: {}, notes }
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

function buildPayrollPeriods(count: number) {
  // Rolling 4-week windows (28 days), anchored on Monday of the current week.
  const today = new Date()
  const currentStart = startOfWeek(today) // Monday
  const periods: { from: string; to: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const s = new Date(currentStart)
    s.setDate(s.getDate() - i * 28)
    const e = new Date(s)
    e.setDate(e.getDate() + 27)
    const from = toISODate(s)
    const to = toISODate(e)
    periods.push({ from, to, label: `${fmtD(from)} — ${fmtD(to)}` })
  }
  return periods
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

function enumerateDates(fromISO: string, toISO: string, dowLabels: string[]) {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(toISO + 'T00:00:00')
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []
  const out: { iso: string; label: string; dow: string }[] = []
  let cur = new Date(from)
  while (cur.getTime() <= to.getTime()) {
    out.push({
      iso: toISODate(cur),
      label: `${pad2(cur.getDate())}-${pad2(cur.getMonth() + 1)}`,
      dow: dowLabels[cur.getDay()] ?? '',
    })
    cur = addDays(cur, 1)
  }
  return out
}

/** Normalize API/DB job_date (date or ISO datetime) to YYYY-MM-DD for grid matching. */
function jobDateKey(raw: string | null | undefined): string {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  const head = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (head) return head[1]
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return toISODate(d)
  return ''
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


function fmtMinutesHM(totalMinutes: number) {
  const mins = Math.max(0, Math.floor(totalMinutes || 0))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${pad2(m)}`
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}


function statusPillClasses(s: string) {
  if (s === 'in_progress')
    return 'adminStatusPill adminStatusPillInProgress border-emerald-400/30 bg-emerald-500/15 text-[#3b2414] dark:border-emerald-300/55 dark:bg-emerald-500/42 dark:text-emerald-50'
  if (s === 'planned')
    return 'adminStatusPill adminStatusPillPlanned border-rose-400/30 bg-rose-500/15 text-[#3b2414] dark:border-rose-300/55 dark:bg-rose-500/42 dark:text-rose-50'
  if (s === 'done')
    return 'adminStatusPill adminStatusPillDone border-sky-400/30 bg-sky-500/15 text-[#3b2414] dark:border-sky-300/55 dark:bg-sky-500/42 dark:text-sky-50'
  if (s === 'cancelled')
    return 'border-zinc-400/20 bg-zinc-500/10 text-zinc-300 dark:border-zinc-400/45 dark:bg-zinc-500/30 dark:text-zinc-100'
  return 'border-yellow-400/20 bg-yellow-400/10 text-yellow-100/85 dark:border-amber-300/50 dark:bg-amber-500/38 dark:text-amber-50'
}

function fmtHMS(ms: number) {
  const x = Math.max(0, Math.floor((ms || 0) / 1000))
  const h = Math.floor(x / 3600)
  const m = Math.floor((x % 3600) / 60)
  const s = x % 60
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

function useNowMs(enabled: boolean, intervalMs: number = 1000) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    setNowMs(Date.now())
    const t = window.setInterval(() => setNowMs(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [enabled, intervalMs])
  return nowMs
}

function ElapsedSince({ startedAt, className }: { startedAt: string | null | undefined; className?: string }) {
  const since = startedAt ? new Date(startedAt).getTime() : null
  const nowMs = useNowMs(since != null)
  if (since == null) return null
  return <span className={className || 'text-[11px] text-zinc-300'}>⏱ {fmtHMS(nowMs - since)}</span>
}

function StatusPill({ status, startedAt }: { status: string; startedAt?: string | null }) {
  const { t } = useI18n()
  const st = String(status || '')
  const label =
    st === 'planned'
      ? t('admin.main.jobPlanned')
      : st === 'in_progress'
        ? t('admin.main.jobInProgress')
        : st === 'done'
          ? t('admin.main.jobDone')
          : st === 'cancelled'
            ? t('admin.main.jobCancelled')
            : st || '—'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', statusPillClasses(st))}>
        {label}
      </span>
      {st === 'in_progress' && startedAt ? <ElapsedSince startedAt={startedAt} /> : null}
    </div>
  )
}

function StatusTag({ status }: { status: string }) {
  const { t } = useI18n()
  const st = String(status || '')
  const label =
    st === 'planned'
      ? t('admin.main.jobPlanned')
      : st === 'in_progress'
        ? t('admin.main.jobInProgress')
        : st === 'done'
          ? t('admin.main.jobDone')
          : st === 'cancelled'
            ? t('admin.main.jobCancelled')
            : st || '—'
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', statusPillClasses(st))}>
      {label}
    </span>
  )
}

function initials(name?: string | null) {
  const raw = String(name || '').trim()
  if (!raw) return '—'
  const parts = raw.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : ''
  const out = (a + b).toUpperCase()
  return out || '—'
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

    const payload = await res.json().catch(() => ({} as any))

    if (res.status === 401) {
      clearAuthTokens()
      throw new Error('admin.main.errSessionExpired')
    }
    if (!res.ok) {
      const code = payload?.errorCode
      if (code) throw new Error(`admin.api.${code}`)
      throw new Error(payload?.error || `HTTP ${res.status}`)
    }
    return payload as T
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('admin.main.errRequestTimeout')
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}


function Modal(props: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  scopeClassName?: string
}) {
  const { t } = useI18n()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (!props.open) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    requestAnimationFrame(() => {
      try {
        boxRef.current?.focus()
      } catch {}
    })
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [props.open])

  if (!props.open || !mounted) return null

  return createPortal(
    <div className={cn('adminPortalTheme fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto px-4 py-6', props.scopeClassName)}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={props.onClose} />
      <div
        ref={boxRef}
        tabIndex={-1}
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-yellow-400/20 bg-zinc-950/90 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.75)] max-h-[calc(100vh-3rem)] outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-yellow-100">{props.title}</div>
          <button
            onClick={props.onClose}
            className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
          >
            {t('common.close')}
          </button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto pr-1">{props.children}</div>
      </div>
    </div>,
    document.body
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

const SITE_CATEGORY_DOTS: Array<{ id: number; dotClass: string }> = [
  { id: 1, dotClass: 'bg-emerald-400' },
  { id: 2, dotClass: 'bg-sky-400' },
  { id: 3, dotClass: 'bg-violet-400' },
  { id: 4, dotClass: 'bg-fuchsia-400' },
  { id: 5, dotClass: 'bg-rose-400' },
  { id: 6, dotClass: 'bg-amber-400' },
  { id: 7, dotClass: 'bg-lime-400' },
  { id: 8, dotClass: 'bg-cyan-400' },
  { id: 9, dotClass: 'bg-indigo-400' },
  { id: 10, dotClass: 'bg-orange-400' },
  { id: 11, dotClass: 'bg-teal-400' },
  { id: 12, dotClass: 'bg-pink-400' },
  { id: 13, dotClass: 'bg-red-400' },
  { id: 14, dotClass: 'bg-purple-400' },
  { id: 15, dotClass: 'bg-green-400' },
]

function siteCategoryMeta(category: number | null | undefined, t: (k: string, v?: Record<string, string | number>) => string) {
  const c = SITE_CATEGORY_DOTS.find((x) => x.id === category)
  if (!c || !category) return { id: 0, label: t('admin.main.noCategory'), dotClass: 'bg-zinc-500' } as SiteCategory
  return { id: category, label: t('admin.main.categoryLabel', { n: category }), dotClass: c.dotClass }
}

function siteToSelectItem(s: Site, t: (k: string, v?: Record<string, string | number>) => string) {
  const meta = siteCategoryMeta(s.category ?? null, t)
  const name = String(s.name || '').trim()
  const addr = String(s.address || '').trim()
  const label = name || addr || t('admin.main.siteFallback', { short: String(s.id).slice(0, 6) })
  const hint = name && addr ? addr : undefined
  return { id: s.id, label, hint, dotClass: meta.dotClass }
}


function googleNavUrl(lat: number, lng: number) {
  const dest = `${lat},${lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}

function googleNavUrlAddress(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function openNavForSite(site: { lat?: number | null; lng?: number | null; address?: string | null }) {
  if (typeof window === 'undefined') return
  const lat = site?.lat
  const lng = site?.lng
  const addr = site?.address
  if (lat != null && lng != null) {
    window.open(googleNavUrl(lat, lng), '_blank', 'noopener,noreferrer')
    return
  }
  if (addr) {
    window.open(googleNavUrlAddress(String(addr)), '_blank', 'noopener,noreferrer')
    return
  }
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
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const meta = siteCategoryMeta(props.value, t)

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
            <span>{t('admin.main.noCategory')}</span>
          </button>
          <div className="h-px bg-yellow-400/10" />
          {SITE_CATEGORY_DOTS.map((c) => (
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
              <span className="text-yellow-100/60">{t('admin.main.categoryLabel', { n: c.id })}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MapMini(props: { lat: number | null; lng: number | null; onClick: () => void }) {
  const { t } = useI18n()
  const { lat, lng } = props
  if (lat == null || lng == null) {
    return (
      <div className="flex h-[92px] w-full sm:w-[150px] items-center justify-center rounded-2xl border border-yellow-400/10 bg-black/20 text-[11px] text-yellow-100/40">
        {t('admin.main.noCoords')}
      </div>
    )
  }

  return (
    <div className="relative h-[92px] w-full sm:w-[150px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(lat, lng, 0.004)} className="h-full w-full" loading="lazy" />
      <button onClick={props.onClick} className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" title={t('admin.main.navOpen')} />
      <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">{t('admin.main.navBadge')}</div>
    </div>
  )
}

function MapLarge(props: { lat: number; lng: number }) {
  const { t } = useI18n()
  const { lat, lng } = props
  return (
    <div className="relative h-[180px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(lat, lng, 0.01)} className="h-full w-full" loading="lazy" />
      <button
        onClick={() => window.open(googleNavUrl(lat, lng), '_blank', 'noopener,noreferrer')}
        className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0"
        title={t('admin.main.navOpen')}
      />
      <div className="absolute bottom-2 left-3 text-xs font-semibold text-yellow-100/90">{t('admin.main.navOpenFull')}</div>
    </div>
  )
}

function MultiWorkerPicker(props: {
  workers: Array<{ id: string; name: string }>
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
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
          <span className="text-zinc-400">{t('admin.main.multiPickWorkers')}</span>
        ) : (
          <span className="text-zinc-100">
            {selectedNames.slice(0, 3).join(', ')}
            {selectedNames.length > 3 ? t('admin.main.multiAndMore', { n: selectedNames.length - 3 }) : ''}
          </span>
        )}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-yellow-400/15 bg-zinc-950/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.main.multiSearch')}
            className="mb-2 w-full rounded-2xl border border-yellow-400/15 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-yellow-300/50"
          />

          <div className="max-h-[240px] overflow-auto rounded-2xl border border-yellow-400/10 bg-black/20">
            {filtered.length === 0 ? <div className="px-3 py-3 text-xs text-zinc-500">{t('admin.main.multiNothing')}</div> : null}

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
                    {on ? t('admin.main.multiSelected') : ' '}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-300">
              {t('admin.main.multiStats', { shown: filtered.length, picked: props.value.length })}
            </div>
            <button
              type="button"
              onClick={() => props.onChange([])}
              className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
            >
              {t('admin.main.multiClear')}
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


// Reports panel (time totals) — isolated component to keep AdminPage hooks stable
function payrollForReports(d: Date) {
  const day = d.getDate()
  const y = d.getFullYear()
  const m = d.getMonth() // 0-based
  const from = new Date(y, m, 16)
  if (day < 16) from.setMonth(from.getMonth() - 1)
  const to = new Date(from)
  to.setMonth(to.getMonth() + 1)
  to.setDate(15)
  return { from: toISODate(from), to: toISODate(to) }
}

function ReportsPanel() {
  const { t } = useI18n()
  const initialPayroll = useMemo(() => payrollForReports(new Date()), [])
  const [reportsView, setReportsView] = useState<'workers' | 'sites'>('workers')
  const [reportPickerOpen, setReportPickerOpen] = useState(false)
  const [reportPickerTab, setReportPickerTab] = useState<'payroll' | 'custom'>('payroll')
  const [reportFrom, setReportFrom] = useState<string>(initialPayroll.from)
  const [reportTo, setReportTo] = useState<string>(initialPayroll.to)
  const [reportPayrollFrom, setReportPayrollFrom] = useState<string>(initialPayroll.from)
  const [reportPayrollTo, setReportPayrollTo] = useState<string>(initialPayroll.to)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSearch, setReportSearch] = useState('')
  const [reportData, setReportData] = useState<
    | null
    | {
        from: string
        to: string
        total_minutes: number
        by_worker: Array<{ worker_id: string; worker_name: string | null; avatar_url: string | null; minutes: number }>
        by_site: Array<{ site_id: string; site_name: string | null; avatar_url: string | null; minutes: number }>
      }
  >(null)

  const payrollOptions = useMemo(() => {
    const opts: Array<{ from: string; to: string; label: string; year: number }> = []
    const now = new Date()
    // last 24 payroll periods (16 -> 15)
    for (let i = 0; i < 24; i++) {
      const d = new Date(now)
      d.setMonth(d.getMonth() - i)
      const p = payrollForReports(d)
      const fromD = fmtD(p.from)
      const toD = fmtD(p.to)
      const label = `${fromD} — ${toD}`
      opts.push({ from: p.from, to: p.to, label, year: new Date(p.from).getFullYear() })
    }
    return opts
  }, [])

  const loadReports = useCallback(async (fromISO: string, toISO: string) => {
    setReportLoading(true)
    setReportError(null)
    try {
      const data = await authFetchJson<{
        from: string
        to: string
        total_minutes: number
        by_worker: Array<{ worker_id: string; worker_name: string | null; avatar_url: string | null; minutes: number }>
        by_site: Array<{ site_id: string; site_name: string | null; avatar_url: string | null; minutes: number }>
      }>(`/api/admin/reports?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`)

      setReportData(data)
    } catch (e: unknown) {
      setReportError(mapAdminErr(e, t))
      setReportData(null)
    } finally {
      setReportLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadReports(reportFrom, reportTo)
  }, [loadReports, reportFrom, reportTo])

  return (
  <div className="mt-6 grid gap-4">
    <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-yellow-100">{t('admin.main.reportsTitle')}</div>
          <div className="mt-1 text-xs text-zinc-300">
            {t('admin.main.periodPrefix')} {fmtD(reportFrom)} — {fmtD(reportTo)}
          </div>
        </div>
  
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => setReportPickerOpen(true)}
            className="w-full sm:w-auto rounded-2xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/50"
          >
            {t('admin.main.pickPeriod')}
          </button>

          <a
            href="/admin/fact"
            className="w-full sm:w-auto rounded-2xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/50"
          >
            {t('admin.main.linkFactEdit')}
          </a>

<a
  className="w-full sm:w-auto rounded-2xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/50"
  href="/admin/approvals"
>
  {t('admin.main.linkActivations')}
</a>
			
          <div className="flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/25 p-1">
            <button
              type="button"
              onClick={() => setReportsView('workers')}
              className={cn(
                'rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                reportsView === 'workers' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
              )}
            >
              {t('admin.main.reportsByWorkers')}
            </button>
            <button
              type="button"
              onClick={() => setReportsView('sites')}
              className={cn(
                'rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                reportsView === 'sites' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
              )}
            >
              {t('admin.main.reportsBySites')}
            </button>
          </div>
        </div>
      </div>
  
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-yellow-400/10 bg-black/30 p-4">
          <div className="text-[11px] text-zinc-300">{t('admin.main.reportsPeriodTotal')}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-yellow-100">
            {fmtMinutesHM(reportData?.total_minutes ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">{t('admin.main.reportsHm')}</div>
        </div>
  
        <div className="rounded-3xl border border-yellow-400/10 bg-black/30 p-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-300">{t('admin.main.reportsSearch')}</div>
            <div className="text-[11px] text-zinc-400">
              {reportLoading ? t('admin.main.reportsCalculating') : reportData ? t('admin.main.reportsReady') : '—'}
            </div>
          </div>
          <input
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            placeholder={t('admin.main.reportsSearchPh')}
            className="mt-2 w-full rounded-2xl border border-yellow-400/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-yellow-300/40"
          />
          {reportError ? (
            <div className="mt-2 rounded-2xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-100">{reportError}</div>
          ) : null}
        </div>
      </div>
  
      <div className="mt-4 overflow-hidden rounded-3xl border border-yellow-400/10 bg-black/25">
        {(reportsView === 'workers' ? reportData?.by_worker ?? [] : reportData?.by_site ?? [])
          .filter((x: any) => {
            const q = reportSearch.trim().toLowerCase()
            if (!q) return true
            const name = (reportsView === 'workers' ? x.worker_name : x.site_name) ?? ''
            return String(name).toLowerCase().includes(q)
          })
          .map((x: any) => {
            const id = reportsView === 'workers' ? x.worker_id : x.site_id
            const title = (reportsView === 'workers' ? x.worker_name : x.site_name) ?? '—'
            const avatarUrl = x.avatar_url || null
  
            return (
              <div
                key={id}
                className="flex flex-col gap-3 border-b border-yellow-400/5 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-yellow-400/15 bg-black/40">
                    {avatarUrl ? (
                       
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-200">
                        {reportsView === 'workers' ? initials(title) : '🏠'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-400">
                      {reportsView === 'workers' ? t('admin.main.colWorker') : t('admin.main.colSite')}
                    </div>
                  </div>
                </div>
  
                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                <div className="w-full shrink-0 rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-center text-sm font-semibold text-yellow-100 sm:w-auto">
                  {fmtMinutesHM(Number(x.minutes) || 0)}
                </div>
                {reportsView === 'workers' ? (
                  <a
                    href={`/admin/hours?worker_id=${encodeURIComponent(id)}&from=${encodeURIComponent(reportFrom)}&to=${encodeURIComponent(reportTo)}`}
                    className="w-full rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-center text-xs font-semibold text-zinc-200 hover:border-yellow-300/40 sm:w-auto"
                    title={t('admin.main.openHoursTitle')}
                  >
                    {t('admin.main.openHours')}
                  </a>
                ) : null}
              </div>
              </div>
            )
          })}
  
        {!reportLoading &&
        (reportsView === 'workers' ? (reportData?.by_worker?.length ?? 0) : (reportData?.by_site?.length ?? 0)) === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-400">{t('admin.main.reportsNoData')}</div>
        ) : null}
      </div>
    </div>
  
    {/* Picker modal */}
    {reportPickerOpen ? (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-yellow-400/15 bg-zinc-950/95 shadow-[0_20px_80px_rgba(0,0,0,0.75)] backdrop-blur">
          <div className="flex items-center justify-between gap-2 border-b border-yellow-400/10 px-5 py-4">
            <div className="text-sm font-semibold text-yellow-100">{t('admin.main.reportPeriodTitle')}</div>
            <button
              type="button"
              onClick={() => setReportPickerOpen(false)}
              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-zinc-200 hover:border-yellow-300/40"
            >
              {t('common.close')}
            </button>
          </div>
  
          <div className="px-5 pt-4">
            <div className="flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/25 p-1">
              <button
                type="button"
                onClick={() => setReportPickerTab('payroll')}
                className={cn(
                  'flex-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                  reportPickerTab === 'payroll' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
                )}
              >
                {t('admin.main.payrollTab')}
              </button>
              <button
                type="button"
                onClick={() => setReportPickerTab('custom')}
                className={cn(
                  'flex-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                  reportPickerTab === 'custom' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
                )}
              >
                {t('admin.main.customTab')}
              </button>
            </div>
  
            {reportPickerTab === 'custom' ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    {t('admin.main.dateFromShort')}
                    <input
                      type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                      value={reportFrom}
                      onChange={(e) => setReportFrom(e.target.value)}
                      className="w-full rounded-2xl border border-yellow-400/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    {t('admin.main.dateToShort')}
                    <input
                      type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                      value={reportTo}
                      onChange={(e) => setReportTo(e.target.value)}
                      className="w-full rounded-2xl border border-yellow-400/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                    />
                  </label>
                </div>
  
                <div className="text-[11px] text-zinc-400">{t('admin.main.customRangeHint')}</div>
              </div>
            ) : (
              <div className="mt-4 max-h-[52vh] overflow-auto rounded-3xl border border-yellow-400/10 bg-black/25">
                {payrollOptions.map((p) => {
                  const checked = reportPayrollFrom === p.from && reportPayrollTo === p.to
                  return (
                    <button
                      key={p.from}
                      type="button"
                      onClick={() => {
                        setReportPayrollFrom(p.from)
                        setReportPayrollTo(p.to)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm',
                        'border-b border-yellow-400/5 last:border-b-0 hover:bg-yellow-400/5'
                      )}
                    >
                      <span className="text-zinc-100">
                        {p.label} <span className="ml-2 text-[11px] text-zinc-400">{p.year}</span>
                      </span>
                      <span
                        className={cn(
                          'rounded-xl border px-2 py-1 text-[11px]',
                          checked ? 'border-yellow-300/60 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-300'
                        )}
                      >
                        {checked ? t('admin.main.multiSelected') : ' '}
                      </span>
                    </button>
                  )
                })}              </div>
            )}
          </div>
  
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-yellow-400/10 px-5 py-4">
            <button
              type="button"
              onClick={() => setReportPickerOpen(false)}
              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-sm text-zinc-200 hover:border-yellow-300/40"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (reportPickerTab === 'payroll') {
                  setReportFrom(reportPayrollFrom)
                  setReportTo(reportPayrollTo)
                }
                setReportPickerOpen(false)
              }}
              className="rounded-2xl border border-yellow-400/40 bg-yellow-400/15 px-5 py-2 text-sm font-semibold text-yellow-100 hover:border-yellow-300/70"
            >
              {t('admin.main.reportApply')}
            </button>
          </div>
        </div>
      </div>
    ) : null}
  </div>
  )
}

export default function AdminPage() {
  const { t, lang } = useI18n()
  const [tab, setTab] = useState<TabKey>('jobs')

  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')


  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshSeqRef = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [repairingCoords, setRepairingCoords] = useState(false)

  // Safety-net: if refresh UI sticks on "refreshing", release the button and show an error.
  useEffect(() => {
    if (!refreshing) return
    const seq = refreshSeqRef.current
    const refreshHangTimer = window.setTimeout(() => {
      if (refreshSeqRef.current !== seq) return
      setRefreshing(false)
      setError(t('admin.main.refreshStuck'))
    }, 25000)
    return () => window.clearTimeout(refreshHangTimer)
  }, [refreshing, t])

  const [showArchivedSites, setShowArchivedSites] = useState(false)

  const [photoBusy, setPhotoBusy] = useState(false)

  const [photoUiError, setPhotoUiError] = useState<string | null>(null)
  const [photoUiNotice, setPhotoUiNotice] = useState<string | null>(null)

  const [workerPhotoBusy, setWorkerPhotoBusy] = useState(false)

  const [siteCreateOpen, setSiteCreateOpen] = useState(false)
  const [newObjName, setNewObjName] = useState('')
  const [newObjAddress, setNewObjAddress] = useState('')
  const [newObjRadius, setNewObjRadius] = useState('150')
  const [newObjCategory, setNewObjCategory] = useState<number | null>(null)
  const [newObjNotes, setNewObjNotes] = useState('')

  const [siteCardOpen, setSiteCardOpen] = useState(false)
  const [siteCardId, setSiteCardId] = useState<string | null>(null)
  const [siteCardLocale, setSiteCardLocale] = useState<Lang>('ru')
  const [siteLocDraft, setSiteLocDraft] = useState<LocDraft>(() => emptyLocDraft())
  const [siteCardRadius, setSiteCardRadius] = useState('150')
  const [siteCardCategory, setSiteCardCategory] = useState<number | null>(null)
  const [siteCardLat, setSiteCardLat] = useState('')
  const [siteCardLng, setSiteCardLng] = useState('')
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
  const [editTimeTo, setEditTimeTo] = useState<string>('')
  const [editStatus, setEditStatus] = useState<JobStatus>('planned')

  const [workerCardOpen, setWorkerCardOpen] = useState(false)
  const [workerCardId, setWorkerCardId] = useState<string>('')
  const [workerCardItems, setWorkerCardItems] = useState<ScheduleItem[]>([])

  const [workerCardPhotos, setWorkerCardPhotos] = useState<WorkerPhoto[]>([])
  const [workerPhotoUiError, setWorkerPhotoUiError] = useState<string | null>(null)
  const [workerPhotoBroken, setWorkerPhotoBroken] = useState<Record<string, boolean>>({})
  const [workerPhotoMeta, setWorkerPhotoMeta] = useState<Record<string, WorkerPhotoMeta>>({})

  const [workerProfileById, setWorkerProfileById] = useState<Record<string, WorkerProfile>>({})
  const [workerProfileLoading, setWorkerProfileLoading] = useState(false)
  const [workerProfileSaving, setWorkerProfileSaving] = useState(false)

  const [workerCardLocale, setWorkerCardLocale] = useState<Lang>('ru')
  const [workerLocDraft, setWorkerLocDraft] = useState<LocDraft>(() => emptyLocDraft())
  const [workerCardEmail, setWorkerCardEmail] = useState('')
  const [workerCardPhone, setWorkerCardPhone] = useState('')
  const [workerCardAvatarPath, setWorkerCardAvatarPath] = useState<string | null>(null)
  const [workerResetBusy, setWorkerResetBusy] = useState(false)
  const [workerResetResult, setWorkerResetResult] = useState<WorkerResetResult | null>(null)

  // worker photos meta prefetch (list badge + mini-avatar): cached + concurrency-limited
  const photoMetaQueueRef = useRef<string[]>([])
  const photoMetaInFlightRef = useRef<Set<string>>(new Set())
  const photoMetaRunningRef = useRef(0)
  const PHOTO_META_CONCURRENCY = 6

  function enqueueWorkerPhotoMeta(ids: string[]) {
    const known = workerPhotoMeta
    const q = photoMetaQueueRef.current

    for (const id of ids) {
      if (!id) continue
      if (known[id]) continue
      if (photoMetaInFlightRef.current.has(id)) continue
      if (q.includes(id)) continue
      q.push(id)
    }

    void drainWorkerPhotoMetaQueue()
  }

  async function drainWorkerPhotoMetaQueue() {
    // keep draining until we hit concurrency cap
    while (photoMetaRunningRef.current < PHOTO_META_CONCURRENCY && photoMetaQueueRef.current.length > 0) {
      const id = photoMetaQueueRef.current.shift()
      if (!id) continue
      if (workerPhotoMeta[id]) continue
      if (photoMetaInFlightRef.current.has(id)) continue

      photoMetaInFlightRef.current.add(id)
      photoMetaRunningRef.current += 1

      void loadWorkerPhotoMeta(id)
        .catch(() => null)
        .finally(() => {
          photoMetaInFlightRef.current.delete(id)
          photoMetaRunningRef.current -= 1
          void drainWorkerPhotoMetaQueue()
        })
    }
  }

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
    () => workersForSelect.map((w) => ({ id: w.id, name: w.full_name || t('admin.main.fallbackWorker') })),
    [workersForSelect, t],
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

  const dowLabelsSunFirst = useMemo(
    () => [
      t('admin.main.dowSun'),
      t('admin.main.dowMon'),
      t('admin.main.dowTue'),
      t('admin.main.dowWed'),
      t('admin.main.dowThu'),
      t('admin.main.dowFri'),
      t('admin.main.dowSat'),
    ],
    [t],
  )

  const weekHdrMonFirst = useMemo(
    () => [
      t('admin.main.wkMon'),
      t('admin.main.wkTue'),
      t('admin.main.wkWed'),
      t('admin.main.wkThu'),
      t('admin.main.wkFri'),
      t('admin.main.wkSat'),
      t('admin.main.wkSun'),
    ],
    [t],
  )

  const planDates = useMemo(() => enumerateDates(dateFrom, dateTo, dowLabelsSunFirst), [dateFrom, dateTo, dowLabelsSunFirst])

  const planEntities = useMemo(() => {
    if (planMode === 'workers') {
      const base = workersForSelect.map((w) => ({ id: w.id, name: w.full_name || t('admin.main.fallbackWorker') }))
      const seen = new Set(base.map((r) => r.id))
      const extra: Array<{ id: string; name: string }> = []
      for (const j of schedule) {
        const wid = j.worker_id != null ? String(j.worker_id).trim() : ''
        if (!wid || seen.has(wid)) continue
        seen.add(wid)
        extra.push({ id: wid, name: j.worker_name || t('admin.main.fallbackWorker') })
      }
      extra.sort((a, b) => a.name.localeCompare(b.name))
      return [...base, ...extra]
    }
    const base = activeSites.map((s) => ({ id: s.id, name: s.name || t('admin.main.fallbackSite') }))
    const seen = new Set(base.map((r) => r.id))
    const extra: Array<{ id: string; name: string }> = []
    for (const j of schedule) {
      const sid = j.site_id != null ? String(j.site_id).trim() : ''
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      extra.push({ id: sid, name: j.site_name || t('admin.main.fallbackSite') })
    }
    extra.sort((a, b) => a.name.localeCompare(b.name))
    return [...base, ...extra]
  }, [planMode, workersForSelect, activeSites, schedule, t])

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
    const items = Array.isArray(sch?.items) ? sch.items : []

    // Load mini-avatars for workers that appear in schedule/table.
    const ids = Array.from(new Set(items.map((x) => x.worker_id).filter(Boolean))) as string[]
    if (ids.length) enqueueWorkerPhotoMeta(ids)

    setSchedule(items)
  }

  async function refreshAll() {
    const seq = ++refreshSeqRef.current
    setRefreshing(true)
    setError(null)
    try {
      // Previously sequential (core -> schedule) could exceed the safety-net; run in parallel (one fetch timeout, not two).
      await Promise.all([refreshCore(), refreshSchedule()])
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      if (seq === refreshSeqRef.current) setRefreshing(false)
    }
  }

  async function boot() {
  setError(null)
  setSessionLoading(true)
  try {
    const token = getAccessTokenOrNull()
    if (!token) {
      setSessionToken(null)
      setMeId(null)
      setSessionLoading(false)
      return
    }
    setSessionToken(token)
    // meId is optional: admin APIs enforce role themselves.
    setMeId(null)
  } catch (e: unknown) {
    setError(mapAdminErr(e, t))
    clearAuthTokens()
    setSessionToken(null)
    setMeId(null)
  } finally {
    setSessionLoading(false)
  }
}

  useEffect(() => {
  void boot()
  if (getAccessTokenOrNull()) void refreshAll()
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

  useEffect(() => {
    if (!sessionToken) return
    if (tab !== 'workers') return
    // Background-load photo counts + mini-avatars (concurrency-limited to avoid hammering the API).
    enqueueWorkerPhotoMeta(workers.map((w) => w.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, workers, sessionToken])

  useEffect(() => {
    if (!sessionToken) return
    if (tab !== 'plan') return
    void refreshSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sessionToken])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      if (!j?.access_token) throw new Error('admin.main.errToken')

      setAuthTokens(String(j.access_token), j.refresh_token ? String(j.refresh_token) : null)
      setSessionToken(String(j.access_token))
      setMeId(j?.user?.id || null)
      await refreshAll()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setBusy(true)
    setError(null)
    try {
      clearAuthTokens()
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

  async function inviteWorker() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const em = inviteEmail.trim()
      if (!em) throw new Error('admin.approvals.errNeedIdentifier')
      const out = await authFetchJson('/api/admin/workers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: em, role: 'worker', active: false }),
      })
      setInviteEmail('')
      const login = String((out as any)?.login || em)
      const pw = String((out as any)?.password || '')
      setNotice(t('admin.approvals.inviteNotice', { login, password: pw }))
      await refreshCore()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }


  function fillSiteCardFromSite(s: Site) {
    setSiteCardId(s.id)
    setSiteCardLocale('ru')
    setSiteLocDraft(siteToLocDraft(s))
    setSiteCardRadius(String(s.radius ?? 150))
    setSiteCardCategory(s.category ?? null)
    setSiteCardLat(s.lat == null ? '' : String(s.lat))
    setSiteCardLng(s.lng == null ? '' : String(s.lng))
    setSiteCardPhotos(Array.isArray(s.photos) ? (s.photos as any) : [])
    setPhotoUiError(null)
    setPhotoUiNotice(null)
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
    fillSiteCardFromSite(s)
    setSiteCardOpen(true)
  }

  async function createObjectSite() {
    const name = newObjName.trim()
    if (!name) return
    const address = newObjAddress.trim()
    if (!address) {
      setError(addressRequiredForCoordsMsg)
      return
    }

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
          address,
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function saveSiteCard() {
    if (!siteCardId) return
    const name = locDraftValue(siteLocDraft.name, siteCardLocale).trim()
    if (siteCardLocale === 'ru' && !name) return

    const radiusNum = Number(siteCardRadius)
    const radius = Number.isFinite(radiusNum) ? radiusNum : 150

    const latNum = siteCardLat.trim() === '' ? null : Number(siteCardLat)
    const lngNum = siteCardLng.trim() === '' ? null : Number(siteCardLng)

    const lat = latNum != null && Number.isFinite(latNum) ? latNum : null
    const lng = lngNum != null && Number.isFinite(lngNum) ? lngNum : null
    const addressRu = locDraftValue(siteLocDraft.address, "ru").trim() || null
    if (!addressRu) {
      setError(addressRequiredForCoordsMsg)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteCardId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editLocale: siteCardLocale,
          name,
          address: locDraftValue(siteLocDraft.address, siteCardLocale).trim() || null,
          address_ru: addressRu,
          radius,
          lat,
          lng,
          category: siteCardCategory,
          notes: locDraftValue(siteLocDraft.notes, siteCardLocale) || null,
        }),
      })

      if (res?.site) applySiteUpdate(res.site)
      setSiteCardOpen(false)
      await refreshCore()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function repairCoordinatesForSites() {
    setRepairingCoords(true)
    setError(null)
    try {
      const res = await authFetchJson<{ repaired?: string[]; failed?: Array<{ id: string; reason: string }> }>(
        '/api/admin/sites/repair-coordinates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteIds: sites
              .filter((s) => (s.lat == null || s.lng == null) && String(s.address || '').trim())
              .map((s) => s.id),
          }),
        },
      )
      const repaired = Array.isArray(res?.repaired) ? res.repaired.length : 0
      const failed = Array.isArray(res?.failed) ? res.failed.length : 0
      setNotice(t('admin.main.repairCoordsDone', { repaired, failed }))
      await refreshCore()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setRepairingCoords(false)
    }
  }

  const addressRequiredForCoordsMsg = t('admin.api.SITE_ADDRESS_REQUIRED_FOR_COORDINATES')

  async function fillSiteCardI18nEmpty() {
    if (!siteCardId) return
    setBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteCardId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fillMissingTranslations: true }),
      })
      if (res?.site) applySiteUpdate(res.site)
      await refreshCore()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function deleteObjectSite(siteId: string) {
    const ok = window.confirm(t('admin.main.confirmDeleteSite'))
    if (!ok) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson(`/api/admin/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' })
      if (siteCardId === siteId) setSiteCardOpen(false)
      await refreshCore()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function uploadSitePhotos(siteId: string, files: File[] | null) {
    if (!files || files.length === 0) return

    setPhotoBusy(true)
    setError(null)
    setPhotoUiError(null)
    setPhotoUiNotice(null)

    try {
      const current = (siteCardId === siteId ? siteCardPhotos.length : (sitesById.get(siteId)?.photos || []).length) || 0
      const left = Math.max(0, 5 - current)
      const toUpload = Array.from(files).slice(0, left)


      if (left <= 0) {
        setPhotoUiError(t('admin.main.photoLimit'))
        return
      }

      if (toUpload.length < files.length) {
        setPhotoUiNotice(t('admin.main.photoUploadBatch', { upload: toUpload.length, total: files.length }))
      }

      for (const f of toUpload) {
        const fd = new FormData()
        fd.append('file', f)
        const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}/photos`, {
          method: 'POST',
          body: fd,
        })
        if (res?.site) applySiteUpdate(res.site)
      }

      setPhotoUiNotice(toUpload.length > 1 ? t('admin.main.photoUploadedMany') : t('admin.main.photoUploadedOne'))
      await refreshCore()
    } catch (e: unknown) {
      setPhotoUiError(mapAdminErr(e, t))
      setError(mapAdminErr(e, t))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function makePrimaryPhoto(siteId: string, path: string) {
    setPhotoBusy(true)
    setError(null)
    setPhotoUiError(null)
    setPhotoUiNotice(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}/photos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'make_primary', path }),
      })
      if (res?.site) applySiteUpdate(res.site)
      setPhotoUiNotice(t('admin.common.noticeUpdated'))
      await refreshCore()
    } catch (e: unknown) {
      setPhotoUiError(mapAdminErr(e, t))
      setError(mapAdminErr(e, t))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removeSitePhoto(siteId: string, path: string) {
    setPhotoBusy(true)
    setError(null)
    setPhotoUiError(null)
    setPhotoUiNotice(null)
    try {
      const res = await authFetchJson<{ site: Site }>(`/api/admin/sites/${encodeURIComponent(siteId)}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (res?.site) applySiteUpdate(res.site)
      await refreshCore()
    } catch (e: unknown) {
      setPhotoUiError(mapAdminErr(e, t))
      setError(mapAdminErr(e, t))
    } finally {
      setPhotoBusy(false)
    }
  }

  async function setRole(workerId: string, role: 'admin' | 'worker') {
    if (role === 'worker' && meId && workerId === meId) {
      setError(t('admin.main.cantDemoteSelf'))
      return
    }
    const ok = window.confirm(role === 'admin' ? t('admin.main.confirmMakeAdmin') : t('admin.main.confirmMakeWorker'))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function setWorkerArchived(workerId: string, archive: boolean) {
    if (meId && workerId === meId) {
      setError(t('admin.main.cantArchiveSelf'))
      return
    }

    const ok = window.confirm(archive ? t('admin.main.confirmArchiveWorker') : t('admin.main.confirmRestoreWorker'))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function deleteWorker(workerId: string) {
    if (meId && workerId === meId) {
      setError(t('admin.main.cantDeleteSelf'))
      return
    }

    const ok = window.confirm(t('admin.main.confirmDeleteWorkerForever'))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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

    const tFrom = timeHHMM(j.scheduled_time)
    setEditTime(tFrom === '—' ? '' : tFrom)

    const tTo = timeHHMM(j.scheduled_end_time || null)
    setEditTimeTo(tTo === '—' ? '' : tTo)

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
          scheduled_end_time: editTimeTo || null,
          worker_id: editWorkerId || null,
          site_id: editSiteId || null,
          status: editStatus || null,
        }),
      })
      setEditOpen(false)
      await refreshSchedule()
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  async function loadWorkerCard(workerId: string) {
    const url = `/api/admin/schedule?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&worker_id=${encodeURIComponent(workerId)}`
    const sch = await authFetchJson<{ items: ScheduleItem[] }>(url)
    setWorkerCardItems(Array.isArray(sch?.items) ? sch.items : [])
  }

  async function loadWorkerPhotoMeta(workerId: string) {
    try {
      // 1) profile: resolve selected avatar if any
      let avatarPath = workerProfileById?.[workerId]?.avatar_path ?? null
      if (!avatarPath) {
        const prof = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`).catch(() => null as any)
        const w = prof?.worker
        if (w?.id) {
          setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
          avatarPath = w.avatar_path ?? null
        }
      }

      // 2) photos
      const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`)
      const photos = Array.isArray(res?.photos)
        ? res.photos.map((p) => ({ ...p, url: workerPhotoUrl(p) }))
        : []
      const thumb = avatarPath ? photos.find((p) => p.path === avatarPath)?.url || photos[0]?.url : photos[0]?.url
      setWorkerPhotoMeta((prev) => ({ ...prev, [workerId]: { count: Math.min(photos.length, 5), thumb } }))
    } catch {
      // ignore
    }
  }

  function applyWorkerPhotosState(workerId: string, photos: WorkerPhoto[]) {
    const normalized = (Array.isArray(photos) ? photos : []).map((p) => ({ ...p, url: workerPhotoUrl(p) }))
    setWorkerCardPhotos(normalized)
    const avatarPath = workerProfileById?.[workerId]?.avatar_path ?? workerCardAvatarPath ?? null
    const thumb = avatarPath ? normalized.find((p) => p.path === avatarPath)?.url || normalized[0]?.url : normalized[0]?.url
    setWorkerPhotoMeta((prev) => ({ ...prev, [workerId]: { count: Math.min(normalized.length, 5), thumb } }))
    return normalized
  }

  async function loadWorkerPhotos(workerId: string) {
    const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`)
    const photos = applyWorkerPhotosState(workerId, Array.isArray(res?.photos) ? res.photos : [])
    setWorkerPhotoUiError(null)
    setWorkerPhotoBroken({})
    if (photos.length > 0 && photos.every((p) => !p.url)) {
      setWorkerPhotoUiError('Фото получены, но ссылки на файлы недоступны. Проверьте storage URL.')
    }
  }

  async function loadWorkerProfile(workerId: string) {
    setWorkerProfileLoading(true)
    try {
      const res = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`)
      const w = res?.worker
      if (w?.id) {
        setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
        setWorkerLocDraft(workerToLocDraft(w))
        setWorkerCardEmail(String(w.email || ''))
        setWorkerCardPhone(String(w.phone || ''))
        setWorkerCardAvatarPath(w.avatar_path ?? null)
      }
    } finally {
      setWorkerProfileLoading(false)
    }
  }

  async function saveWorkerProfile(workerId: string) {
    const fn = locDraftValue(workerLocDraft.name, workerCardLocale).trim()
    if (workerCardLocale === 'ru' && !fn) return

    setWorkerProfileSaving(true)
    setError(null)
    try {
      const payload = {
        editLocale: workerCardLocale,
        full_name: fn || null,
        email: workerCardEmail.trim() || null,
        phone: workerCardPhone.trim() || null,
        notes: locDraftValue(workerLocDraft.notes, workerCardLocale) || null,
        avatar_path: workerCardAvatarPath || null,
      }
      const res = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const w = res?.worker
      if (w?.id) {
        setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
        // Update core workers list locally so the list does not flicker
        setWorkers((prev) => prev.map((x) => (x.id === workerId ? { ...x, full_name: w.full_name ?? x.full_name } : x)))
      }
      // Refresh list thumbnail
      await loadWorkerPhotoMeta(workerId)
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setWorkerProfileSaving(false)
    }
  }

  async function setWorkerAvatar(workerId: string, path: string) {
    setWorkerCardAvatarPath(path)
    try {
      const res = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_path: path }),
      })
      const w = res?.worker
      if (w?.id) {
        setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
        setWorkerCardAvatarPath(w.avatar_path ?? null)
      }
      await loadWorkerPhotoMeta(workerId)
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    }
  }

  async function uploadWorkerPhotos(workerId: string, files: File[]) {
    if (!files || files.length === 0) return

    setWorkerPhotoBusy(true)
    setError(null)
    setWorkerPhotoUiError(null)

    try {
      const current = workerCardPhotos.length || 0
      const left = Math.max(0, 5 - current)
      const toUpload = Array.from(files).slice(0, left)

      if (left <= 0) {
        setWorkerPhotoUiError(t('admin.main.photoLimit'))
        return
      }

      for (const f of toUpload) {
        const fd = new FormData()
        fd.append('file', f)
        const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`, {
          method: 'POST',
          body: fd,
        })
        const updated = applyWorkerPhotosState(workerId, Array.isArray(res?.photos) ? res.photos : [])
        setWorkerPhotoBroken({})
        if (updated.length === 0) {
          setWorkerPhotoUiError('Фото загружено, но не удалось прочитать список фотографий.')
        }
      }
    } catch (e: unknown) {
      setWorkerPhotoUiError(mapAdminErr(e, t))
      setError(mapAdminErr(e, t))
    } finally {
      setWorkerPhotoBusy(false)
    }
  }

  async function removeWorkerPhoto(workerId: string, path: string) {
    setWorkerPhotoBusy(true)
    setError(null)
    setWorkerPhotoUiError(null)
    try {
      const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const updated = applyWorkerPhotosState(workerId, Array.isArray(res?.photos) ? res.photos : [])
      setWorkerPhotoBroken((prev) => {
        const next = { ...prev }
        delete next[path]
        return next
      })
      setWorkerCardAvatarPath((prev) => (prev === path ? (updated[0]?.path ?? null) : prev))
    } catch (e: unknown) {
      setWorkerPhotoUiError(mapAdminErr(e, t))
      setError(mapAdminErr(e, t))
    } finally {
      setWorkerPhotoBusy(false)
    }
  }

  async function openWorkerCard(workerId: string) {
    setWorkerCardId(workerId)
    setWorkerCardOpen(true)
    setWorkerCardItems([])
    setWorkerCardPhotos([])
    setWorkerPhotoUiError(null)
    setWorkerPhotoBroken({})
    setError(null)

    const core = workersById.get(workerId)
    const cached = workerProfileById?.[workerId]
    setWorkerCardLocale('ru')
    setWorkerLocDraft(
      cached
        ? workerToLocDraft(cached)
        : workerToLocDraft({
            id: workerId,
            full_name: core?.full_name ?? null,
            notes: null,
          }),
    )
    setWorkerCardEmail(String(cached?.email ?? ''))
    setWorkerCardPhone(String(cached?.phone ?? ''))
    setWorkerCardAvatarPath(cached?.avatar_path ?? null)
    setWorkerResetResult(null)

    try {
      await Promise.all([loadWorkerCard(workerId), loadWorkerPhotos(workerId), loadWorkerProfile(workerId)])
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    }
  }

  async function fillWorkerCardI18nEmpty(workerId: string) {
    setWorkerProfileSaving(true)
    setError(null)
    try {
      const res = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fillMissingTranslations: true }),
      })
      const w = res?.worker
      if (w?.id) {
        setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
        setWorkerLocDraft(workerToLocDraft(w))
      }
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setWorkerProfileSaving(false)
    }
  }

  async function resetWorkerPassword(workerId: string) {
    setWorkerResetBusy(true)
    setWorkerResetResult(null)
    setError(null)
    setNotice(null)
    try {
      const confirmed = window.confirm('Сбросить пароль для этого работника? Будет показан новый временный пароль.')
      if (!confirmed) return
      const res = await authFetchJson<{ login?: string | null; temp_password?: string }>(`/api/admin/workers/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: workerId }),
      })
      const temp = String(res?.temp_password || '')
      if (!temp) throw new Error('admin.main.errSaveGeneric')
      setWorkerResetResult({
        login: res?.login ? String(res.login) : null,
        temp_password: temp,
      })
      setNotice('Пароль работника сброшен. Скопируйте новый временный пароль.')
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setWorkerResetBusy(false)
    }
  }

  async function copyWorkerTempPassword(value: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        throw new Error('clipboard_unavailable')
      }
      setNotice('Временный пароль скопирован.')
    } catch {
      setError('Не удалось скопировать пароль. Скопируйте вручную.')
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
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
    } catch (e: unknown) {
      setError(mapAdminErr(e, t))
    } finally {
      setBusy(false)
    }
  }

  function jobsInCell(args: { entityId: string; dateISO: string; hour?: string }) {
    const { entityId, dateISO, hour } = args
    const ent = String(entityId).trim()
    return schedule
      .filter((j) => {
        if (jobDateKey(j.job_date) !== dateISO) return false
        if (planMode === 'workers') {
          if (String(j.worker_id ?? '').trim() !== ent) return false
        } else {
          if (String(j.site_id ?? '').trim() !== ent) return false
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
    const left = planMode === 'workers' ? (j.site_name || t('admin.main.fallbackSite')) : (j.worker_name || t('admin.main.fallbackWorker'))
    const st = String(j.status || '')
    const timeText = timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)
    return (
      <div
        key={j.id}
        draggable
        onDragStart={(e) => dragSet(e, { job_id: j.id })}
        onClick={() => openEditForJob(j)}
        className={cn(
          'group cursor-pointer select-none rounded-2xl border bg-black/35 shadow-[0_10px_35px_rgba(0,0,0,0.55)]',
          'border-yellow-400/15 hover:border-yellow-300/40',
          compact ? 'text-[9px] px-2 py-1 leading-tight' : 'text-xs px-3 py-2'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {(() => {
                if (planMode === 'workers') {
                  const ss = j.site_id ? sitesById.get(j.site_id) : null
                  const photos = ss && Array.isArray((ss as any).photos) ? ((ss as any).photos as any[]) : []
                  const url = photos?.[0]?.url || null
                  if (!url) {
                    return (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[9px] font-semibold text-yellow-100/70">🏠</div>
                    )
                  }
                  return (
                     
                    <img src={url} alt="" className="h-5 w-5 rounded-full border border-yellow-400/15 object-cover" loading="lazy" />
                  )
                }

                const wid = j.worker_id || ''
                const thumb = wid ? workerPhotoMeta[wid]?.thumb || null : null
                if (!thumb) {
                  return (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[9px] font-semibold text-yellow-100/70">{initials(left)}</div>
                  )
                }
                return (
                   
                  <img src={thumb} alt="" className="h-5 w-5 rounded-full border border-yellow-400/15 object-cover" loading="lazy" />
                )
              })()}
              <div className="flex min-w-0 items-center gap-2">
              {planMode === 'sites' && !compact && j.worker_id && workerPhotoMeta[j.worker_id]?.thumb ? (
                 
                <img
                  src={workerPhotoMeta[j.worker_id]?.thumb || ''}
                  alt=""
                  className="h-5 w-5 flex-none rounded-full border border-yellow-400/20 object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="truncate font-semibold text-yellow-100">{left}</div>
            </div>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-zinc-300">
              <span>{timeText}</span>
              <StatusTag status={st} />
              {st === 'in_progress' && j.started_at ? (
                <ElapsedSince startedAt={j.started_at} />
              ) : null}
            </div>
          </div>

          {compact ? null : (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setCancelJobId(j.id)
                  setCancelOpen(true)
                }}
                className="rounded-xl border border-yellow-400/10 bg-black/25 px-2 py-1 text-[9px] text-zinc-200 hover:border-yellow-300/30"
              >
                {t('admin.main.cancelJob')}
              </button>

              {planMode === 'workers' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMoveJobId(j.id)
                    setMoveJobTargetWorker(j.worker_id || '')
                    setMoveJobOpen(true)
                  }}
                  className="rounded-xl border border-yellow-400/10 bg-black/25 px-2 py-1 text-[9px] text-zinc-200 hover:border-yellow-300/30"
                >
                  {t('admin.main.moveJob')}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderPlanToolbar() {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-yellow-400/15 bg-black/20 p-4">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <button
            onClick={() => {
              setPlanView('day')
              recalcRange('day', anchorDate)
            }}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition flex-1 text-center sm:flex-none',
              planView === 'day' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            {t('admin.main.planDay')}
          </button>
          <button
            onClick={() => {
              setPlanView('week')
              recalcRange('week', anchorDate)
            }}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition flex-1 text-center sm:flex-none',
              planView === 'week' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            {t('admin.main.planWeek')}
          </button>
          <button
            onClick={() => {
              setPlanView('month')
              recalcRange('month', anchorDate)
            }}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition flex-1 text-center sm:flex-none',
              planView === 'month' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            {t('admin.main.planMonth')}
          </button>

          <div className="mx-2 h-7 w-px bg-yellow-400/10" />

          <button
            onClick={() => setPlanMode('workers')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition flex-1 text-center sm:flex-none',
              planMode === 'workers' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            {t('admin.main.planByWorkers')}
          </button>
          <button
            onClick={() => setPlanMode('sites')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition flex-1 text-center sm:flex-none',
              planMode === 'sites' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            {t('admin.main.planBySites')}
          </button>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <label className="grid gap-1">
            <span className="text-[11px] text-zinc-300">{t('admin.main.labelDate')}</span>
            <input
              type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
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
              const todayIso = toISODate(new Date())
              setAnchorDate(todayIso)
              recalcRange(planView, todayIso)
            }}
            className="mt-5 rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
          >
            {t('admin.main.today')}
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
            {t('admin.main.moveDayBtn')}
          </button>
        </div>
      </div>
    )
  }

  function renderPlanWeekGrid() {
    return (
      <div className="mt-4 overflow-auto rounded-3xl border border-transparent bg-transparent dark:border-yellow-400/15 dark:bg-black/15">
        <div className="w-full overflow-x-auto">
        <div className="w-full">
          <div className="grid w-full" style={{ gridTemplateColumns: `170px repeat(${planDates.length}, minmax(0, 1fr))` }}>
            <div className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-4 py-3 text-xs font-semibold text-zinc-200">
              {planMode === 'workers' ? t('admin.main.colWorker') : t('admin.main.colSite')}
            </div>

            {planDates.map((d) => (
              <div key={d.iso} className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-4 py-3 text-xs font-semibold text-zinc-200">
                <span>
                  {d.dow} • {d.label}
                </span>
              </div>
            ))}

            {planEntities.map((ent) => (
              <div key={ent.id} className="contents">
                <div className="border-b border-yellow-400/10 bg-black/10 px-4 py-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0">
                      {planMode === 'workers' ? (
                        <button
                          onClick={() => openWorkerCard(ent.id)}
                          className="flex min-w-0 items-center gap-2 rounded-lg text-left hover:text-yellow-50"
                        >
                          {workerPhotoMeta[ent.id]?.thumb ? (
                            <img
                              src={workerPhotoMeta[ent.id]?.thumb || ''}
                              alt=""
                              className="h-6 w-6 flex-none rounded-full border border-yellow-400/20 object-cover"
                              loading="lazy"
                            />
                          ) : null}
                          <span className="truncate text-sm font-semibold text-yellow-100">{ent.name}</span>
                        </button>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2">
                          {workerPhotoMeta[ent.id]?.thumb ? (
                            <img
                              src={workerPhotoMeta[ent.id]?.thumb || ''}
                              alt=""
                              className="h-6 w-6 flex-none rounded-full border border-yellow-400/20 object-cover"
                              loading="lazy"
                            />
                          ) : null}
                          <div className="truncate text-sm font-semibold text-yellow-100">{ent.name}</div>
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-zinc-400">
                        {planMode === 'workers'
                          ? t('admin.main.workerSitesCount', { n: (workerSites.get(ent.id) || []).length })
                          : t('admin.main.assignedWorkersCount', {
                              n: (siteWorkers.get(ent.id) || []).filter((w) => (w.role || '') !== 'admin').length,
                            })}
                      </div>
                    </div>
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
                    className="border-b border-yellow-400/10 bg-black/5 px-2 py-2"
                  >
                    <div className="grid gap-1">
                      {jobsInCell({ entityId: ent.id, dateISO: d.iso }).map((j) => (
                        <div key={j.id} className="w-full min-w-0 overflow-hidden [&_*]:min-w-0">
                          {jobCard(j, true)}
                        </div>
                      ))}
                      <div className="h-auto min-h-[34px] rounded-2xl border border-dashed border-yellow-400/10 bg-black/10 px-2 py-1 text-[10px] text-zinc-500">
                        {t('admin.main.dropHere')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    )
  }

  function renderPlanDayGrid() {
    const dayISO = dateFrom
    return (
      <div className="mt-4 overflow-auto rounded-3xl border border-yellow-400/15 bg-black/15">
        <div className="w-full overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid" style={{ gridTemplateColumns: `70px repeat(${planEntities.length}, minmax(130px, 1fr))` }}>
            <div className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-3 py-3 text-xs font-semibold text-zinc-200">
              {t('admin.main.timeCol')}
            </div>

            {planEntities.map((ent) => (
              <div key={ent.id} className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                    {planMode === 'workers' && workerPhotoMeta[ent.id]?.thumb ? (
                       
                      <img
                        src={workerPhotoMeta[ent.id]?.thumb || ''}
                        alt=""
                        className="h-5 w-5 flex-none rounded-full border border-yellow-400/20 object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="truncate text-xs font-semibold text-yellow-100">{ent.name}</div>
                  </div>
                    <div className="text-[10px] text-zinc-400">{fmtD(dayISO)}</div>
                  </div>

                  {planMode === 'workers' ? (
                    <button
                      onClick={() => openWorkerCard(ent.id)}
                      className="rounded-xl border border-yellow-400/10 bg-black/25 px-2 py-1 text-[10px] text-zinc-200 hover:border-yellow-300/30"
                    >
                      {t('admin.main.cardShort')}
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
                        {t('admin.main.dropHere')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    )
  }

  function renderPlanMonthGrid() {
    const from = new Date(dateFrom + 'T00:00:00')
    const to = new Date(dateTo + 'T00:00:00')
    const first = new Date(from.getFullYear(), from.getMonth(), 1)
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate())

    const start = startOfWeek(first)
    const end = endOfWeek(last)

    const days = enumerateDates(toISODate(start), toISODate(end), dowLabelsSunFirst)

    return (
      <div className="mt-4 overflow-auto rounded-3xl border border-yellow-400/15 bg-black/15">
        <div className="w-full overflow-x-auto">
        <div className="min-w-[760px] p-4">
          <div className="grid grid-cols-7 gap-3">
            {weekHdrMonFirst.map((d, idx) => (
              <div key={idx} className="text-xs font-semibold text-zinc-300">
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
                      .filter((j) => jobDateKey(j.job_date) === d.iso)
                      .sort((a, b) => timeHHMM(a.scheduled_time).localeCompare(timeHHMM(b.scheduled_time)))
                      .slice(0, 3)
                      .map((j) => jobCard(j, true))}

                    {schedule.filter((j) => jobDateKey(j.job_date) === d.iso).length > 3 ? (
                      <div className="rounded-2xl border border-yellow-400/10 bg-black/15 px-3 py-2 text-[11px] text-zinc-400">
                        {t('admin.main.moreJobs', { n: schedule.filter((j) => jobDateKey(j.job_date) === d.iso).length - 3 })}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-dashed border-yellow-400/10 bg-black/10 px-3 py-2 text-[11px] text-zinc-500">
                      {t('admin.main.dropHere')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
            <div className="text-sm text-zinc-300">{t('admin.main.sessionChecking')}</div>
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
              <div className="text-lg font-semibold tracking-wide">{t('admin.main.headerTitle')}</div>
              <div className="text-xs text-yellow-200/70">{t('admin.main.headerTagline')}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
            <h1 className="text-xl font-semibold text-yellow-100">{t('admin.main.loginTitle')}</h1>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}

            {notice ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>
            ) : null}

            <form onSubmit={onLogin} className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">{t('admin.main.loginUserLabel')}</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="text"
                  autoComplete="username"
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="you@domain.com"
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">{t('admin.main.loginPassLabel')}</span>
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
                {busy ? t('admin.common.signingIn') : t('admin.common.signIn')}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }


  function payrollLabel(fromISO: string, toISO: string) {
    const f = fmtD(fromISO)
    const tt = fmtD(toISO)
    return `${f.slice(0, 5)} - ${tt.slice(0, 5)}`
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
              <div className="text-lg font-semibold tracking-wide">{t('admin.main.headerTitle')}</div>
              <div className="text-xs text-yellow-200/70">{t('admin.main.headerTagline')}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              disabled={busy || refreshing}
              className="rounded-xl border border-yellow-400/40 bg-black/40 px-4 py-2 text-sm text-yellow-100 transition hover:border-yellow-300/70 hover:bg-black/60 disabled:opacity-60"
            >
              {refreshing ? t('admin.main.refreshing') : t('admin.main.refreshData')}
            </button>

            <button
              onClick={onLogout}
              disabled={busy || refreshing}
              className="rounded-xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-sm text-yellow-100/90 transition hover:border-yellow-300/60 hover:bg-black/50 disabled:opacity-60"
            >
              {t('admin.common.logout')}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="adminTabRow flex flex-wrap items-center gap-2">
              {(['sites', 'workers', 'jobs', 'plan', 'reports'] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'rounded-2xl border px-4 py-2 text-xs font-semibold transition flex-1 text-center sm:flex-none',
                    tab === k ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                  )}
                >
                  {k === 'sites'
                    ? t('admin.main.tabSites')
                    : k === 'workers'
                      ? t('admin.main.tabWorkers')
                      : k === 'jobs'
                        ? t('admin.main.tabJobs')
                        : k === 'plan'
                          ? t('admin.main.tabPlan')
                          : t('admin.main.tabReports')}
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
                  {t('admin.main.showArchive')}
                </label>
              ) : null}

              <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-200">
                {t('admin.main.statsLine', { sites: sites.length, workers: workers.length, jobs: schedule.length })}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>
          ) : null}


          {/* Reports */}
          {tab === 'reports' ? (
            <ReportsPanel />
          ) : null}



          {/* Sites */}
                    {tab === 'sites' ? (
                      <div className="mt-6 grid gap-4">
                        <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-yellow-100">{t('admin.main.sitesSectionTitle')}</div>
                              <div className="mt-1 text-xs text-zinc-300">{t('admin.main.sitesSectionHint')}</div>
                            </div>

                            <button
                              onClick={() => setSiteCreateOpen(true)}
                              disabled={busy}
                              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                            >
                              {t('admin.main.addSite')}
                            </button>
                            <button
                              onClick={() => void repairCoordinatesForSites()}
                              disabled={busy || refreshing || repairingCoords}
                              className="inline-flex items-center justify-center rounded-full border border-sky-300/45 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-100 transition hover:border-sky-200/70 hover:bg-sky-500/15 disabled:opacity-60 [html[data-theme=light]_&]:border-sky-400/30 [html[data-theme=light]_&]:bg-sky-500/15 [html[data-theme=light]_&]:text-[#3b2414] [html[data-theme=light]_&]:hover:border-sky-500/50 [html[data-theme=light]_&]:hover:bg-sky-500/25"
                            >
                              {repairingCoords ? t('admin.main.processing') : t('admin.main.repairCoords')}
                            </button>
                          </div>

                          <div className="mt-4 flex flex-wrap items-end gap-2">
                            
                            <div className="w-full sm:w-[260px]">
                              <SearchableSelect
                                label={t('admin.main.qaSiteLabel')}
                                value={qaSite}
                                onChange={setQaSite}
                                disabled={busy}
                                placeholder={t('admin.main.pickSitePh')}
                                items={activeSites.map((s) => siteToSelectItem(s, t))}
                                inputClassName="w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                              />
                            </div>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">{t('admin.main.qaWorkerLabel')}</span>
                              <select
                                value={qaWorker}
                                onChange={(e) => setQaWorker(e.target.value)}
                                className="w-full sm:w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                              >
                                <option value="">{t('admin.main.pickWorkerPh')}</option>
                                {workersForSelect.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.full_name || t('admin.main.fallbackWorker')}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <button
                              onClick={quickAssign}
                              disabled={busy || !qaSite || !qaWorker}
                              className="w-full sm:w-auto rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                            >
                              {t('admin.main.assignBtn')}
                            </button>
                          </div>
                        </div>

                        {sites
                          .slice()
                          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                          .map((s) => {
                            const archived = !!s.archived_at
                            const assigned = (siteWorkers.get(s.id) || []).filter((w) => (w.role || '') !== 'admin')
                            const meta = siteCategoryMeta(s.category ?? null, t)
                            const photos = Array.isArray(s.photos) ? s.photos : []
                            const primaryUrl = photos?.[0]?.url || null

                            return (
                              <div key={s.id} className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
                                    <div className="w-full sm:w-[150px] shrink-0">
                                      {primaryUrl ? (
                                        <div className="relative h-[92px] w-full sm:w-[150px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
                                          { }
                                          <img
                                            src={primaryUrl}
                                            alt="site"
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                            onError={(e) => {
                                              try {
                                                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                                                ;(e.currentTarget as HTMLImageElement).removeAttribute('src')
                                              } catch {}
                                            }}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (s.lat != null && s.lng != null) {
                                                openNavForSite({ lat: s.lat, lng: s.lng, address: s.address || null })
                                                return
                                              }
                                              if (s.address) {
                                                openNavForSite({ lat: null, lng: null, address: s.address || null })
                                                return
                                              }
                                              openSiteCard(s)
                                            }}
                                            className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/0"
                                            title={(s.lat != null && s.lng != null) || !!s.address ? t('admin.main.navOrCard') : t('admin.main.openCard')}
                                          />
                                          <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">
                                            {(s.lat != null && s.lng != null) || !!s.address ? t('admin.main.navBadge') : t('admin.main.siteCardBtn')}
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
                                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                                        <button
                                          onClick={() => openSiteCard(s)}
                                          className="truncate text-left text-base font-semibold text-yellow-100 hover:underline"
                                          title={t('admin.main.openSiteCardTitle')}
                                        >
                                          {s.name || t('admin.main.fallbackSite')}
                                        </button>

                                        {archived ? (
                                          <span className="rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                                            {t('admin.main.badgeArchived')}
                                          </span>
                                        ) : (
                                          <span className="rounded-xl border border-yellow-300/40 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">
                                            {t('admin.main.badgeActive')}
                                          </span>
                                        )}

                                        <span className="inline-flex items-center gap-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-yellow-100/70">
                                          <span className={cn('h-2.5 w-2.5 rounded-full', meta.dotClass)} />
                                          {s.category ? `#${s.category}` : t('admin.main.noCategoryShort')}
                                        </span>
                                      </div>

                                      {s.address ? (
                                        <div className="mt-2 text-xs text-zinc-300">
                                          {t('admin.main.addressLabel')} {s.address}
                                        </div>
                                      ) : null}

                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <Pill>{t('admin.main.radiusPill', { m: s.radius ?? 150 })}</Pill>
                                        <Pill>
                                          {t('admin.main.gpsPill', {
                                            v:
                                              s.lat != null && s.lng != null
                                                ? `${s.lat}, ${s.lng}`
                                                : t('admin.main.gpsNone'),
                                          })}
                                        </Pill>
                                        <Pill>{t('admin.main.photosPill', { n: photos.length })}</Pill>
                                      </div>

                                      {s.notes ? (
                                        <div className="mt-2 text-xs text-zinc-300">
                                          {t('admin.main.notesLabel')} {String(s.notes).slice(0, 160)}
                                        </div>
                                      ) : null}

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
                                          {t('admin.main.siteCardBtn')}
                                        </button>

                                        <button
                                          onClick={() => deleteObjectSite(s.id)}
                                          disabled={busy}
                                          className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-red-500/25 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100/85 transition hover:border-red-400/45 disabled:opacity-60 [html[data-theme=light]_&]:border-rose-400/30 [html[data-theme=light]_&]:bg-rose-500/15 [html[data-theme=light]_&]:text-[#3b2414] [html[data-theme=light]_&]:hover:border-rose-500/50 [html[data-theme=light]_&]:hover:bg-rose-500/25"
                                        >
                                          {t('admin.main.delete')}
                                        </button>

                                        <button
                                          onClick={() => setArchived(s.id, !archived)}
                                          disabled={busy}
                                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                                        >
                                          {archived ? t('admin.main.restoreFromArchive') : t('admin.main.toArchive')}
                                        </button>
                                      </div>

                                      <div className="mt-3 text-xs text-zinc-300">{t('admin.main.assignedTo')}</div>
                                      {assigned.length === 0 ? (
                                        <div className="mt-1 text-xs text-zinc-500">—</div>
                                      ) : (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {assigned.map((w) => (
                                            <div key={w.id} className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs">
                                              <span className="text-zinc-100">{w.full_name || t('admin.main.fallbackWorker')}</span>
                                              <button
                                                onClick={() => unassign(s.id, w.id)}
                                                disabled={busy}
                                                className="rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-yellow-100/80 transition hover:border-yellow-300/50 disabled:opacity-60"
                                              >
                                                {t('admin.main.unassign')}
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                                    {!archived ? (
                                      <div className="flex flex-wrap items-end gap-2">
                                        <label className="grid gap-1">
                                          <span className="text-[11px] text-zinc-300">{t('admin.main.addWorkerHint')}</span>
                                          <select
                                            value={workerPickSite[s.id] || ''}
                                            onChange={(e) => setWorkerPickSite((p) => ({ ...p, [s.id]: e.target.value }))}
                                            className="w-full sm:w-[240px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                                          >
                                            <option value="">{t('admin.main.pickWorkerPh')}</option>
                                            {workersForSelect.map((w) => (
                                              <option key={w.id} value={w.id}>
                                                {w.full_name || t('admin.main.fallbackWorker')}
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
                                          className="w-full sm:w-auto rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                                        >
                                          {t('admin.main.assignBtn')}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                                        {t('admin.main.archivedSiteBanner')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}

                        <Modal open={siteCreateOpen} title={t('admin.main.modalNewSite')} onClose={() => setSiteCreateOpen(false)}>
                          <div className="grid gap-3">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">{t('admin.main.fieldName')}</span>
                              <input
                                value={newObjName}
                                onChange={(e) => setNewObjName(e.target.value)}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder={t('admin.main.phSiteExample')}
                              />
                            </label>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">{t('admin.main.fieldAddress')}</span>
                              <input
                                value={newObjAddress}
                                onChange={(e) => setNewObjAddress(e.target.value)}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder={t('admin.main.optional')}
                              />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">{t('admin.main.radiusM')}</span>
                                <input
                                  value={newObjRadius}
                                  onChange={(e) => setNewObjRadius(e.target.value)}
                                  className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  placeholder="150"
                                />
                              </label>

                              <div className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">{t('admin.main.category')}</span>
                                <CategoryPicker value={newObjCategory} onChange={setNewObjCategory} disabled={busy} />
                              </div>
                            </div>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">{t('admin.main.notes')}</span>
                              <textarea
                                value={newObjNotes}
                                onChange={(e) => setNewObjNotes(e.target.value)}
                                className="min-h-[100px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder={t('admin.main.optional')}
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={createObjectSite}
                                disabled={busy || !newObjName.trim()}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 disabled:opacity-60"
                              >
                                {t('admin.main.create')}
                              </button>
                              <button
                                onClick={() => setSiteCreateOpen(false)}
                                disabled={busy}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-5 py-3 text-sm text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          </div>
                        </Modal>

                        <Modal
                          open={siteCardOpen}
                          title={locDraftValue(siteLocDraft.name, lang) || t('admin.main.siteCardModalTitle')}
                          onClose={() => setSiteCardOpen(false)}
                        >
                          {!siteCardId ? (
                            <div className="text-sm text-zinc-300">{t('admin.main.noSite')}</div>
                          ) : (
                            <div className="grid gap-4">
                              <div className="flex flex-wrap items-center gap-2">
                                {(['ru', 'uk', 'en', 'nl'] as const).map((L) => (
                                  <button
                                    key={L}
                                    type="button"
                                    onClick={() => setSiteCardLocale(L)}
                                    className={cn(
                                      'rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
                                      siteCardLocale === L
                                        ? 'border-yellow-300/50 bg-yellow-400/15 text-yellow-50'
                                        : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/35',
                                    )}
                                  >
                                    {L === 'ru'
                                      ? t('languages.ru')
                                      : L === 'uk'
                                        ? t('languages.uk')
                                        : L === 'en'
                                          ? t('languages.en')
                                          : t('languages.nl')}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => void fillSiteCardI18nEmpty()}
                                  disabled={busy || !siteCardId}
                                  className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100/90 transition hover:border-sky-300/45 disabled:opacity-50"
                                >
                                  {t('admin.common.fillEmptyFromRu')}
                                </button>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.fieldName')}</span>
                                  <input
                                    value={locDraftValue(siteLocDraft.name, siteCardLocale)}
                                    onChange={(e) =>
                                      setSiteLocDraft((prev) => ({
                                        ...prev,
                                        name: { ...prev.name, [siteCardLocale]: e.target.value },
                                      }))
                                    }
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.fieldAddress')}</span>
                                  <input
                                    value={locDraftValue(siteLocDraft.address, siteCardLocale)}
                                    onChange={(e) =>
                                      setSiteLocDraft((prev) => ({
                                        ...prev,
                                        address: { ...prev.address, [siteCardLocale]: e.target.value },
                                      }))
                                    }
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.radiusM')}</span>
                                  <input
                                    value={siteCardRadius}
                                    onChange={(e) => setSiteCardRadius(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <div className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.category')}</span>
                                  <CategoryPicker value={siteCardCategory} onChange={setSiteCardCategory} disabled={busy} />
                                </div>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.lat')}</span>
                                  <input
                                    value={siteCardLat}
                                    onChange={(e) => setSiteCardLat(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                    placeholder={t('admin.main.phLat')}
                                  />
                                </label>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.lng')}</span>
                                  <input
                                    value={siteCardLng}
                                    onChange={(e) => setSiteCardLng(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                    placeholder={t('admin.main.phLng')}
                                  />
                                </label>

                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">{t('admin.main.notes')}</span>
                                  <textarea
                                    value={locDraftValue(siteLocDraft.notes, siteCardLocale)}
                                    onChange={(e) =>
                                      setSiteLocDraft((prev) => ({
                                        ...prev,
                                        notes: { ...prev.notes, [siteCardLocale]: e.target.value },
                                      }))
                                    }
                                    className="min-h-[120px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <div className="sm:col-span-2 flex flex-wrap gap-2">
                                  <button
                                    onClick={saveSiteCard}
                                    disabled={
                                      busy ||
                                      (siteCardLocale === 'ru' && !locDraftValue(siteLocDraft.name, siteCardLocale).trim())
                                    }
                                    className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 disabled:opacity-60"
                                  >
                                    {t('common.save')}
                                  </button>
                                  <button
                                    onClick={() => deleteObjectSite(siteCardId)}
                                    disabled={busy}
                                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-red-500/25 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100/85 transition hover:border-red-400/45 disabled:opacity-60 [html[data-theme=light]_&]:border-rose-400/30 [html[data-theme=light]_&]:bg-rose-500/15 [html[data-theme=light]_&]:text-[#3b2414] [html[data-theme=light]_&]:hover:border-rose-500/50 [html[data-theme=light]_&]:hover:bg-rose-500/25"
                                  >
                                    {t('admin.main.deleteSiteBtn')}
                                  </button>
                                </div>
                              </div>

                              {(() => {
                                const lat = siteCardLat.trim() === '' ? null : Number(siteCardLat)
                                const lng = siteCardLng.trim() === '' ? null : Number(siteCardLng)
                                if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null
                                return (
                                  <div className="grid gap-2">
                                    <div className="text-sm font-semibold text-yellow-100">{t('admin.main.mapTitle')}</div>
                                    <MapLarge lat={lat} lng={lng} />
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-yellow-100/70">
                                      <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={googleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                                        {t('admin.main.googleNav')}
                                      </a>
                                      <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={appleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                                        {t('admin.main.appleNav')}
                                      </a>
                                    </div>
                                  </div>
                                )
                              })()}

                              <div className="grid gap-2">
                                <div className="text-sm font-semibold text-yellow-100">{t('admin.main.photosSection')}</div>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs text-yellow-100/55">{t('admin.main.nowCount', { n: siteCardPhotos.length })}</div>

                                  <div className="flex flex-wrap gap-2">
                                    <label
                                      className={cn(
                                        'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40',
                                        photoBusy || !siteCardId || siteCardPhotos.length >= 5 ? 'opacity-70' : ''
                                      )}
                                    >
                                      {t('admin.main.uploadPhoto')}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        disabled={photoBusy || !siteCardId || siteCardPhotos.length >= 5}
                                        className="hidden"
                                        onChange={async (e) => {
                                          const input = e.target as HTMLInputElement
                                          const files = input.files ? Array.from(input.files) : []
                                          input.value = ''
                                          if (!siteCardId) {
                                            setPhotoUiError(t('admin.main.errSiteIdMissing'))
                                            return
                                          }
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
                                      {t('admin.main.takePhoto')}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        disabled={photoBusy || !siteCardId || siteCardPhotos.length >= 5}
                                        className="hidden"
                                        onChange={async (e) => {
                                          const input = e.target as HTMLInputElement
                                          const files = input.files ? Array.from(input.files) : []
                                          input.value = ''
                                          if (!siteCardId) {
                                            setPhotoUiError(t('admin.main.errSiteIdMissing'))
                                            return
                                          }
                                          await uploadSitePhotos(siteCardId, files)
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>


                                {photoUiError ? (
                                  <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-3 text-xs text-red-100/85">
                                    {photoUiError}
                                  </div>
                                ) : null}

                                {photoUiNotice ? (
                                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-100/85">
                                    {photoUiNotice}
                                  </div>
                                ) : null}

                                {siteCardPhotos.length === 0 ? (
                                  <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">
                                    {t('admin.main.noPhotos')}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    {siteCardPhotos.map((p, idx) => (
                                      <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                                        { }
                                        <img
                                          src={p.url || ''}
                                          alt="site"
                                          className="h-36 w-full object-cover"
                                          loading="lazy"
                                          onError={(e) => {
                                            try {
                                              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                                              ;(e.currentTarget as HTMLImageElement).removeAttribute('src')
                                            } catch {}
                                          }}
                                        />

                                        <div className="absolute left-2 top-2 rounded-xl border border-yellow-400/15 bg-black/50 px-2 py-1 text-[11px] text-yellow-100/80">
                                          {idx === 0 ? t('admin.main.primaryBadge') : ''}
                                        </div>

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
                                              {t('admin.main.primaryBtn')}
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
                                            {t('admin.main.delete')}
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {photoBusy ? <div className="text-xs text-yellow-100/45">{t('admin.main.processing')}</div> : null}
                              </div>
                            </div>
                          )}
                        </Modal>
                      </div>
	                    ) : null}


          {/* Workers */}
          {tab === 'workers' ? (
            <div className="mt-6 grid gap-3">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">{t('admin.main.workersCreateTitle')}</div>
                    <div className="mt-1 text-xs text-zinc-300">{t('admin.main.workersCreateHint')}</div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.loginUserLabel')}</span>
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        type="text"
                        autoComplete="username"
                        className="w-full sm:w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                        placeholder={t('admin.main.invitePlaceholder')}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void inviteWorker()}
                      disabled={busy || !inviteEmail.trim()}
                      className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                    >
                      {t('admin.main.create')}
                    </button>
                  </div>
                </div>
              </div>

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
                        <div className="flex items-start gap-3">
                          <div className="relative mt-0.5 h-10 w-10">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[12px] font-semibold text-yellow-100/80">
                              {initials(w.full_name)}
                            </div>
                            {workerPhotoMeta[w.id]?.thumb ? (
                               
                              <img
                                src={workerPhotoMeta[w.id]?.thumb || ''}
                                alt="avatar"
                                className="absolute inset-0 h-10 w-10 rounded-full border border-yellow-400/20 object-cover shadow-sm"
                                loading="lazy"
                                onError={(e) => {
                                  try {
                                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                                    ;(e.currentTarget as HTMLImageElement).removeAttribute('src')
                                  } catch {}
                                }}
                              />
                            ) : null}
                            <div className="absolute -bottom-1 -right-1 rounded-xl border border-yellow-400/20 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-100">
                              {(workerPhotoMeta[w.id]?.count ?? '…')}/5
                            </div>
                          </div>

                          <div className="min-w-full sm:w-[220px]">
                            <div className="text-base font-semibold text-yellow-100">
                              <button onClick={() => openWorkerCard(w.id)} className="hover:text-yellow-100">
                                {w.full_name || t('admin.main.noName')}
                              </button>{' '}
                            {isAdmin ? (
                              <span className="ml-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">
                                {t('admin.main.badgeAdmin')}
                              </span>
                            ) : (
                              <span className="ml-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                                {t('admin.main.badgeWorker')}
                              </span>
                            )}
                            {w.active === false ? (
                              <span className="ml-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                                {t('admin.main.badgeDisabled')}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 text-xs text-zinc-300">{t('admin.main.sitesColon')}</div>
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
                                    {t('admin.main.unassign')}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            {!isAdmin ? (
                              <button
                                onClick={() => setRole(w.id, 'admin')}
                                disabled={busy}
                                className="w-full sm:w-auto rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                              >
                                {t('admin.main.makeAdmin')}
                              </button>
                            ) : (
                              <button
                                onClick={() => setRole(w.id, 'worker')}
                                disabled={busy || isMe}
                                className="w-full sm:w-auto rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                              >
                                {t('admin.main.makeWorker')}
                              </button>
                            )}
                          </div>

                          {!isAdmin ? (
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                              <button
                                onClick={() => setWorkerArchived(w.id, w.active !== false)}
                                disabled={busy}
                                className={cn(
                                  'w-full sm:w-auto rounded-2xl border px-4 py-2 text-xs font-semibold transition disabled:opacity-60',
                                  w.active === false
                                    ? 'border-yellow-300/45 bg-yellow-400/10 text-yellow-100 hover:border-yellow-200/70 hover:bg-yellow-400/15'
                                    : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                                )}
                              >
                                {w.active === false ? t('admin.main.restoreWorker') : t('admin.main.archiveWorker')}
                              </button>

                              <button
                                onClick={() => deleteWorker(w.id)}
                                disabled={busy}
                                className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/40 hover:bg-red-500/15 disabled:opacity-60 [html[data-theme=light]_&]:border-rose-400/30 [html[data-theme=light]_&]:bg-rose-500/15 [html[data-theme=light]_&]:text-[#3b2414] [html[data-theme=light]_&]:hover:border-rose-500/50 [html[data-theme=light]_&]:hover:bg-rose-500/25"
                              >
                                {t('admin.main.delete')}
                              </button>
                            </div>
                          ) : null}

                          {!isAdmin ? (
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
                              
<div className="grid w-full gap-1 sm:w-auto">
  <SearchableSelect
    label={t('admin.main.addSiteLabel')}
    value={pick}
    onChange={(id) => setWorkerPickSite((p) => ({ ...p, [w.id]: id }))}
    items={activeSites.map((s) => siteToSelectItem(s, t))}
    placeholder={t('admin.main.pickSitePh')}
    disabled={busy}
    inputClassName="w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
  />
</div>

                              <button
                                onClick={() => pick && assign(pick, w.id)}
                                disabled={busy || !pick}
                                className="w-full sm:w-auto rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                              >
                                {t('admin.main.assignBtn')}
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                              {t('admin.main.adminNoAssign')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : null}

          {/* Shifts / jobs */}
          {tab === 'jobs' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="text-sm font-semibold text-yellow-100">{t('admin.main.jobsCreateTitle')}</div>
                <div className="mt-1 text-xs text-zinc-300">{t('admin.main.jobsCreateHint')}</div>

                <div className="mt-4 w-full max-w-5xl space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[minmax(260px,340px)_minmax(360px,520px)]">
                    <div className="grid max-w-[340px] gap-1">
                      <SearchableSelect
                        label={t('admin.main.labelSite')}
                        value={newSiteId}
                        onChange={(v) => {
                          setNewSiteId(v)
                          setNewWorkers([])
                        }}
                        items={activeSites.map((s) => siteToSelectItem(s, t))}
                        placeholder={t('admin.main.pickSitePh')}
                        disabled={busy}
                        inputClassName="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-300/60"
                      />
                    </div>

                    <label className="grid max-w-[520px] gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.labelWorkersMulti')}</span>
                      <MultiWorkerPicker workers={workersForPicker} value={newWorkers} onChange={setNewWorkers} disabled={!newSiteId} />
                    </label>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(180px,220px)_minmax(300px,360px)]">
                    <label className="grid max-w-[220px] gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.labelDate')}</span>
                      <input
                        type="date"
                        onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-300/60"
                      />
                    </label>

                    <div className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.labelTime')}</span>
                      <div className="flex flex-wrap gap-3">
                        <label className="grid w-[150px] gap-1">
                          <span className="text-[11px] text-zinc-400">{t('admin.main.labelTime')}</span>
                          <input
                            type="time"
                            value={newTime}
                            onChange={(e) => setNewTime(e.target.value)}
                            className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-300/60"
                          />
                        </label>
                        <label className="grid w-[150px] gap-1">
                          <span className="text-[11px] text-zinc-400">{t('admin.main.labelEnd')}</span>
                          <input
                            type="time"
                            onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                            value={newTimeTo}
                            onChange={(e) => setNewTimeTo(e.target.value)}
                            className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2.5 text-sm outline-none transition focus:border-yellow-300/60"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={createJobs}
                    disabled={busy || !newSiteId || newWorkers.length === 0}
                    className="w-auto max-w-[260px] rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2.5 text-center text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy
                      ? t('admin.main.creating')
                      : !newSiteId
                        ? t('admin.main.pickSiteFirst')
                        : newWorkers.length === 0
                          ? t('admin.main.pickWorkersFirst')
                          : t('admin.main.createShift')}
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setJobsView('table')}
                      className={cn(
                        'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                        jobsView === 'table' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                      )}
                    >
                      {t('admin.main.viewTable')}
                    </button>
                    <button
                      onClick={() => setJobsView('board')}
                      className={cn(
                        'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                        jobsView === 'board' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                      )}
                    >
                      {t('admin.main.viewBoard')}
                    </button>
                  </div>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setAnchorDate(toISODate(new Date()))
                        recalcRange('day', toISODate(new Date()))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      {t('admin.main.today')}
                    </button>
                    <button
                      onClick={() => {
                        const d = new Date()
                        setAnchorDate(toISODate(d))
                        setDateFrom(toISODate(startOfWeek(d)))
                        setDateTo(toISODate(endOfWeek(d)))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      {t('admin.main.planWeek')}
                    </button>
                    <button
                      onClick={() => {
                        const d = new Date()
                        setAnchorDate(toISODate(d))
                        setDateFrom(toISODate(startOfMonth(d)))
                        setDateTo(toISODate(endOfMonth(d)))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      {t('admin.main.planMonth')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-yellow-100">{t('admin.main.filtersTitle')}</div>

                  <div className="mt-4 grid w-full gap-3 lg:grid-cols-4">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.dateFrom')}</span>
                      <input
                        type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.dateTo')}</span>
                      <input
                        type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      />
                    </label>

                    
<div className="grid gap-1">
  <SearchableSelect
    label={t('admin.main.labelSite')}
    value={filterSite}
    onChange={(v) => setFilterSite(v)}
    items={sites.slice().map((s) => siteToSelectItem(s, t))}
    placeholder={t('admin.main.allSites')}
    inputClassName="w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
  />
</div>

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">{t('admin.main.colWorker')}</span>
                      <select
                        value={filterWorker}
                        onChange={(e) => setFilterWorker(e.target.value)}
                        className="w-full rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">{t('admin.main.allWorkers')}</option>
                        {workers
                          .slice()
                          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name || t('admin.main.noName')}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>

                {jobsView === 'board' ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    {[
                      { key: 'planned', title: t('admin.main.jobPlanned'), items: planned },
                      { key: 'in_progress', title: t('admin.main.jobInProgress'), items: inProgress },
                      { key: 'done', title: t('admin.main.jobDone'), items: done },
                      { key: 'cancelled', title: t('admin.main.jobCancelled'), items: cancelled },
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
                  <div className="mt-5">
                    <div className="grid gap-2 lg:hidden">
                    {scheduleFiltered
                      .slice()
                      .sort((a, b) => `${a.job_date || ''} ${timeHHMM(a.scheduled_time)}`.localeCompare(`${b.job_date || ''} ${timeHHMM(b.scheduled_time)}`))
                      .map((j) => (
                        <div key={j.id} className="rounded-3xl border border-yellow-400/10 bg-black/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-zinc-100">
                              {fmtD(j.job_date)} • {timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)}
                            </div>
                            <div className="text-xs"><StatusTag status={String(j.status || '')} /></div>
                          </div>

                          {String(j.status || '') === 'planned' && j.worker_id ? (
                            <div className="mt-1 text-[11px] font-semibold text-yellow-100/80">{t('admin.main.accepted')}</div>
                          ) : null}

                          <div className="mt-3 grid gap-2 text-xs text-zinc-200">
                            <div className="flex gap-2">
                              <span className="text-zinc-400">{t('admin.main.labelSiteColon')}</span>
                              <span className="truncate">{j.site_name || '—'}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-zinc-400">{t('admin.main.labelWorkerColon')}</span>
                              <span className="truncate">{j.worker_name || '—'}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-zinc-400">{t('admin.main.startedColon')}</span>
                              <span>{fmtDT(j.started_at)}</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-zinc-400">{t('admin.main.stoppedColon')}</span>
                              <span>{fmtDT(j.stopped_at)}</span>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => openEditForJob(j)}
                              className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                            >
                              {t('admin.main.edit')}
                            </button>
                          </div>
                        </div>
                      ))}
                    {scheduleFiltered.length === 0 ? (
                      <div className="rounded-3xl border border-yellow-400/10 bg-black/20 p-6 text-center text-xs text-zinc-500">
                        {t('admin.main.noShifts')}
                      </div>
                    ) : null}
                  </div>

                    <div className="hidden lg:block">
                      <div className="overflow-auto rounded-3xl border border-yellow-400/10 bg-black/20">
                    <table className="min-w-[920px] w-full text-left text-sm">
                      <thead className="bg-black/30 text-xs text-zinc-300">
                        <tr>
                          <th className="px-4 py-3">{t('admin.main.thDate')}</th>
                          <th className="px-4 py-3">{t('admin.main.thTime')}</th>
                          <th className="px-4 py-3">{t('admin.main.thSite')}</th>
                          <th className="px-4 py-3">{t('admin.main.thWorker')}</th>
                          <th className="px-4 py-3">{t('admin.main.thStatus')}</th>
                          <th className="px-4 py-3">{t('admin.main.thStarted')}</th>
                          <th className="px-4 py-3">{t('admin.main.thStopped')}</th>
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
                              <td className="px-4 py-3">
                                <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                                  {(() => {
                                    const ss = j.site_id ? sitesById.get(j.site_id) : null
                                    const photos = ss && Array.isArray((ss as any).photos) ? ((ss as any).photos as any[]) : []
                                    const url = photos?.[0]?.url || null
                                    const canNav = !!ss && (((ss as any).lat != null && (ss as any).lng != null) || !!(ss as any).address)
                                    if (!url) return null
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (!ss) return
                                          if ((ss as any).lat != null && (ss as any).lng != null) {
                                            openNavForSite({ lat: (ss as any).lat, lng: (ss as any).lng, address: (ss as any).address || null })
                                            return
                                          }
                                          if ((ss as any).address) {
                                            openNavForSite({ lat: null, lng: null, address: (ss as any).address || null })
                                          }
                                        }}
                                        className={cn(
                                          'relative h-7 w-10 overflow-hidden rounded-xl border border-yellow-400/15 bg-black/30',
                                          canNav ? 'hover:border-yellow-300/40' : ''
                                        )}
                                        title={canNav ? t('admin.main.navOpen') : t('admin.main.navPhotoObject')}
                                      >
                                        { }
                                        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                                      </button>
                                    )
                                  })()}
                                  <span>{j.site_name || '—'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {j.worker_id ? (
                                  <button
                                    onClick={() => openWorkerCard(j.worker_id!)}
                                    className="flex items-center gap-2 text-yellow-100 hover:text-yellow-50"
                                  >
                                    {workerPhotoMeta[j.worker_id!]?.thumb ? (
                                       
                                      <img
                                        src={workerPhotoMeta[j.worker_id!]?.thumb || ''}
                                        alt=""
                                        className="h-6 w-6 rounded-full border border-yellow-400/20 object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[10px] font-semibold text-yellow-100/80">
                                        {initials(j.worker_name)}
                                      </span>
                                    )}
                                    <span className="truncate">{j.worker_name || '—'}</span>
                                  </button>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="grid gap-1">
                                  <StatusPill status={String(j.status || '')} startedAt={j.started_at} />
                                  {String(j.status || '') === 'planned' && j.worker_id ? (
                                    <div className="text-[11px] font-semibold text-yellow-100/80">{t('admin.main.accepted')}</div>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3">{fmtDT(j.started_at)}</td>
                              <td className="px-4 py-3">{fmtDT(j.stopped_at)}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => openEditForJob(j)}
                                  className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
                                >
                                  {t('admin.main.edit')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        {scheduleFiltered.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-xs text-zinc-500">
                              {t('admin.main.noShifts')}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Schedule / plan */}
          {tab === 'plan' ? (
            <div className="mt-6">
              {renderPlanToolbar()}

              {planView === 'week' ? renderPlanWeekGrid() : null}
              {planView === 'day' ? renderPlanDayGrid() : null}
              {planView === 'month' ? renderPlanMonthGrid() : null}

              <div className="mt-4 rounded-3xl border border-yellow-400/15 bg-black/20 p-4 text-xs text-zinc-300">
                {t('admin.main.planHint')}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal: edit shift */}
      <Modal open={editOpen} title={t('admin.main.editJobTitle')} onClose={() => setEditOpen(false)}>
        <div className="grid gap-3">
          
<div className="grid gap-1">
  <SearchableSelect
    label={t('admin.main.labelSite')}
    value={editSiteId}
    onChange={(v) => setEditSiteId(v)}
    items={[{ id: '', label: '—', dotClass: 'bg-zinc-500' }, ...activeSites.map((s) => siteToSelectItem(s, t))]}
    placeholder="—"
    inputClassName="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
  />
</div>

          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">{t('admin.main.workerField')}</span>
            <select
              value={editWorkerId}
              onChange={(e) => setEditWorkerId(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">—</option>
              {workersForSelect.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || t('admin.main.fallbackWorker')}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">{t('admin.main.labelDate')}</span>
              <input
                type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">{t('admin.main.startTime')}</span>
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">{t('admin.main.labelEnd')}</span>
              <input
                type="time"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
                value={editTimeTo}
                onChange={(e) => setEditTimeTo(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
          </div>

          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">{t('admin.main.status')}</span>
            <select
              value={String(editStatus)}
              onChange={(e) => setEditStatus(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="planned">{t('admin.main.jobPlanned')}</option>
              <option value="in_progress">{t('admin.main.jobInProgress')}</option>
              <option value="done">{t('admin.main.jobDone')}</option>
              <option value="cancelled">{t('admin.main.jobCancelled')}</option>
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
              {t('admin.main.cancelShiftBtn')}
            </button>

            <button
              onClick={saveEdit}
              disabled={busy || !editJobId}
              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: worker card */}
      <Modal
        open={workerCardOpen}
        title={t('admin.main.workerCardTitle')}
        onClose={() => setWorkerCardOpen(false)}
        scopeClassName="workerCardModalTheme"
      >
        <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
          {(() => {
            const w = workersById.get(workerCardId)
            const archived = w?.active === false
            const role = w?.role === 'admin' ? t('admin.main.roleAdmin') : t('admin.main.roleWorker')

            return (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">{w?.full_name || t('admin.main.fallbackWorker')}</div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {role}
                      {archived ? t('admin.main.archivedMark') : t('admin.main.activeMark')}
                      <span className="text-zinc-500"> • </span>
                      <span className="text-zinc-400">ID:</span>{' '}
                      <span className="font-mono text-[11px] text-zinc-400">{workerCardId}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {t('admin.main.rangeLine', { from: fmtD(dateFrom), to: fmtD(dateTo) })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-yellow-100">{t('admin.main.dataNotesTitle')}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {w?.role !== 'admin' ? (
                        <button
                          onClick={() => {
                            if (!workerCardId) return
                            void resetWorkerPassword(workerCardId)
                          }}
                          disabled={workerResetBusy || !workerCardId}
                          className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-[#3b2414] disabled:text-[#3b2414] disabled:opacity-100 hover:border-red-300/55 dark:text-red-100 dark:disabled:text-red-100"
                        >
                          {workerResetBusy ? 'Сбрасываю…' : 'Сбросить пароль'}
                        </button>
                      ) : null}

                      <button
                        onClick={() => {
                          if (!workerCardId) return
                          void saveWorkerProfile(workerCardId)
                        }}
                        disabled={
                          workerProfileSaving ||
                          !workerCardId ||
                          (workerCardLocale === 'ru' && !locDraftValue(workerLocDraft.name, workerCardLocale).trim())
                        }
                        className={cn(
                          'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70',
                          workerProfileSaving ? 'opacity-70' : '',
                        )}
                      >
                        {workerProfileSaving ? t('admin.main.saving') : t('common.save')}
                      </button>
                    </div>
                  </div>

                  {workerResetResult ? (
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-100/90">
                      <div className="font-semibold">Новый временный пароль (показан один раз):</div>
                      <div className="mt-1 break-all">
                        Логин: <span className="font-mono">{workerResetResult.login || '—'}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm">{workerResetResult.temp_password}</span>
                        <button
                          type="button"
                          onClick={() => void copyWorkerTempPassword(workerResetResult.temp_password)}
                          className="rounded-lg border border-emerald-300/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-50 hover:border-emerald-200/60"
                        >
                          Скопировать
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {workerProfileLoading ? (
                    <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">
                      {t('admin.main.loadingData')}
                    </div>
                  ) : (
                    <div className="grid gap-2 rounded-3xl border border-yellow-400/10 bg-black/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {(['ru', 'uk', 'en', 'nl'] as const).map((L) => (
                          <button
                            key={L}
                            type="button"
                            onClick={() => setWorkerCardLocale(L)}
                            className={cn(
                              'rounded-xl border px-3 py-1.5 text-xs font-semibold transition',
                              workerCardLocale === L
                                ? 'border-yellow-300/50 bg-yellow-400/15 text-[#3b2414] disabled:text-[#3b2414] disabled:opacity-100 dark:text-yellow-50 dark:disabled:text-yellow-50'
                                : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/35',
                            )}
                          >
                            {L === 'ru'
                              ? t('languages.ru')
                              : L === 'uk'
                                ? t('languages.uk')
                                : L === 'en'
                                  ? t('languages.en')
                                  : t('languages.nl')}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            if (!workerCardId) return
                            void fillWorkerCardI18nEmpty(workerCardId)
                          }}
                          disabled={workerProfileSaving || !workerCardId}
                          className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100/90 transition hover:border-sky-300/45 disabled:opacity-50"
                        >
                          {t('admin.common.fillEmptyFromRu')}
                        </button>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-1">
                          <div className="text-[11px] text-zinc-400">{t('admin.main.fio')}</div>
                          <input
                            value={locDraftValue(workerLocDraft.name, workerCardLocale)}
                            onChange={(e) =>
                              setWorkerLocDraft((prev) => ({
                                ...prev,
                                name: { ...prev.name, [workerCardLocale]: e.target.value },
                              }))
                            }
                            placeholder={t('admin.main.workerNamePh')}
                            className="w-full rounded-xl border border-yellow-400/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                          />
                        </div>

                        <div className="grid gap-1">
                          <div className="text-[11px] text-zinc-400">{t('admin.main.contacts')}</div>
                          <div className="grid gap-2">
                            <input
                              value={workerCardEmail}
                              onChange={(e) => setWorkerCardEmail(e.target.value)}
                              placeholder={t('admin.main.emailLoginPh')}
                              autoComplete="email"
                              className="w-full rounded-xl border border-yellow-400/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                            />
                            <input
                              value={workerCardPhone}
                              onChange={(e) => setWorkerCardPhone(e.target.value)}
                              placeholder={t('admin.main.phoneSmsPh')}
                              className="w-full rounded-xl border border-yellow-400/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-1">
                        <div className="text-[11px] text-zinc-400">{t('admin.main.notes')}</div>
                        <textarea
                          value={locDraftValue(workerLocDraft.notes, workerCardLocale)}
                          onChange={(e) =>
                            setWorkerLocDraft((prev) => ({
                              ...prev,
                              notes: { ...prev.notes, [workerCardLocale]: e.target.value },
                            }))
                          }
                          placeholder={t('admin.main.notesPh')}
                          rows={4}
                          className="w-full resize-none rounded-2xl border border-yellow-400/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold text-yellow-100">{t('admin.main.photosSection')}</div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-yellow-100/55">{t('admin.main.nowCount', { n: workerCardPhotos.length })}</div>

                    <div className="flex flex-wrap gap-2">
                      <label
                        className={cn(
                          'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40',
                          workerPhotoBusy || !workerCardId || workerCardPhotos.length >= 5 ? 'opacity-70' : ''
                        )}
                      >
                        {t('admin.main.uploadPhoto')}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={workerPhotoBusy || !workerCardId || workerCardPhotos.length >= 5}
                          className="hidden"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || [])
                            e.target.value = ''
                            if (!workerCardId) return
                            await uploadWorkerPhotos(workerCardId, files)
                          }}
                        />
                      </label>

                      <label
                        className={cn(
                          'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70',
                          workerPhotoBusy || !workerCardId || workerCardPhotos.length >= 5 ? 'opacity-70' : ''
                        )}
                      >
                        {t('admin.main.takePhoto')}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={workerPhotoBusy || !workerCardId || workerCardPhotos.length >= 5}
                          className="hidden"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || [])
                            e.target.value = ''
                            if (!workerCardId) return
                            await uploadWorkerPhotos(workerCardId, files)
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {workerCardPhotos.length === 0 ? (
                    <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">
                      {t('admin.main.noPhotos')}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {workerCardPhotos.map((p) => (
                        <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                          {workerPhotoBroken[p.path] ? (
                            <div className="grid h-36 w-full place-items-center px-2 text-center text-[11px] text-red-200/85">
                              Фото не загрузилось
                            </div>
                          ) : (
                            <img
                              src={p.url || workerPhotoUrl(p)}
                              alt={t('admin.main.roleWorker')}
                              className="h-36 w-full object-cover"
                              loading="lazy"
                              onError={() => {
                                setWorkerPhotoBroken((prev) => ({ ...prev, [p.path]: true }))
                                setWorkerPhotoUiError('Часть фото не загрузилась (ошибка доступа или повреждённый файл).')
                              }}
                            />
                          )}

                          <div className="absolute right-2 top-2">
                            <button
                              onClick={() => {
                                if (!workerCardId) return
                                void removeWorkerPhoto(workerCardId, p.path)
                              }}
                              disabled={workerPhotoBusy || !workerCardId}
                              className={cn(
                                'rounded-xl border border-red-500/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-100/85',
                                workerPhotoBusy ? 'opacity-70' : 'hover:border-red-400/45'
                              )}
                            >
                              {t('admin.main.delete')}
                            </button>
                          </div>

                          <div className="absolute left-2 top-2 flex gap-2">
                            <button
                              onClick={() => {
                                if (!workerCardId) return
                                void setWorkerAvatar(workerCardId, p.path)
                              }}
                              disabled={workerPhotoBusy || !workerCardId}
                              className={cn(
                                'rounded-xl border bg-black/40 px-2 py-1 text-[11px] text-yellow-100/85',
                                workerCardAvatarPath === p.path
                                  ? 'border-yellow-300/60 bg-yellow-400/15'
                                  : 'border-yellow-400/15 hover:border-yellow-300/40',
                                workerPhotoBusy ? 'opacity-70' : ''
                              )}
                            >
                              {workerCardAvatarPath === p.path ? t('admin.main.avatarBadge') : t('admin.main.makeAvatar')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {workerPhotoUiError ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-100">{workerPhotoUiError}</div>
                  ) : null}

                  {workerPhotoBusy ? <div className="text-xs text-yellow-100/45">{t('admin.main.processing')}</div> : null}
                </div>

                <div className="mt-1 grid gap-2">
                  <div className="text-sm font-semibold text-yellow-100">{t('admin.main.shiftsTitle')}</div>

                  {workerCardItems.length === 0 ? (
                    <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-zinc-500">
                      {t('admin.main.noShiftsWorker')}
                    </div>
                  ) : null}

                  {workerCardItems.map((j) => (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-yellow-400/10 bg-black/30 px-3 py-2">
                      <div className="text-xs text-zinc-200">
                        <span className="text-zinc-100">{fmtD(j.job_date)}</span> • <span className="text-zinc-100">{timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)}</span> •{' '}
                        <span className="inline-flex items-center gap-2 text-zinc-100">
                          {(() => {
                            const ss = j.site_id ? sitesById.get(j.site_id) : null
                            const photos = ss && Array.isArray((ss as any).photos) ? ((ss as any).photos as any[]) : []
                            const url = photos?.[0]?.url || null
                            const canNav = !!ss && (((ss as any).lat != null && (ss as any).lng != null) || !!(ss as any).address)
                            if (!url) return null
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (!ss) return
                                  if ((ss as any).lat != null && (ss as any).lng != null) {
                                    openNavForSite({ lat: (ss as any).lat, lng: (ss as any).lng, address: (ss as any).address || null })
                                    return
                                  }
                                  if ((ss as any).address) {
                                    openNavForSite({ lat: null, lng: null, address: (ss as any).address || null })
                                  }
                                }}
                                className={cn(
                                  'relative h-5 w-7 overflow-hidden rounded-lg border border-yellow-400/15 bg-black/30',
                                  canNav ? 'hover:border-yellow-300/40' : ''
                                )}
                                title={canNav ? t('admin.main.navOpen') : t('admin.main.navPhotoObject')}
                              >
                                { }
                                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                              </button>
                            )
                          })()}
                          <span>{j.site_name || '—'}</span>
                        </span> • <StatusTag status={String(j.status || '')} />
                        <div className="mt-1 text-[11px] text-zinc-400">
                          {t('admin.main.startedStoppedLine', {
                            start: fmtDT(j.started_at),
                            stop: fmtDT(j.stopped_at),
                          })}
                          {String(j.status || '') === 'in_progress' && j.started_at ? (
                            <span>
                              {' '}
                              • <ElapsedSince startedAt={j.started_at} className="text-[11px] text-zinc-400" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        onClick={() => openEditForJob(j)}
                        disabled={busy}
                        className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40 disabled:opacity-60"
                      >
                        {t('admin.main.edit')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </Modal>

      {/* Modal: move shift to another worker */}
      <Modal open={moveJobOpen} title={t('admin.main.moveJobTitle')} onClose={() => setMoveJobOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">{t('admin.main.moveToWho')}</span>
            <select
              value={moveJobTargetWorker}
              onChange={(e) => setMoveJobTargetWorker(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">{t('admin.main.pickWorkerPh')}</option>
              {workersForSelect.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || t('admin.main.fallbackWorker')}
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
            {t('admin.main.btnMove')}
          </button>
        </div>
      </Modal>

      {/* Modal: move day */}
      <Modal open={moveDayOpen} title={t('admin.main.moveDayTitle')} onClose={() => setMoveDayOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">{t('admin.main.labelDate')}</span>
            <input
              type="date"
                      onPointerDown={(e) => { try { (e.currentTarget as any).showPicker?.() } catch {} }}
              value={moveDayDate}
              onChange={(e) => setMoveDayDate(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">{t('admin.main.fromWorker')}</span>
              <select
                value={moveDayFromWorker}
                onChange={(e) => setMoveDayFromWorker(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              >
                <option value="">{t('admin.main.pickWorkerPh')}</option>
                {workersForSelect.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name || t('admin.main.fallbackWorker')}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">{t('admin.main.toWorker')}</span>
              <select
                value={moveDayToWorker}
                onChange={(e) => setMoveDayToWorker(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              >
                <option value="">{t('admin.main.pickWorkerPh')}</option>
                {workersForSelect.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name || t('admin.main.fallbackWorker')}
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
            {t('admin.main.onlyPlanned')}
          </label>

          <button
            onClick={moveDay}
            disabled={busy || !moveDayFromWorker || !moveDayToWorker || !moveDayDate}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            {t('admin.main.moveDayBtn')}
          </button>
        </div>
      </Modal>

      {/* Modal: cancel shift */}
      <Modal open={cancelOpen} title={t('admin.main.cancelModalTitle')} onClose={() => setCancelOpen(false)}>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">
            {t('admin.main.cancelModalBody')}
          </div>

          <button
            onClick={() => cancelJob(cancelJobId)}
            disabled={busy || !cancelJobId}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            {t('admin.main.cancelWord')}
          </button>
        </div>
      </Modal>
    </main>
  )
}


















