'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAccessToken, setAuthTokens, clearAuthTokens } from '@/lib/auth-fetch'

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

type WorkerProfile = {
  id: string
  full_name?: string | null
  role?: string | null
  active?: boolean | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  avatar_path?: string | null
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
  if (!v) return 'вЂ”'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return 'вЂ”'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtD(v?: string | null) {
  if (!v) return 'вЂ”'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return 'вЂ”'
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
  // 4-РЅРµРґРµР»СЊРЅС‹Рµ РїРµСЂРёРѕРґС‹ (28 РґРЅРµР№), СЏРєРѕСЂСЊ вЂ” РїРѕРЅРµРґРµР»СЊРЅРёРє С‚РµРєСѓС‰РµР№ РЅРµРґРµР»Рё
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
    periods.push({ from, to, label: `${fmtD(from)} вЂ” ${fmtD(to)}` })
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

function enumerateDates(fromISO: string, toISO: string) {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(toISO + 'T00:00:00')
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []
  const out: { iso: string; label: string; dow: string }[] = []
  let cur = new Date(from)
  const dows = ['Р’СЃ', 'РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±']
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
  if (!t) return 'вЂ”'
  const x = String(t)
  return x.length >= 5 ? x.slice(0, 5) : x
}

function timeRangeHHMM(from?: string | null, to?: string | null) {
  const a = timeHHMM(from)
  const b = timeHHMM(to)
  if (a === 'вЂ”') return a
  if (b && b !== 'вЂ”') return `${a}вЂ“${b}`
  return a
}


function fmtMinutesHM(totalMinutes: number) {
  const mins = Math.max(0, Math.floor(totalMinutes || 0))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${pad2(m)}`
}

function statusRu(s: string) {
  if (s === 'planned') return 'Р—Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕ'
  if (s === 'in_progress') return 'Р’ РїСЂРѕС†РµСЃСЃРµ'
  if (s === 'done') return 'Р—Р°РІРµСЂС€РµРЅРѕ'
  if (s === 'cancelled') return 'РћС‚РјРµРЅРµРЅРѕ'
  return s || 'вЂ”'
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

function initials(name?: string | null) {
  const raw = String(name || '').trim()
  if (!raw) return 'вЂ”'
  const parts = raw.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : ''
  const out = (a + b).toUpperCase()
  return out || 'вЂ”'
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
  if (!token) throw new Error('РќРµС‚ С‚РѕРєРµРЅР° (Authorization: Bearer ...)')

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
      throw new Error('РЎРµСЃСЃРёСЏ РёСЃС‚РµРєР»Р°. Р’РѕР№РґРёС‚Рµ СЃРЅРѕРІР°.')
    }
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`)
    return payload as T
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error('РўР°Р№РјР°СѓС‚ Р·Р°РїСЂРѕСЃР° (15СЃ). РќР°Р¶РјРё вЂњРћР±РЅРѕРІРёС‚СЊ РґР°РЅРЅС‹РµвЂќ РµС‰С‘ СЂР°Р·.')
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
            Р—Р°РєСЂС‹С‚СЊ
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
  { id: 1, label: 'РљР°С‚РµРіРѕСЂРёСЏ 1', dotClass: 'bg-emerald-400' },
  { id: 2, label: 'РљР°С‚РµРіРѕСЂРёСЏ 2', dotClass: 'bg-sky-400' },
  { id: 3, label: 'РљР°С‚РµРіРѕСЂРёСЏ 3', dotClass: 'bg-violet-400' },
  { id: 4, label: 'РљР°С‚РµРіРѕСЂРёСЏ 4', dotClass: 'bg-fuchsia-400' },
  { id: 5, label: 'РљР°С‚РµРіРѕСЂРёСЏ 5', dotClass: 'bg-rose-400' },
  { id: 6, label: 'РљР°С‚РµРіРѕСЂРёСЏ 6', dotClass: 'bg-amber-400' },
  { id: 7, label: 'РљР°С‚РµРіРѕСЂРёСЏ 7', dotClass: 'bg-lime-400' },
  { id: 8, label: 'РљР°С‚РµРіРѕСЂРёСЏ 8', dotClass: 'bg-cyan-400' },
  { id: 9, label: 'РљР°С‚РµРіРѕСЂРёСЏ 9', dotClass: 'bg-indigo-400' },
  { id: 10, label: 'РљР°С‚РµРіРѕСЂРёСЏ 10', dotClass: 'bg-orange-400' },
  { id: 11, label: 'РљР°С‚РµРіРѕСЂРёСЏ 11', dotClass: 'bg-teal-400' },
  { id: 12, label: 'РљР°С‚РµРіРѕСЂРёСЏ 12', dotClass: 'bg-pink-400' },
  { id: 13, label: 'РљР°С‚РµРіРѕСЂРёСЏ 13', dotClass: 'bg-red-400' },
  { id: 14, label: 'РљР°С‚РµРіРѕСЂРёСЏ 14', dotClass: 'bg-purple-400' },
  { id: 15, label: 'РљР°С‚РµРіРѕСЂРёСЏ 15', dotClass: 'bg-green-400' },
]

function siteCategoryMeta(category: number | null | undefined) {
  const c = SITE_CATEGORIES.find((x) => x.id === category)
  return c || ({ id: 0, label: 'Р‘РµР· РєР°С‚РµРіРѕСЂРёРё', dotClass: 'bg-zinc-500' } as SiteCategory)
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
        <span className="font-semibold">{props.value ? `#${props.value}` : 'вЂ”'}</span>
        <span className="hidden sm:inline text-yellow-100/55">{meta.label}</span>
        <span className="ml-1 text-yellow-100/35">в–ѕ</span>
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
            <span className="font-semibold">вЂ”</span>
            <span>Р‘РµР· РєР°С‚РµРіРѕСЂРёРё</span>
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
        РќРµС‚ РєРѕРѕСЂРґРёРЅР°С‚
      </div>
    )
  }

  return (
    <div className="relative h-[92px] w-[150px] overflow-hidden rounded-2xl border border-yellow-400/20 bg-black/20">
      <iframe src={osmEmbedUrl(lat, lng, 0.004)} className="h-full w-full" loading="lazy" />
      <button onClick={props.onClick} className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" title="РћС‚РєСЂС‹С‚СЊ РЅР°РІРёРіР°С†РёСЋ" />
      <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">РќР°РІРёРіР°С†РёСЏ</div>
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
        title="РћС‚РєСЂС‹С‚СЊ РЅР°РІРёРіР°С†РёСЋ"
      />
      <div className="absolute bottom-2 left-3 text-xs font-semibold text-yellow-100/90">РћС‚РєСЂС‹С‚СЊ РЅР°РІРёРіР°С†РёСЋ</div>
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
          <span className="text-zinc-400">Р’С‹Р±РµСЂРё СЂР°Р±РѕС‚РЅРёРєРѕРІвЂ¦</span>
        ) : (
          <span className="text-zinc-100">
            {selectedNames.slice(0, 3).join(', ')}
            {selectedNames.length > 3 ? ` Рё РµС‰С‘ ${selectedNames.length - 3}` : ''}
          </span>
        )}
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-yellow-400/15 bg-zinc-950/95 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="РџРѕРёСЃРє СЂР°Р±РѕС‚РЅРёРєР°вЂ¦"
            className="mb-2 w-full rounded-2xl border border-yellow-400/15 bg-black/40 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-yellow-300/50"
          />

          <div className="max-h-[240px] overflow-auto rounded-2xl border border-yellow-400/10 bg-black/20">
            {filtered.length === 0 ? <div className="px-3 py-3 text-xs text-zinc-500">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</div> : null}

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
                    {on ? 'РІС‹Р±СЂР°РЅ' : ' '}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-300">РџРѕРєР°Р·Р°РЅРѕ: {filtered.length} вЂў Р’С‹Р±СЂР°РЅРѕ: {props.value.length}</div>
            <button
              type="button"
              onClick={() => props.onChange([])}
              className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40"
            >
              РћС‡РёСЃС‚РёС‚СЊ
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


// Reports panel (time totals) вЂ” isolated component to keep AdminPage hooks stable
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
      const label = `${fromD} вЂ” ${toD}`
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
    } catch (e: any) {
      setReportError(String(e?.message || 'РћС€РёР±РєР° РѕС‚С‡С‘С‚Р°'))
      setReportData(null)
    } finally {
      setReportLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports(reportFrom, reportTo)
  }, [loadReports, reportFrom, reportTo])

  return (
  <div className="mt-6 grid gap-4">
    <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-yellow-100">РљРѕРЅС‚СЂРѕР»СЊ СЂР°Р±РѕС‡РµРіРѕ РІСЂРµРјРµРЅРё</div>
          <div className="mt-1 text-xs text-zinc-300">
            РџРµСЂРёРѕРґ: {fmtD(reportFrom)} вЂ” {fmtD(reportTo)}
          </div>
        </div>
  
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setReportPickerOpen(true)}
            className="rounded-2xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/50"
          >
            Р’С‹Р±СЂР°С‚СЊ РїРµСЂРёРѕРґ
          </button>

          <a
            href="/admin/fact"
            className="rounded-2xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/50"
          >
            РџСЂР°РІРєР° С„Р°РєС‚Р°
          </a>

<a
  className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
  href="/admin/approvals"
>
  РђРєС‚РёРІР°С†РёРё
</a>
			
          <div className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/25 p-1">
            <button
              type="button"
              onClick={() => setReportsView('workers')}
              className={cn(
                'rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                reportsView === 'workers' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
              )}
            >
              РџРѕ СЂР°Р±РѕС‚РЅРёРєР°Рј
            </button>
            <button
              type="button"
              onClick={() => setReportsView('sites')}
              className={cn(
                'rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                reportsView === 'sites' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
              )}
            >
              РџРѕ РѕР±СЉРµРєС‚Р°Рј
            </button>
          </div>
        </div>
      </div>
  
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-yellow-400/10 bg-black/30 p-4">
          <div className="text-[11px] text-zinc-300">РС‚РѕРі РїРµСЂРёРѕРґР°</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-yellow-100">
            {fmtMinutesHM(reportData?.total_minutes ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">С‡Р°СЃС‹:РјРёРЅСѓС‚С‹</div>
        </div>
  
        <div className="rounded-3xl border border-yellow-400/10 bg-black/30 p-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-zinc-300">РџРѕРёСЃРє</div>
            <div className="text-[11px] text-zinc-400">{reportLoading ? 'РЎС‡РёС‚Р°СЋвЂ¦' : reportData ? 'Р“РѕС‚РѕРІРѕ' : 'вЂ”'}</div>
          </div>
          <input
            value={reportSearch}
            onChange={(e) => setReportSearch(e.target.value)}
            placeholder="РРјСЏ СЂР°Р±РѕС‚РЅРёРєР° / РѕР±СЉРµРєС‚"
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
            const title = (reportsView === 'workers' ? x.worker_name : x.site_name) ?? 'вЂ”'
            const avatarUrl = x.avatar_url || null
  
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 border-b border-yellow-400/5 px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-yellow-400/15 bg-black/40">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-200">
                        {reportsView === 'workers' ? initials(title) : 'рџЏ '}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-100">{title}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-400">{reportsView === 'workers' ? 'Р Р°Р±РѕС‚РЅРёРє' : 'РћР±СЉРµРєС‚'}</div>
                  </div>
                </div>
  
                <div className="shrink-0 rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-sm font-semibold text-yellow-100">
                  {fmtMinutesHM(Number(x.minutes) || 0)}
                </div>
              </div>
            )
          })}
  
        {!reportLoading &&
        (reportsView === 'workers' ? (reportData?.by_worker?.length ?? 0) : (reportData?.by_site?.length ?? 0)) === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-400">РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РїРµСЂРёРѕРґ</div>
        ) : null}
      </div>
    </div>
  
    {/* Picker modal */}
    {reportPickerOpen ? (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-yellow-400/15 bg-zinc-950/95 shadow-[0_20px_80px_rgba(0,0,0,0.75)] backdrop-blur">
          <div className="flex items-center justify-between gap-2 border-b border-yellow-400/10 px-5 py-4">
            <div className="text-sm font-semibold text-yellow-100">РџРµСЂРёРѕРґ РѕС‚С‡С‘С‚Р°</div>
            <button
              type="button"
              onClick={() => setReportPickerOpen(false)}
              className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-zinc-200 hover:border-yellow-300/40"
            >
              Р—Р°РєСЂС‹С‚СЊ
            </button>
          </div>
  
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/25 p-1">
              <button
                type="button"
                onClick={() => setReportPickerTab('payroll')}
                className={cn(
                  'flex-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                  reportPickerTab === 'payroll' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
                )}
              >
                РџР»Р°С‚С‘Р¶РЅС‹Р№ РїРµСЂРёРѕРґ
              </button>
              <button
                type="button"
                onClick={() => setReportPickerTab('custom')}
                className={cn(
                  'flex-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition',
                  reportPickerTab === 'custom' ? 'bg-yellow-400/10 text-yellow-100' : 'text-zinc-200 hover:text-yellow-100'
                )}
              >
                РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРёРµ РґР°С‚С‹
              </button>
            </div>
  
            {reportPickerTab === 'custom' ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    РЎ
                    <input
                      type="date"
                      value={reportFrom}
                      onChange={(e) => setReportFrom(e.target.value)}
                      className="w-full rounded-2xl border border-yellow-400/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Р”Рѕ
                    <input
                      type="date"
                      value={reportTo}
                      onChange={(e) => setReportTo(e.target.value)}
                      className="w-full rounded-2xl border border-yellow-400/15 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                    />
                  </label>
                </div>
  
                <div className="text-[11px] text-zinc-400">
                  РњРѕР¶РЅРѕ РІС‹СЃС‚Р°РІРёС‚СЊ С…РѕС‚СЊ РѕРґРёРЅ РґРµРЅСЊ, С…РѕС‚СЊ В«СЃС‚Рѕ Р»РµС‚В» вЂ” СЃРµСЂРІРµСЂСѓ РІСЃС‘ СЂР°РІРЅРѕ, РµСЃР»Рё Р±Р°Р·Р° РІС‹РґРµСЂР¶РёС‚.
                </div>
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
                        {checked ? 'РІС‹Р±СЂР°РЅ' : ' '}
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
              РћС‚РјРµРЅР°
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
              РџСЂРёРјРµРЅРёС‚СЊ
            </button>
          </div>
        </div>
      </div>
    ) : null}
  </div>
  )
}

export default function AdminPage() {
  const [tab, setTab] = useState<TabKey>('jobs')

  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')


  const [busy, setBusy] = useState(false)
  const [busySeq, setBusySeq] = useState(0)
  const refreshSeqRef = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Safety-net: РµСЃР»Рё UI Р·Р°Р»РёРї РЅР° "РћР±РЅРѕРІР»СЏСЋвЂ¦" вЂ” РѕС‚РїСѓСЃРєР°РµРј РєРЅРѕРїРєСѓ Рё РїРѕРєР°Р·С‹РІР°РµРј РѕС€РёР±РєСѓ
  // Р’Р°Р¶РЅРѕ: СѓС‡РёС‚С‹РІР°РµРј "РїРѕРєРѕР»РµРЅРёРµ" РѕР±РЅРѕРІР»РµРЅРёСЏ, С‡С‚РѕР±С‹ РЅРµ СЃС‚СЂРµР»СЏС‚СЊ РІ РЅРѕРіСѓ РїСЂРё РїР°СЂР°Р»Р»РµР»СЊРЅС‹С… refresh.
  useEffect(() => {
    if (!busy) return
    const seq = busySeq
    const t = window.setTimeout(() => {
      if (refreshSeqRef.current !== seq) return
      setBusy(false)
      setError('РћР±РЅРѕРІР»РµРЅРёРµ Р·Р°РІРёСЃР»Рѕ. РћР±С‹С‡РЅРѕ СЌС‚Рѕ СЃРµС‚СЊ/С‚Р°Р№РјР°СѓС‚. РќР°Р¶РјРё вЂњРћР±РЅРѕРІРёС‚СЊ РґР°РЅРЅС‹РµвЂќ РµС‰С‘ СЂР°Р·.')
    }, 25000)
    return () => window.clearTimeout(t)
  }, [busy, busySeq])

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
  const [editTimeTo, setEditTimeTo] = useState<string>('')
  const [editStatus, setEditStatus] = useState<JobStatus>('planned')

  const [workerCardOpen, setWorkerCardOpen] = useState(false)
  const [workerCardId, setWorkerCardId] = useState<string>('')
  const [workerCardItems, setWorkerCardItems] = useState<ScheduleItem[]>([])

  const [workerCardPhotos, setWorkerCardPhotos] = useState<WorkerPhoto[]>([])
  const [workerPhotoMeta, setWorkerPhotoMeta] = useState<Record<string, WorkerPhotoMeta>>({})

  const [workerProfileById, setWorkerProfileById] = useState<Record<string, WorkerProfile>>({})
  const [workerProfileLoading, setWorkerProfileLoading] = useState(false)
  const [workerProfileSaving, setWorkerProfileSaving] = useState(false)

  const [workerCardFullName, setWorkerCardFullName] = useState('')
  const [workerCardNotes, setWorkerCardNotes] = useState('')
  const [workerCardEmail, setWorkerCardEmail] = useState('')
  const [workerCardPhone, setWorkerCardPhone] = useState('')
  const [workerCardAvatarPath, setWorkerCardAvatarPath] = useState<string | null>(null)

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

  const workersForPicker = useMemo(() => workersForSelect.map((w) => ({ id: w.id, name: w.full_name || 'Р Р°Р±РѕС‚РЅРёРє' })), [workersForSelect])

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
      return workersForSelect.map((w) => ({ id: w.id, name: w.full_name || 'Р Р°Р±РѕС‚РЅРёРє' }))
    }
    return activeSites.map((s) => ({ id: s.id, name: s.name || 'РћР±СЉРµРєС‚' }))
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
    const items = Array.isArray(sch?.items) ? sch.items : []

    // РџРѕРґС‚СЏРіРёРІР°РµРј РјРёРЅРёвЂ‘Р°РІР°С‚Р°СЂС‹ СЂР°Р±РѕС‚РЅРёРєРѕРІ, РєРѕС‚РѕСЂС‹Рµ СЂРµР°Р»СЊРЅРѕ СѓС‡Р°СЃС‚РІСѓСЋС‚ РІ РіСЂР°С„РёРєРµ/С‚Р°Р±Р»РёС†Рµ.
    const ids = Array.from(new Set(items.map((x) => x.worker_id).filter(Boolean))) as string[]
    if (ids.length) enqueueWorkerPhotoMeta(ids)

    setSchedule(items)
  }

  async function refreshAll() {
    const seq = ++refreshSeqRef.current
    setBusySeq(seq)
    setBusy(true)
    setError(null)
    try {
      // Р Р°РЅСЊС€Рµ Р±С‹Р»Рѕ РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅРѕ (core -> schedule) Рё РІ СЃСѓРјРјРµ РјРѕРіР»Рѕ РїРµСЂРµРІР°Р»РёРІР°С‚СЊ Р·Р° safety-net.
      // РџР°СЂР°Р»Р»РµР»РёРј: РјР°РєСЃРёРјСѓРј = РѕРґРёРЅ С‚Р°Р№РјР°СѓС‚ fetch, Р° РЅРµ РґРІР° РїРѕРґСЂСЏРґ.
      await Promise.all([refreshCore(), refreshSchedule()])
    } catch (e: any) {
      setError(e?.message || 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё')
    } finally {
      if (seq === refreshSeqRef.current) setBusy(false)
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
    // meId РЅРµ РєСЂРёС‚РёС‡РµРЅ: Р°РґРјРёРЅСЃРєРёРµ API СЃР°РјРё РїСЂРѕРІРµСЂСЏСЋС‚ СЂРѕР»СЊ
    setMeId(null)
  } catch (e: any) {
    setError(e?.message || 'РћС€РёР±РєР° СЃРµСЃСЃРёРё')
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
    // РїРѕРґРіСЂСѓР¶Р°РµРј СЃС‡С‘С‚С‡РёРє + РјРёРЅРё-Р°РІР°С‚Р°СЂ РІ С„РѕРЅРµ (РѕРіСЂР°РЅРёС‡РёРІР°РµРј РїР°СЂР°Р»Р»РµР»РёР·Рј, С‡С‚РѕР±С‹ РЅРµ РґСѓС€РёС‚СЊ API)
    enqueueWorkerPhotoMeta(workers.map((w) => w.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, workers, sessionToken])

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
      if (!j?.access_token) throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ С‚РѕРєРµРЅ')

      setAuthTokens(String(j.access_token), j.refresh_token ? String(j.refresh_token) : null)
      setSessionToken(String(j.access_token))
      setMeId(j?.user?.id || null)
      await refreshAll()
    } catch (e: any) {
      setError(e?.message || 'РћС€РёР±РєР° РІС…РѕРґР°')
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
      if (!em) throw new Error('РќСѓР¶РµРЅ email РёР»Рё С‚РµР»РµС„РѕРЅ')
      const out = await authFetchJson('/api/admin/workers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: em, role: 'worker', active: false }),
      })
      setInviteEmail('')
      const login = String((out as any)?.login || em)
      const pw = String((out as any)?.password || '')
      setNotice(`РЎРѕР·РґР°РЅРѕ. Р›РѕРіРёРЅ: ${login}. Р’СЂРµРјРµРЅРЅС‹Р№ РїР°СЂРѕР»СЊ: ${pw} (РїСЂРё РїРµСЂРІРѕРј РІС…РѕРґРµ РїРѕРїСЂРѕСЃРёРј СЃРјРµРЅРёС‚СЊ).`)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'РћС€РёР±РєР° РїСЂРёРіР»Р°С€РµРЅРёСЏ')
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
      setError(e?.message || 'РћС€РёР±РєР° РЅР°Р·РЅР°С‡РµРЅРёСЏ')
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
      setError(e?.message || 'РћС€РёР±РєР° СЃРЅСЏС‚РёСЏ РЅР°Р·РЅР°С‡РµРЅРёСЏ')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ Р°СЂС…РёРІ')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РѕР±СЉРµРєС‚')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РѕР±СЉРµРєС‚')
    } finally {
      setBusy(false)
    }
  }

  async function deleteObjectSite(siteId: string) {
    const ok = window.confirm('РЈРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚? Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.')
    if (!ok) return

    setBusy(true)
    setError(null)
    try {
      await authFetchJson(`/api/admin/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' })
      if (siteCardId === siteId) setSiteCardOpen(false)
      await refreshCore()
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ РєР°С‚РµРіРѕСЂРёСЋ')
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
        setPhotoUiError('Р›РёРјРёС‚ 5 С„РѕС‚Рѕ. РЈРґР°Р»РёС‚Рµ РѕРґРЅРѕ Рё РїРѕРІС‚РѕСЂРёС‚Рµ.')
        return
      }

      if (toUpload.length < files.length) {
        setPhotoUiNotice(`Р—Р°РіСЂСѓР¶Сѓ ${toUpload.length} РёР· ${files.length} (Р»РёРјРёС‚ 5)`)
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

      setPhotoUiNotice(toUpload.length > 1 ? 'Р¤РѕС‚Рѕ Р·Р°РіСЂСѓР¶РµРЅС‹.' : 'Р¤РѕС‚Рѕ Р·Р°РіСЂСѓР¶РµРЅРѕ.')
      await refreshCore()
    } catch (e: any) {
      setPhotoUiError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ')
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ')
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
      setPhotoUiNotice('Р¤РѕС‚Рѕ СѓРґР°Р»РµРЅРѕ.')
      await refreshCore()
    } catch (e: any) {
      setPhotoUiError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРґРµР»Р°С‚СЊ С„РѕС‚Рѕ РіР»Р°РІРЅС‹Рј')
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРґРµР»Р°С‚СЊ С„РѕС‚Рѕ РіР»Р°РІРЅС‹Рј')
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
    } catch (e: any) {
      setPhotoUiError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С„РѕС‚Рѕ')
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С„РѕС‚Рѕ')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function setRole(workerId: string, role: 'admin' | 'worker') {
    if (role === 'worker' && meId && workerId === meId) {
      setError('РќРµР»СЊР·СЏ СЂР°Р·Р¶Р°Р»РѕРІР°С‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ.')
      return
    }
    const ok = window.confirm(role === 'admin' ? 'РЎРґРµР»Р°С‚СЊ СЌС‚РѕРіРѕ СЂР°Р±РѕС‚РЅРёРєР° Р°РґРјРёРЅРѕРј?' : 'РЎРґРµР»Р°С‚СЊ СЌС‚РѕРіРѕ Р°РґРјРёРЅР° РѕР±С‹С‡РЅС‹Рј СЂР°Р±РѕС‚РЅРёРєРѕРј?')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ СЂРѕР»СЊ')
    } finally {
      setBusy(false)
    }
  }

  async function setWorkerArchived(workerId: string, archive: boolean) {
    if (meId && workerId === meId) {
      setError('РќРµР»СЊР·СЏ Р°СЂС…РёРІРёСЂРѕРІР°С‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ.')
      return
    }

    const ok = window.confirm(
      archive
        ? 'Р—Р°Р°СЂС…РёРІРёСЂРѕРІР°С‚СЊ СЂР°Р±РѕС‚РЅРёРєР°? РћРЅ РЅРµ СЃРјРѕР¶РµС‚ СЂР°Р±РѕС‚Р°С‚СЊ РІ РїСЂРёР»РѕР¶РµРЅРёРё.'
        : 'Р’РµСЂРЅСѓС‚СЊ СЂР°Р±РѕС‚РЅРёРєР° РёР· Р°СЂС…РёРІР°?'
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ СЃС‚Р°С‚СѓСЃ СЂР°Р±РѕС‚РЅРёРєР°')
    } finally {
      setBusy(false)
    }
  }

  async function deleteWorker(workerId: string) {
    if (meId && workerId === meId) {
      setError('РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЃР°РјРѕРіРѕ СЃРµР±СЏ.')
      return
    }

    const ok = window.confirm(
      'РЈРґР°Р»РёС‚СЊ СЂР°Р±РѕС‚РЅРёРєР° РќРђР’РЎР•Р“Р”Рђ?\n\nР’Р°Р¶РЅРѕ: РµСЃР»Рё Сѓ РЅРµРіРѕ РµСЃС‚СЊ С‚Р°Р№РјР»РѕРіРё/СЃРјРµРЅС‹, СЃРµСЂРІРµСЂ Р·Р°РїСЂРµС‚РёС‚ СѓРґР°Р»РµРЅРёРµ (Рё СЌС‚Рѕ РЅРѕСЂРјР°Р»СЊРЅРѕ).'
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ СЂР°Р±РѕС‚РЅРёРєР°')
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
    setEditTime(tFrom === 'вЂ”' ? '' : tFrom)

    const tTo = timeHHMM(j.scheduled_end_time || null)
    setEditTimeTo(tTo === 'вЂ”' ? '' : tTo)

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
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ')
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
      // 1) РїСЂРѕС„РёР»СЊ: СѓР·РЅР°С‘Рј РІС‹Р±СЂР°РЅРЅС‹Р№ Р°РІР°С‚Р°СЂ (РµСЃР»Рё РµСЃС‚СЊ)
      let avatarPath = workerProfileById?.[workerId]?.avatar_path ?? null
      if (!avatarPath) {
        const prof = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`).catch(() => null as any)
        const w = prof?.worker
        if (w?.id) {
          setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
          avatarPath = w.avatar_path ?? null
        }
      }

      // 2) С„РѕС‚Рѕ
      const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`)
      const photos = Array.isArray(res?.photos) ? res.photos : []
      const thumb = avatarPath ? photos.find((p) => p.path === avatarPath)?.url || photos[0]?.url : photos[0]?.url
      setWorkerPhotoMeta((prev) => ({ ...prev, [workerId]: { count: Math.min(photos.length, 5), thumb } }))
    } catch {
      // ignore
    }
  }

  async function loadWorkerPhotos(workerId: string) {
    const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`)
    const photos = Array.isArray(res?.photos) ? res.photos : []
    setWorkerCardPhotos(photos)
    const avatarPath = workerProfileById?.[workerId]?.avatar_path ?? null
    const thumb = avatarPath ? photos.find((p) => p.path === avatarPath)?.url || photos[0]?.url : photos[0]?.url
    setWorkerPhotoMeta((prev) => ({ ...prev, [workerId]: { count: Math.min(photos.length, 5), thumb } }))
  }

  async function loadWorkerProfile(workerId: string) {
    setWorkerProfileLoading(true)
    try {
      const res = await authFetchJson<{ worker: WorkerProfile }>(`/api/admin/workers/${encodeURIComponent(workerId)}/profile`)
      const w = res?.worker
      if (w?.id) {
        setWorkerProfileById((prev) => ({ ...prev, [workerId]: w }))
        setWorkerCardFullName(String(w.full_name || ''))
        setWorkerCardNotes(String(w.notes || ''))
        setWorkerCardEmail(String(w.email || ''))
        setWorkerCardPhone(String(w.phone || ''))
        setWorkerCardAvatarPath(w.avatar_path ?? null)
      }
    } finally {
      setWorkerProfileLoading(false)
    }
  }

  async function saveWorkerProfile(workerId: string) {
    setWorkerProfileSaving(true)
    setError(null)
    try {
      const payload = {
        full_name: workerCardFullName.trim() || null,
        email: workerCardEmail.trim() || null,
        phone: workerCardPhone.trim() || null,
        notes: workerCardNotes || null,
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
        // РѕР±РЅРѕРІРёРј core workers (РёРјСЏ) Р»РѕРєР°Р»СЊРЅРѕ, С‡С‚РѕР±С‹ СЃРїРёСЃРѕРє РЅРµ РјРёРіР°Р»
        setWorkers((prev) => prev.map((x) => (x.id === workerId ? { ...x, full_name: w.full_name ?? x.full_name } : x)))
      }
      // РѕР±РЅРѕРІРёРј thumb РґР»СЏ СЃРїРёСЃРєР°
      await loadWorkerPhotoMeta(workerId)
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ')
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
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹Р±СЂР°С‚СЊ Р°РІР°С‚Р°СЂ')
    }
  }

  async function uploadWorkerPhotos(workerId: string, files: File[]) {
    if (!files || files.length === 0) return

    setWorkerPhotoBusy(true)
    setError(null)

    try {
      const current = workerCardPhotos.length || 0
      const left = Math.max(0, 5 - current)
      const toUpload = Array.from(files).slice(0, left)

      for (const f of toUpload) {
        const fd = new FormData()
        fd.append('file', f)
        const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`, {
          method: 'POST',
          body: fd,
        })
        setWorkerCardPhotos(Array.isArray(res?.photos) ? res.photos : [])
      }
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ')
    } finally {
      setWorkerPhotoBusy(false)
    }
  }

  async function removeWorkerPhoto(workerId: string, path: string) {
    setWorkerPhotoBusy(true)
    setError(null)
    try {
      const res = await authFetchJson<{ photos: WorkerPhoto[] }>(`/api/admin/workers/${encodeURIComponent(workerId)}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      setWorkerCardPhotos(Array.isArray(res?.photos) ? res.photos : [])
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С„РѕС‚Рѕ')
    } finally {
      setWorkerPhotoBusy(false)
    }
  }

  async function openWorkerCard(workerId: string) {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    setWorkerCardId(workerId)
    setWorkerCardOpen(true)
    setWorkerCardItems([])
    setWorkerCardPhotos([])
    setError(null)

    const core = workersById.get(workerId)
    setWorkerCardFullName(String(workerProfileById?.[workerId]?.full_name ?? core?.full_name ?? ''))
    setWorkerCardNotes(String(workerProfileById?.[workerId]?.notes ?? ''))
    setWorkerCardEmail(String(workerProfileById?.[workerId]?.email ?? ''))
    setWorkerCardPhone(String(workerProfileById?.[workerId]?.phone ?? ''))
    setWorkerCardAvatarPath(workerProfileById?.[workerId]?.avatar_path ?? null)

    try {
      await Promise.all([loadWorkerCard(workerId), loadWorkerPhotos(workerId), loadWorkerProfile(workerId)])
    } catch (e: any) {
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ СЂР°Р±РѕС‚РЅРёРєР°')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЃРјРµРЅСѓ')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРЅРµСЃС‚Рё')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РјРµРЅРёС‚СЊ')
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
      setError(e?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРЅРµСЃС‚Рё РґРµРЅСЊ')
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
          if (hh === 'вЂ”') return false
          if (hh.slice(0, 2) !== hour.slice(0, 2)) return false
        }
        return true
      })
      .sort((a, b) => timeHHMM(a.scheduled_time).localeCompare(timeHHMM(b.scheduled_time)))
  }

  function jobCard(j: ScheduleItem, compact: boolean) {
    const left = planMode === 'workers' ? (j.site_name || 'РћР±СЉРµРєС‚') : (j.worker_name || 'Р Р°Р±РѕС‚РЅРёРє')
    const right = `${timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)} вЂў ${statusRu(String(j.status || ''))}`
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
            <div className="flex items-center gap-2 min-w-0">
              {(() => {
                if (planMode === 'workers') {
                  const ss = j.site_id ? sitesById.get(j.site_id) : null
                  const photos = ss && Array.isArray((ss as any).photos) ? ((ss as any).photos as any[]) : []
                  const url = photos?.[0]?.url || null
                  if (!url) {
                    return (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[10px] font-semibold text-yellow-100/70">рџЏ </div>
                    )
                  }
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-6 w-6 rounded-full border border-yellow-400/15 object-cover" loading="lazy" />
                  )
                }

                const wid = j.worker_id || ''
                const thumb = wid ? workerPhotoMeta[wid]?.thumb || null : null
                if (!thumb) {
                  return (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[10px] font-semibold text-yellow-100/70">{initials(left)}</div>
                  )
                }
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-6 w-6 rounded-full border border-yellow-400/15 object-cover" loading="lazy" />
                )
              })()}
              <div className="flex min-w-0 items-center gap-2">
              {planMode === 'sites' && j.worker_id && workerPhotoMeta[j.worker_id]?.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
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
              РѕС‚РјРµРЅРёС‚СЊ
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
                РїРµСЂРµРЅРµСЃС‚Рё
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
            Р”РµРЅСЊ
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
            РќРµРґРµР»СЏ
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
            РњРµСЃСЏС†
          </button>

          <div className="mx-2 h-7 w-px bg-yellow-400/10" />

          <button
            onClick={() => setPlanMode('workers')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planMode === 'workers' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            РџРѕ СЂР°Р±РѕС‚РЅРёРєР°Рј
          </button>
          <button
            onClick={() => setPlanMode('sites')}
            className={cn(
              'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
              planMode === 'sites' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
            )}
          >
            РџРѕ РѕР±СЉРµРєС‚Р°Рј
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Р”Р°С‚Р°</span>
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
            РЎРµРіРѕРґРЅСЏ
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
            РџРµСЂРµРЅРµСЃС‚Рё РґРµРЅСЊ
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
              {planMode === 'workers' ? 'Р Р°Р±РѕС‚РЅРёРє' : 'РћР±СЉРµРєС‚'}
            </div>

            {planDates.map((d) => (
              <div key={d.iso} className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-4 py-3 text-xs font-semibold text-zinc-200">
                <div className="flex items-center justify-between">
                  <span>
                    {d.dow} вЂў {d.label}
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
                      <div className="flex min-w-0 items-center gap-2">
                      {planMode === 'workers' && workerPhotoMeta[ent.id]?.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={workerPhotoMeta[ent.id]?.thumb || ''}
                          alt=""
                          className="h-6 w-6 flex-none rounded-full border border-yellow-400/20 object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="truncate text-sm font-semibold text-yellow-100">{ent.name}</div>
                    </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        {planMode === 'workers'
                          ? `РћР±СЉРµРєС‚С‹: ${(workerSites.get(ent.id) || []).length}`
                          : `РќР°Р·РЅР°С‡РµРЅС‹: ${(siteWorkers.get(ent.id) || []).filter((w) => (w.role || '') !== 'admin').length}`}
                      </div>
                    </div>

                    {planMode === 'workers' ? (
                      <button
                        onClick={() => openWorkerCard(ent.id)}
                        className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-[11px] text-zinc-200 hover:border-yellow-300/40"
                      >
                        РєР°СЂС‚РѕС‡РєР°
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
                        РїРµСЂРµС‚Р°С‰Рё СЃСЋРґР°
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
              Р’СЂРµРјСЏ
            </div>

            {planEntities.map((ent) => (
              <div key={ent.id} className="sticky top-0 z-10 border-b border-yellow-400/10 bg-zinc-950/90 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                    {planMode === 'workers' && workerPhotoMeta[ent.id]?.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
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
                      РєР°СЂС‚РѕС‡РєР°
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
                        РїРµСЂРµС‚Р°С‰Рё СЃСЋРґР°
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
            {['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'].map((d) => (
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
                        РµС‰С‘ {schedule.filter((j) => (j.job_date || '') === d.iso).length - 3}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-dashed border-yellow-400/10 bg-black/10 px-3 py-2 text-[11px] text-zinc-500">
                      РїРµСЂРµС‚Р°С‰Рё СЃСЋРґР°
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
            <div className="text-sm text-zinc-300">РџСЂРѕРІРµСЂСЏСЋ РІС…РѕРґвЂ¦</div>
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
              <div className="text-lg font-semibold tracking-wide">РђРґРјРёРЅ-РїР°РЅРµР»СЊ</div>
              <div className="text-xs text-yellow-200/70">Tanija вЂў РѕР±СЉРµРєС‚С‹ вЂў СЂР°Р±РѕС‚РЅРёРєРё вЂў СЃРјРµРЅС‹</div>
            </div>
          </div>

          <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
            <h1 className="text-xl font-semibold text-yellow-100">Р’С…РѕРґ</h1>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}

            {notice ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>
            ) : null}

            <form onSubmit={onLogin} className="mt-5 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-300">Р›РѕРіРёРЅ (email РёР»Рё С‚РµР»РµС„РѕРЅ)</span>
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
                <span className="text-xs text-zinc-300">РџР°СЂРѕР»СЊ</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                  placeholder="вЂўвЂўвЂўвЂўвЂўвЂўвЂўвЂў"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                className="mt-2 rounded-2xl border border-yellow-300/40 bg-gradient-to-r from-yellow-500/10 via-yellow-400/10 to-yellow-300/10 px-4 py-3 text-sm font-semibold text-yellow-100 shadow-[0_0_0_1px_rgba(255,215,0,0.18)] transition hover:border-yellow-200/70 hover:bg-yellow-400/10 disabled:opacity-60"
              >
                {busy ? 'Р’С…РѕР¶СѓвЂ¦' : 'Р’РѕР№С‚Рё'}
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
              <div className="text-lg font-semibold tracking-wide">РђРґРјРёРЅ-РїР°РЅРµР»СЊ</div>
              <div className="text-xs text-yellow-200/70">Tanija вЂў РѕР±СЉРµРєС‚С‹ вЂў СЂР°Р±РѕС‚РЅРёРєРё вЂў СЃРјРµРЅС‹</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              disabled={busy}
              className="rounded-xl border border-yellow-400/40 bg-black/40 px-4 py-2 text-sm text-yellow-100 transition hover:border-yellow-300/70 hover:bg-black/60 disabled:opacity-60"
            >
              {busy ? 'РћР±РЅРѕРІР»СЏСЋвЂ¦' : 'РћР±РЅРѕРІРёС‚СЊ РґР°РЅРЅС‹Рµ'}
            </button>

            <button
              onClick={onLogout}
              disabled={busy}
              className="rounded-xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-sm text-yellow-100/90 transition hover:border-yellow-300/60 hover:bg-black/50 disabled:opacity-60"
            >
              Р’С‹Р№С‚Рё
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-yellow-400/20 bg-zinc-950/50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="adminTabRow">
              {(['sites', 'workers', 'jobs', 'plan', 'reports'] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                    tab === k ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                  )}
                >
                  {k === 'sites' ? 'РћР±СЉРµРєС‚С‹' : k === 'workers' ? 'Р Р°Р±РѕС‚РЅРёРєРё' : k === 'jobs' ? 'РЎРјРµРЅС‹' : k === 'plan' ? 'Р“СЂР°С„РёРє' : 'РћС‚С‡С‘С‚С‹'}
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
                  РџРѕРєР°Р·Р°С‚СЊ Р°СЂС…РёРІ
                </label>
              ) : null}

              <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-[11px] text-zinc-200">
                РћР±СЉРµРєС‚С‹: {sites.length} вЂў Р Р°Р±РѕС‚РЅРёРєРё: {workers.length} вЂў РЎРјРµРЅС‹: {schedule.length}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>
          ) : null}


          {/* РћРўР§РЃРўР« */}
          {/* РћРўР§РЃРўР« */}
          {tab === 'reports' ? (
            <ReportsPanel />
          ) : null}



          {/* РћР‘РЄР•РљРўР« */}
                    {tab === 'sites' ? (
                      <div className="mt-6 grid gap-4">
                        <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-yellow-100">РћР±СЉРµРєС‚С‹</div>
                              <div className="mt-1 text-xs text-zinc-300">РќР°Р·РЅР°С‡РµРЅРёРµ = РґРѕСЃС‚СѓРї Рє РѕР±СЉРµРєС‚Сѓ. Р Р°СЃРїРёСЃР°РЅРёРµ РґРµР»Р°РµС‚СЃСЏ РІ вЂњРЎРјРµРЅС‹вЂќ Рё вЂњР“СЂР°С„РёРєвЂќ.</div>
                            </div>

                            <button
                              onClick={() => setSiteCreateOpen(true)}
                              disabled={busy}
                              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                            >
                              + Р”РѕР±Р°РІРёС‚СЊ РѕР±СЉРµРєС‚
                            </button>
                          </div>

                          <div className="mt-4 flex flex-wrap items-end gap-2">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Р‘С‹СЃС‚СЂРѕРµ РЅР°Р·РЅР°С‡РµРЅРёРµ: РѕР±СЉРµРєС‚</span>
                              <select
                                value={qaSite}
                                onChange={(e) => setQaSite(e.target.value)}
                                className="w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                              >
                                <option value="">Р’С‹Р±РµСЂРё РѕР±СЉРµРєС‚вЂ¦</option>
                                {activeSites.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name || s.id}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Р‘С‹СЃС‚СЂРѕРµ РЅР°Р·РЅР°С‡РµРЅРёРµ: СЂР°Р±РѕС‚РЅРёРє</span>
                              <select
                                value={qaWorker}
                                onChange={(e) => setQaWorker(e.target.value)}
                                className="w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                              >
                                <option value="">Р’С‹Р±РµСЂРё СЂР°Р±РѕС‚РЅРёРєР°вЂ¦</option>
                                {workersForSelect.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <button
                              onClick={quickAssign}
                              disabled={busy || !qaSite || !qaWorker}
                              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                            >
                              РќР°Р·РЅР°С‡РёС‚СЊ
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
                                            title={(s.lat != null && s.lng != null) || !!s.address ? 'РћС‚РєСЂС‹С‚СЊ РЅР°РІРёРіР°С†РёСЋ' : 'РћС‚РєСЂС‹С‚СЊ РєР°СЂС‚РѕС‡РєСѓ'}
                                          />
                                          <div className="absolute bottom-1 left-2 text-[10px] font-semibold text-yellow-100/90">
                                            {(s.lat != null && s.lng != null) || !!s.address ? 'РќР°РІРёРіР°С†РёСЏ' : 'РљР°СЂС‚РѕС‡РєР°'}
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
                                          title="РћС‚РєСЂС‹С‚СЊ РєР°СЂС‚РѕС‡РєСѓ РѕР±СЉРµРєС‚Р°"
                                        >
                                          {s.name || 'РћР±СЉРµРєС‚'}
                                        </button>

                                        {archived ? (
                                          <span className="rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">РІ Р°СЂС…РёРІРµ</span>
                                        ) : (
                                          <span className="rounded-xl border border-yellow-300/40 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">Р°РєС‚РёРІРµРЅ</span>
                                        )}

                                        <span className="inline-flex items-center gap-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-yellow-100/70">
                                          <span className={cn('h-2.5 w-2.5 rounded-full', meta.dotClass)} />
                                          {s.category ? `#${s.category}` : 'Р±РµР· РєР°С‚РµРіРѕСЂРёРё'}
                                        </span>
                                      </div>

                                      {s.address ? <div className="mt-2 text-xs text-zinc-300">РђРґСЂРµСЃ: {s.address}</div> : null}

                                      <div className="mt-2 flex flex-wrap gap-2">
                                        <Pill>СЂР°РґРёСѓСЃ: {s.radius ?? 150} Рј</Pill>
                                        <Pill>GPS: {s.lat != null && s.lng != null ? `${s.lat}, ${s.lng}` : 'РЅРµС‚'}</Pill>
                                        <Pill>С„РѕС‚Рѕ: {photos.length}/5</Pill>
                                      </div>

                                      {s.notes ? <div className="mt-2 text-xs text-zinc-300">Р—Р°РјРµС‚РєРё: {String(s.notes).slice(0, 160)}</div> : null}

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
                                          РљР°СЂС‚РѕС‡РєР°
                                        </button>

                                        <button
                                          onClick={() => deleteObjectSite(s.id)}
                                          disabled={busy}
                                          className="rounded-2xl border border-red-500/25 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100/85 transition hover:border-red-400/45 disabled:opacity-60"
                                        >
                                          РЈРґР°Р»РёС‚СЊ
                                        </button>

                                        <button
                                          onClick={() => setArchived(s.id, !archived)}
                                          disabled={busy}
                                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                                        >
                                          {archived ? 'Р’РµСЂРЅСѓС‚СЊ РёР· Р°СЂС…РёРІР°' : 'Р’ Р°СЂС…РёРІ'}
                                        </button>
                                      </div>

                                      <div className="mt-3 text-xs text-zinc-300">РќР°Р·РЅР°С‡РµРЅС‹:</div>
                                      {assigned.length === 0 ? (
                                        <div className="mt-1 text-xs text-zinc-500">вЂ”</div>
                                      ) : (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {assigned.map((w) => (
                                            <div key={w.id} className="flex items-center gap-2 rounded-2xl border border-yellow-400/10 bg-black/35 px-3 py-2 text-xs">
                                              <span className="text-zinc-100">{w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}</span>
                                              <button
                                                onClick={() => unassign(s.id, w.id)}
                                                disabled={busy}
                                                className="rounded-xl border border-yellow-400/20 bg-black/30 px-2 py-1 text-[11px] text-yellow-100/80 transition hover:border-yellow-300/50 disabled:opacity-60"
                                              >
                                                СЃРЅСЏС‚СЊ
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
                                          <span className="text-[11px] text-zinc-300">Р”РѕР±Р°РІРёС‚СЊ СЂР°Р±РѕС‚РЅРёРєР°</span>
                                          <select
                                            value={workerPickSite[s.id] || ''}
                                            onChange={(e) => setWorkerPickSite((p) => ({ ...p, [s.id]: e.target.value }))}
                                            className="w-[240px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                                          >
                                            <option value="">Р’С‹Р±РµСЂРё СЂР°Р±РѕС‚РЅРёРєР°вЂ¦</option>
                                            {workersForSelect.map((w) => (
                                              <option key={w.id} value={w.id}>
                                                {w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}
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
                                          РќР°Р·РЅР°С‡РёС‚СЊ
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">РђСЂС…РёРІРЅС‹Р№ РѕР±СЉРµРєС‚</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}

                        <Modal open={siteCreateOpen} title="РќРѕРІС‹Р№ РѕР±СЉРµРєС‚" onClose={() => setSiteCreateOpen(false)}>
                          <div className="grid gap-3">
                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">РќР°Р·РІР°РЅРёРµ</span>
                              <input
                                value={newObjName}
                                onChange={(e) => setNewObjName(e.target.value)}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder="РќР°РїСЂРёРјРµСЂ: Р”РѕРј, РѕС„РёСЃ, РѕР±СЉРµРєС‚ в„–1"
                              />
                            </label>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">РђРґСЂРµСЃ</span>
                              <input
                                value={newObjAddress}
                                onChange={(e) => setNewObjAddress(e.target.value)}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder="(РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)"
                              />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">Р Р°РґРёСѓСЃ (Рј)</span>
                                <input
                                  value={newObjRadius}
                                  onChange={(e) => setNewObjRadius(e.target.value)}
                                  className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  placeholder="150"
                                />
                              </label>

                              <div className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">РљР°С‚РµРіРѕСЂРёСЏ</span>
                                <CategoryPicker value={newObjCategory} onChange={setNewObjCategory} disabled={busy} />
                              </div>
                            </div>

                            <label className="grid gap-1">
                              <span className="text-[11px] text-zinc-300">Р—Р°РјРµС‚РєРё</span>
                              <textarea
                                value={newObjNotes}
                                onChange={(e) => setNewObjNotes(e.target.value)}
                                className="min-h-[100px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                placeholder="(РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)"
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={createObjectSite}
                                disabled={busy || !newObjName.trim()}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200/70 disabled:opacity-60"
                              >
                                РЎРѕР·РґР°С‚СЊ
                              </button>
                              <button
                                onClick={() => setSiteCreateOpen(false)}
                                disabled={busy}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-5 py-3 text-sm text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                              >
                                РћС‚РјРµРЅР°
                              </button>
                            </div>
                          </div>
                        </Modal>

                        <Modal open={siteCardOpen} title={siteCardName || 'РљР°СЂС‚РѕС‡РєР° РѕР±СЉРµРєС‚Р°'} onClose={() => setSiteCardOpen(false)}>
                          {!siteCardId ? (
                            <div className="text-sm text-zinc-300">РќРµС‚ РѕР±СЉРµРєС‚Р°</div>
                          ) : (
                            <div className="grid gap-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">РќР°Р·РІР°РЅРёРµ</span>
                                  <input
                                    value={siteCardName}
                                    onChange={(e) => setSiteCardName(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">РђРґСЂРµСЃ</span>
                                  <input
                                    value={siteCardAddress}
                                    onChange={(e) => setSiteCardAddress(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Р Р°РґРёСѓСЃ (Рј)</span>
                                  <input
                                    value={siteCardRadius}
                                    onChange={(e) => setSiteCardRadius(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                  />
                                </label>

                                <div className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">РљР°С‚РµРіРѕСЂРёСЏ</span>
                                  <CategoryPicker value={siteCardCategory} onChange={setSiteCardCategory} disabled={busy} />
                                </div>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Lat</span>
                                  <input
                                    value={siteCardLat}
                                    onChange={(e) => setSiteCardLat(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                    placeholder="РЅР°РїСЂРёРјРµСЂ 41.40338"
                                  />
                                </label>

                                <label className="grid gap-1">
                                  <span className="text-[11px] text-zinc-300">Lng</span>
                                  <input
                                    value={siteCardLng}
                                    onChange={(e) => setSiteCardLng(e.target.value)}
                                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                                    placeholder="РЅР°РїСЂРёРјРµСЂ 2.17403"
                                  />
                                </label>

                                <label className="grid gap-1 sm:col-span-2">
                                  <span className="text-[11px] text-zinc-300">Р—Р°РјРµС‚РєРё</span>
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
                                    РЎРѕС…СЂР°РЅРёС‚СЊ
                                  </button>
                                  <button
                                    onClick={() => deleteObjectSite(siteCardId)}
                                    disabled={busy}
                                    className="rounded-2xl border border-red-500/25 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100/85 transition hover:border-red-400/45 disabled:opacity-60"
                                  >
                                    РЈРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚
                                  </button>
                                </div>
                              </div>

                              {(() => {
                                const lat = siteCardLat.trim() === '' ? null : Number(siteCardLat)
                                const lng = siteCardLng.trim() === '' ? null : Number(siteCardLng)
                                if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null
                                return (
                                  <div className="grid gap-2">
                                    <div className="text-sm font-semibold text-yellow-100">РљР°СЂС‚Р°</div>
                                    <MapLarge lat={lat} lng={lng} />
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-yellow-100/70">
                                      <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={googleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                                        Google РЅР°РІРёРіР°С†РёСЏ
                                      </a>
                                      <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={appleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                                        Apple РЅР°РІРёРіР°С†РёСЏ
                                      </a>
                                    </div>
                                  </div>
                                )
                              })()}

                              <div className="grid gap-2">
                                <div className="text-sm font-semibold text-yellow-100">Р¤РѕС‚Рѕ (РґРѕ 5)</div>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs text-yellow-100/55">РЎРµР№С‡Р°СЃ: {siteCardPhotos.length}/5</div>

                                  <div className="flex flex-wrap gap-2">
                                    <label
                                      className={cn(
                                        'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40',
                                        photoBusy || !siteCardId || siteCardPhotos.length >= 5 ? 'opacity-70' : ''
                                      )}
                                    >
                                      Р—Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ
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
                                            setPhotoUiError('ID РѕР±СЉРµРєС‚Р° РЅРµ РЅР°Р№РґРµРЅ. Р—Р°РєСЂРѕР№ Рё РѕС‚РєСЂРѕР№ РєР°СЂС‚РѕС‡РєСѓ РѕР±СЉРµРєС‚Р° Р·Р°РЅРѕРІРѕ.')
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
                                      РЎРґРµР»Р°С‚СЊ С„РѕС‚Рѕ
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
                                            setPhotoUiError('ID РѕР±СЉРµРєС‚Р° РЅРµ РЅР°Р№РґРµРЅ. Р—Р°РєСЂРѕР№ Рё РѕС‚РєСЂРѕР№ РєР°СЂС‚РѕС‡РєСѓ РѕР±СЉРµРєС‚Р° Р·Р°РЅРѕРІРѕ.')
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
                                  <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">Р¤РѕС‚Рѕ РЅРµС‚</div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    {siteCardPhotos.map((p, idx) => (
                                      <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={p.url || ""} alt="site" className="h-36 w-full object-cover" loading="lazy" />

                                        <div className="absolute left-2 top-2 rounded-xl border border-yellow-400/15 bg-black/50 px-2 py-1 text-[11px] text-yellow-100/80">{idx === 0 ? 'РіР»Р°РІРЅРѕРµ' : ''}</div>

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
                                              Р“Р»Р°РІРЅРѕРµ
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
                                            РЈРґР°Р»РёС‚СЊ
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {photoBusy ? <div className="text-xs text-yellow-100/45">РћР±СЂР°Р±РѕС‚РєР°вЂ¦</div> : null}
                              </div>
                            </div>
                          )}
                        </Modal>
                      </div>
	                    ) : null}


          {/* Р РђР‘РћРўРќРРљР */}
          {tab === 'workers' ? (
            <div className="mt-6 grid gap-3">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">РЎРѕР·РґР°С‚СЊ СЂР°Р±РѕС‚РЅРёРєР°</div>
                    <div className="mt-1 text-xs text-zinc-300">РЎРѕР·РґР°С‘С‚ СЂР°Р±РѕС‚РЅРёРєР° Рё РїРѕРєР°Р·С‹РІР°РµС‚ РІСЂРµРјРµРЅРЅС‹Р№ РїР°СЂРѕР»СЊ. Р›РѕРіРёРЅ РјРѕР¶РµС‚ Р±С‹С‚СЊ email РёР»Рё С‚РµР»РµС„РѕРЅ (+...).</div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">Р›РѕРіРёРЅ (email РёР»Рё С‚РµР»РµС„РѕРЅ)</span>
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        type="text"
                        autoComplete="username"
                        className="w-[260px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                        placeholder="name@domain.com РёР»Рё +31612345678"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => void inviteWorker()}
                      disabled={busy || !inviteEmail.trim()}
                      className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                    >
                      РЎРѕР·РґР°С‚СЊ
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
                          <div className="relative mt-0.5">
                            {workerPhotoMeta[w.id]?.thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={workerPhotoMeta[w.id]?.thumb || ''}
                                alt="avatar"
                                className="h-10 w-10 rounded-full border border-yellow-400/20 object-cover shadow-sm"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-400/15 bg-black/30 text-[12px] font-semibold text-yellow-100/80">
                                {initials(w.full_name)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-[220px]">
                            <div className="text-base font-semibold text-yellow-100">
                              <button onClick={() => openWorkerCard(w.id)} className="hover:text-yellow-100">
                                {w.full_name || 'Р‘РµР· РёРјРµРЅРё'}
                              </button>{' '}
                            {isAdmin ? (
                              <span className="ml-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-[11px] text-yellow-100">
                                Р°РґРјРёРЅ
                              </span>
                            ) : (
                              <span className="ml-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                                СЂР°Р±РѕС‚РЅРёРє
                              </span>
                            )}
                            {w.active === false ? (
                              <span className="ml-2 rounded-xl border border-red-400/20 bg-red-500/10 px-2 py-1 text-[11px] text-red-100">
                                РѕС‚РєР»СЋС‡С‘РЅ
                              </span>
                            ) : null}
                            <span className="ml-2 rounded-xl border border-yellow-400/15 bg-black/30 px-2 py-1 text-[11px] text-zinc-200">
                              С„РѕС‚Рѕ: {workerPhotoMeta[w.id]?.count ?? 'вЂ¦'}/5
                            </span>
                          </div>

                          <div className="mt-3 text-xs text-zinc-300">РћР±СЉРµРєС‚С‹:</div>
                          {sitesList.length === 0 ? (
                            <div className="mt-1 text-xs text-zinc-500">вЂ”</div>
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
                                    СЃРЅСЏС‚СЊ
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {!isAdmin ? (
                              <button
                                onClick={() => setRole(w.id, 'admin')}
                                disabled={busy}
                                className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-4 py-2 text-xs font-semibold text-yellow-100 transition hover:border-yellow-200/70 hover:bg-yellow-400/15 disabled:opacity-60"
                              >
                                РЎРґРµР»Р°С‚СЊ Р°РґРјРёРЅРѕРј
                              </button>
                            ) : (
                              <button
                                onClick={() => setRole(w.id, 'worker')}
                                disabled={busy || isMe}
                                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-yellow-300/40 disabled:opacity-60"
                              >
                                РЎРґРµР»Р°С‚СЊ СЂР°Р±РѕС‚РЅРёРєРѕРј
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
                                {w.active === false ? 'Р’РµСЂРЅСѓС‚СЊ РёР· Р°СЂС…РёРІР°' : 'РђСЂС…РёРІРёСЂРѕРІР°С‚СЊ'}
                              </button>

                              <button
                                onClick={() => deleteWorker(w.id)}
                                disabled={busy}
                                className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-100 transition hover:border-red-300/40 hover:bg-red-500/15 disabled:opacity-60"
                              >
                                РЈРґР°Р»РёС‚СЊ
                              </button>
                            </div>
                          ) : null}

                          {!isAdmin ? (
                            <div className="flex flex-wrap items-end gap-2">
                              <label className="grid gap-1">
                                <span className="text-[11px] text-zinc-300">Р”РѕР±Р°РІРёС‚СЊ РѕР±СЉРµРєС‚</span>
                                <select
                                  value={pick}
                                  onChange={(e) => setWorkerPickSite((p) => ({ ...p, [w.id]: e.target.value }))}
                                  className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                                >
                                  <option value="">Р’С‹Р±РµСЂРё РѕР±СЉРµРєС‚вЂ¦</option>
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
                                РќР°Р·РЅР°С‡РёС‚СЊ
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                              РђРґРјРёРЅР° РЅРµ РЅР°Р·РЅР°С‡Р°РµРј
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : null}

          {/* РЎРњР•РќР« */}
          {tab === 'jobs' ? (
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="text-sm font-semibold text-yellow-100">РЎРѕР·РґР°С‚СЊ СЃРјРµРЅСѓ</div>
                <div className="mt-1 text-xs text-zinc-300">РћР±СЉРµРєС‚ + РґР°С‚Р° + РІСЂРµРјСЏ + РЅРµСЃРєРѕР»СЊРєРѕ СЂР°Р±РѕС‚РЅРёРєРѕРІ.</div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_1.7fr_0.8fr_0.7fr_0.7fr_auto]">
                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">РћР±СЉРµРєС‚</span>
                    <select
                      value={newSiteId}
                      onChange={(e) => {
                        const v = e.target.value
                        setNewSiteId(v)
                        setNewWorkers([])
                      }}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                    >
                      <option value="">Р’С‹Р±РµСЂРё РѕР±СЉРµРєС‚вЂ¦</option>
                      {activeSites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name || s.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">Р Р°Р±РѕС‚РЅРёРєРё (РјРѕР¶РЅРѕ РЅРµСЃРєРѕР»СЊРєРѕ)</span>
                    <MultiWorkerPicker workers={workersForPicker} value={newWorkers} onChange={setNewWorkers} disabled={!newSiteId} />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">Р”Р°С‚Р°</span>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">Р’СЂРµРјСЏ</span>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[11px] text-zinc-300">РљРѕРЅРµС†</span>
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
                    РЎРѕР·РґР°С‚СЊ СЃРјРµРЅСѓ
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
                    Р Р°СЃРїРёСЃР°РЅРёРµ
                  </button>
                  <button
                    onClick={() => setJobsView('board')}
                    className={cn(
                      'rounded-2xl border px-4 py-2 text-xs font-semibold transition',
                      jobsView === 'board' ? 'border-yellow-300/70 bg-yellow-400/10 text-yellow-100' : 'border-yellow-400/15 bg-black/30 text-zinc-200 hover:border-yellow-300/40'
                    )}
                  >
                    Р”РѕСЃРєР°
                  </button>

                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        setAnchorDate(toISODate(new Date()))
                        recalcRange('day', toISODate(new Date()))
                      }}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-yellow-300/40"
                    >
                      РЎРµРіРѕРґРЅСЏ
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
                      РќРµРґРµР»СЏ
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
                      РњРµСЃСЏС†
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="text-sm font-semibold text-yellow-100">Р¤РёР»СЊС‚СЂС‹</div>

                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">РЎ</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">РџРѕ</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-[11px] text-zinc-300">РћР±СЉРµРєС‚</span>
                      <select
                        value={filterSite}
                        onChange={(e) => setFilterSite(e.target.value)}
                        className="w-[220px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">Р’СЃРµ</option>
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
                      <span className="text-[11px] text-zinc-300">Р Р°Р±РѕС‚РЅРёРє</span>
                      <select
                        value={filterWorker}
                        onChange={(e) => setFilterWorker(e.target.value)}
                        className="w-[220px] rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-xs outline-none transition focus:border-yellow-300/60"
                      >
                        <option value="">Р’СЃРµ</option>
                        {workers
                          .slice()
                          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.full_name || 'Р‘РµР· РёРјРµРЅРё'}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>

                {jobsView === 'board' ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-4">
                    {[
                      { key: 'planned', title: 'Р—Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕ', items: planned },
                      { key: 'in_progress', title: 'Р’ РїСЂРѕС†РµСЃСЃРµ', items: inProgress },
                      { key: 'done', title: 'Р—Р°РІРµСЂС€РµРЅРѕ', items: done },
                      { key: 'cancelled', title: 'РћС‚РјРµРЅРµРЅРѕ', items: cancelled },
                    ].map((col) => (
                      <div key={col.key} className="rounded-3xl border border-yellow-400/12 bg-black/20 p-4">
                        <div className="text-xs font-semibold text-zinc-200">{col.title}</div>
                        <div className="mt-3 grid gap-2">
                          {col.items.map((j) => jobCard(j, false))}
                          {col.items.length === 0 ? <div className="text-xs text-zinc-500">вЂ”</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 overflow-auto rounded-3xl border border-yellow-400/10 bg-black/20">
                    <table className="min-w-[920px] w-full text-left text-sm">
                      <thead className="bg-black/30 text-xs text-zinc-300">
                        <tr>
                          <th className="px-4 py-3">Р”Р°С‚Р°</th>
                          <th className="px-4 py-3">Р’СЂРµРјСЏ</th>
                          <th className="px-4 py-3">РћР±СЉРµРєС‚</th>
                          <th className="px-4 py-3">Р Р°Р±РѕС‚РЅРёРє</th>
                          <th className="px-4 py-3">РЎС‚Р°С‚СѓСЃ</th>
                          <th className="px-4 py-3">РќР°С‡Р°Р»</th>
                          <th className="px-4 py-3">Р—Р°РєРѕРЅС‡РёР»</th>
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
                                <div className="flex items-center gap-2">
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
                                        title={canNav ? 'РћС‚РєСЂС‹С‚СЊ РЅР°РІРёРіР°С†РёСЋ' : 'Р¤РѕС‚Рѕ РѕР±СЉРµРєС‚Р°'}
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                                      </button>
                                    )
                                  })()}
                                  <span>{j.site_name || 'вЂ”'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {j.worker_id ? (
                                  <button
                                    onClick={() => openWorkerCard(j.worker_id!)}
                                    className="flex items-center gap-2 text-yellow-100 hover:text-yellow-50"
                                  >
                                    {workerPhotoMeta[j.worker_id!]?.thumb ? (
                                      // eslint-disable-next-line @next/next/no-img-element
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
                                    <span className="truncate">{j.worker_name || 'вЂ”'}</span>
                                  </button>
                                ) : (
                                  'вЂ”'
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
                                  РїСЂР°РІРёС‚СЊ
                                </button>
                              </td>
                            </tr>
                          ))}
                        {scheduleFiltered.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-xs text-zinc-500">
                              РќРµС‚ СЃРјРµРЅ
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

          {/* Р“Р РђР¤РРљ */}
          {tab === 'plan' ? (
            <div className="mt-6">
              <PlanToolbar />

              {planView === 'week' ? <PlanWeekGrid /> : null}
              {planView === 'day' ? <PlanDayGrid /> : null}
              {planView === 'month' ? <PlanMonthGrid /> : null}

              <div className="mt-4 rounded-3xl border border-yellow-400/15 bg-black/20 p-4 text-xs text-zinc-300">
                РџРѕРґСЃРєР°Р·РєР°: РїРµСЂРµС‚Р°СЃРєРёРІР°Р№ СЃРјРµРЅС‹ РјС‹С€РєРѕР№. РљР»РёРє РїРѕ СЃРјРµРЅРµ вЂ” вЂњРїСЂР°РІРёС‚СЊвЂќ. вЂњРџРµСЂРµРЅРµСЃС‚РёвЂќ вЂ” Р±С‹СЃС‚СЂС‹Р№ РїРµСЂРµРІРѕРґ РЅР° РґСЂСѓРіРѕРіРѕ СЂР°Р±РѕС‚РЅРёРєР°. вЂњРћС‚РјРµРЅРёС‚СЊвЂќ вЂ” СѓР±СЂР°С‚СЊ РёР· РіСЂР°С„РёРєР°.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* РњРћР”РђР›РљРђ: РџР РђР’РљРђ РЎРњР•РќР« */}
      <Modal open={editOpen} title="РџСЂР°РІРєР° СЃРјРµРЅС‹" onClose={() => setEditOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">РћР±СЉРµРєС‚</span>
            <select
              value={editSiteId}
              onChange={(e) => setEditSiteId(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">вЂ”</option>
              {activeSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Р Р°Р±РѕС‚РЅРёРє</span>
            <select
              value={editWorkerId}
              onChange={(e) => setEditWorkerId(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">вЂ”</option>
              {workersForSelect.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">Р”Р°С‚Р°</span>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">РќР°С‡Р°Р»Рѕ</span>
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">РљРѕРЅРµС†</span>
              <input
                type="time"
                value={editTimeTo}
                onChange={(e) => setEditTimeTo(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              />
            </label>
          </div>

          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">РЎС‚Р°С‚СѓСЃ</span>
            <select
              value={String(editStatus)}
              onChange={(e) => setEditStatus(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="planned">Р—Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕ</option>
              <option value="in_progress">Р’ РїСЂРѕС†РµСЃСЃРµ</option>
              <option value="done">Р—Р°РІРµСЂС€РµРЅРѕ</option>
              <option value="cancelled">РћС‚РјРµРЅРµРЅРѕ</option>
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
              РћС‚РјРµРЅРёС‚СЊ СЃРјРµРЅСѓ
            </button>

            <button
              onClick={saveEdit}
              disabled={busy || !editJobId}
              className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
            >
              РЎРѕС…СЂР°РЅРёС‚СЊ
            </button>
          </div>
        </div>
      </Modal>

      {/* РњРћР”РђР›РљРђ: РљРђР РўРћР§РљРђ Р РђР‘РћРўРќРРљРђ */}
      <Modal open={workerCardOpen} title="РљР°СЂС‚РѕС‡РєР° СЂР°Р±РѕС‚РЅРёРєР°" onClose={() => setWorkerCardOpen(false)}>
        <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
          {(() => {
            const w = workersById.get(workerCardId)
            const archived = w?.active === false
            const role = w?.role === 'admin' ? 'РђРґРјРёРЅ' : 'Р Р°Р±РѕС‚РЅРёРє'

            return (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-yellow-100">{w?.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}</div>
                    <div className="mt-1 text-xs text-zinc-300">
                      {role}
                      {archived ? ' вЂў РІ Р°СЂС…РёРІРµ' : ' вЂў Р°РєС‚РёРІРµРЅ'}
                      <span className="text-zinc-500"> вЂў </span>
                      <span className="text-zinc-400">ID:</span>{' '}
                      <span className="font-mono text-[11px] text-zinc-400">{workerCardId}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-300">Р”РёР°РїР°Р·РѕРЅ: {fmtD(dateFrom)} вЂ” {fmtD(dateTo)}</div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-yellow-100">Р”Р°РЅРЅС‹Рµ Рё Р·Р°РјРµС‚РєРё</div>

                    <button
                      onClick={() => {
                        if (!workerCardId) return
                        void saveWorkerProfile(workerCardId)
                      }}
                      disabled={workerProfileSaving || !workerCardId}
                      className={cn(
                        'rounded-xl border border-yellow-300/35 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70',
                        workerProfileSaving ? 'opacity-70' : ''
                      )}
                    >
                      {workerProfileSaving ? 'РЎРѕС…СЂР°РЅРµРЅРёРµвЂ¦' : 'РЎРѕС…СЂР°РЅРёС‚СЊ'}
                    </button>
                  </div>

                  {workerProfileLoading ? (
                    <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">Р—Р°РіСЂСѓР·РєР° РґР°РЅРЅС‹С…вЂ¦</div>
                  ) : (
                    <div className="grid gap-2 rounded-3xl border border-yellow-400/10 bg-black/20 p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="grid gap-1">
                          <div className="text-[11px] text-zinc-400">Р¤РРћ</div>
                          <input
                            value={workerCardFullName}
                            onChange={(e) => setWorkerCardFullName(e.target.value)}
                            placeholder="РРјСЏ СЂР°Р±РѕС‚РЅРёРєР°"
                            className="w-full rounded-xl border border-yellow-400/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                          />
                        </div>

                        <div className="grid gap-1">
                          <div className="text-[11px] text-zinc-400">РљРѕРЅС‚Р°РєС‚С‹</div>
                          <div className="rounded-xl border border-yellow-400/10 bg-black/25 px-3 py-2 text-xs text-zinc-200">
                            <div>
                              <span className="text-zinc-500">Email:</span>{' '}
                              <span className="text-zinc-200">{workerProfileById?.[workerCardId]?.email || 'вЂ”'}</span>
                            </div>
                            <div className="mt-1">
                              <span className="text-zinc-500">РўРµР»:</span>{' '}
                              <span className="text-zinc-200">{workerProfileById?.[workerCardId]?.phone || 'вЂ”'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-1">
                        <div className="text-[11px] text-zinc-400">Р—Р°РјРµС‚РєРё</div>
                        <textarea
                          value={workerCardNotes}
                          onChange={(e) => setWorkerCardNotes(e.target.value)}
                          placeholder="Р—Р°РјРµС‚РєРё: РіСЂР°С„РёРє, РєР»СЋС‡Рё, РёРЅСЃС‚СЂСѓРєС†РёРё, РЅСЋР°РЅСЃС‹вЂ¦"
                          rows={4}
                          className="w-full resize-none rounded-2xl border border-yellow-400/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-yellow-300/40"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-semibold text-yellow-100">Р¤РѕС‚Рѕ (РґРѕ 5)</div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-yellow-100/55">РЎРµР№С‡Р°СЃ: {workerCardPhotos.length}/5</div>

                    <div className="flex flex-wrap gap-2">
                      <label
                        className={cn(
                          'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40',
                          workerPhotoBusy || !workerCardId || workerCardPhotos.length >= 5 ? 'opacity-70' : ''
                        )}
                      >
                        Р—Р°РіСЂСѓР·РёС‚СЊ С„РѕС‚Рѕ
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
                        РЎРґРµР»Р°С‚СЊ С„РѕС‚Рѕ
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
                    <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">Р¤РѕС‚Рѕ РЅРµС‚</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {workerCardPhotos.map((p) => (
                        <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url || ''} alt="worker" className="h-36 w-full object-cover" loading="lazy" />

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
                              РЈРґР°Р»РёС‚СЊ
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
                              {workerCardAvatarPath === p.path ? 'РђРІР°С‚Р°СЂ' : 'РЎРґРµР»Р°С‚СЊ Р°РІР°С‚Р°СЂРѕРј'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {workerPhotoBusy ? <div className="text-xs text-yellow-100/45">РћР±СЂР°Р±РѕС‚РєР°вЂ¦</div> : null}
                </div>

                <div className="mt-1 grid gap-2">
                  <div className="text-sm font-semibold text-yellow-100">РЎРјРµРЅС‹</div>

                  {workerCardItems.length === 0 ? (
                    <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-zinc-500">РЎРјРµРЅ РЅРµС‚</div>
                  ) : null}

                  {workerCardItems.map((j) => (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-yellow-400/10 bg-black/30 px-3 py-2">
                      <div className="text-xs text-zinc-200">
                        <span className="text-zinc-100">{fmtD(j.job_date)}</span> вЂў <span className="text-zinc-100">{timeRangeHHMM(j.scheduled_time, j.scheduled_end_time)}</span> вЂў{' '}
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
                                title={canNav ? 'РћС‚РєСЂС‹С‚СЊ РЅР°РІРёРіР°С†РёСЋ' : 'Р¤РѕС‚Рѕ РѕР±СЉРµРєС‚Р°'}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                              </button>
                            )
                          })()}
                          <span>{j.site_name || 'вЂ”'}</span>
                        </span> вЂў <span className="text-zinc-500">{statusRu(String(j.status || ''))}</span>
                        <div className="mt-1 text-[11px] text-zinc-400">РќР°С‡Р°Р»: {fmtDT(j.started_at)} вЂў Р—Р°РєРѕРЅС‡РёР»: {fmtDT(j.stopped_at)}</div>
                      </div>
                      <button
                        onClick={() => openEditForJob(j)}
                        disabled={busy}
                        className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-1 text-xs text-zinc-200 hover:border-yellow-300/40 disabled:opacity-60"
                      >
                        РџСЂР°РІРёС‚СЊ
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      </Modal>

      {/* РњРћР”РђР›РљРђ: РџР•Р Р•РќРћРЎ РЎРњР•РќР« РќРђ Р”Р РЈР“РћР“Рћ Р РђР‘РћРўРќРРљРђ */}
      <Modal open={moveJobOpen} title="РџРµСЂРµРЅРµСЃС‚Рё СЃРјРµРЅСѓ" onClose={() => setMoveJobOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">РљРѕРјСѓ РїРµСЂРµРЅРµСЃС‚Рё</span>
            <select
              value={moveJobTargetWorker}
              onChange={(e) => setMoveJobTargetWorker(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            >
              <option value="">Р’С‹Р±РµСЂРё СЂР°Р±РѕС‚РЅРёРєР°вЂ¦</option>
              {workersForSelect.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}
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
            РџРµСЂРµРЅРµСЃС‚Рё
          </button>
        </div>
      </Modal>

      {/* РњРћР”РђР›РљРђ: РџР•Р Р•РќРћРЎ Р”РќРЇ */}
      <Modal open={moveDayOpen} title="РџРµСЂРµРЅРµСЃС‚Рё РґРµРЅСЊ" onClose={() => setMoveDayOpen(false)}>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="text-[11px] text-zinc-300">Р”Р°С‚Р°</span>
            <input
              type="date"
              value={moveDayDate}
              onChange={(e) => setMoveDayDate(e.target.value)}
              className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">РЎ РєРѕРіРѕ</span>
              <select
                value={moveDayFromWorker}
                onChange={(e) => setMoveDayFromWorker(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              >
                <option value="">Р’С‹Р±РµСЂРё СЂР°Р±РѕС‚РЅРёРєР°вЂ¦</option>
                {workersForSelect.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-[11px] text-zinc-300">РќР° РєРѕРіРѕ</span>
              <select
                value={moveDayToWorker}
                onChange={(e) => setMoveDayToWorker(e.target.value)}
                className="rounded-2xl border border-yellow-400/20 bg-black/40 px-3 py-3 text-sm outline-none transition focus:border-yellow-300/60"
              >
                <option value="">Р’С‹Р±РµСЂРё СЂР°Р±РѕС‚РЅРёРєР°вЂ¦</option>
                {workersForSelect.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name || 'Р Р°Р±РѕС‚РЅРёРє'}
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
            РџРµСЂРµРЅРѕСЃРёС‚СЊ С‚РѕР»СЊРєРѕ вЂњР—Р°РїР»Р°РЅРёСЂРѕРІР°РЅРѕвЂќ
          </label>

          <button
            onClick={moveDay}
            disabled={busy || !moveDayFromWorker || !moveDayToWorker || !moveDayDate}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            РџРµСЂРµРЅРµСЃС‚Рё РґРµРЅСЊ
          </button>
        </div>
      </Modal>

      {/* РњРћР”РђР›РљРђ: РћРўРњР•РќРђ */}
      <Modal open={cancelOpen} title="РћС‚РјРµРЅР° СЃРјРµРЅС‹" onClose={() => setCancelOpen(false)}>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-3 text-sm text-zinc-200">
            Р­С‚Рѕ СѓР±РµСЂС‘С‚ СЃРјРµРЅСѓ РёР· СЂР°Р±РѕС‚С‹ (СЃС‚Р°С‚СѓСЃ вЂњРћС‚РјРµРЅРµРЅРѕвЂќ). РћС‚С‡С‘С‚С‹ РЅРµ Р»РѕРјР°РµРј.
          </div>

          <button
            onClick={() => cancelJob(cancelJobId)}
            disabled={busy || !cancelJobId}
            className="rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100 hover:border-yellow-200/70 disabled:opacity-60"
          >
            РћС‚РјРµРЅРёС‚СЊ
          </button>
        </div>
      </Modal>
    </main>
  )
}


















