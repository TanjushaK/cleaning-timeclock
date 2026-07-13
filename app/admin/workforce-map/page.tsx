'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { clearClientAuthState, getAccessToken } from '@/lib/auth-fetch'

type ParticipantStatus = 'scheduled' | 'working' | 'completed' | 'late' | 'missing'
type SummaryStatus = ParticipantStatus | 'unassigned'

type Participant = {
  worker_id: string
  worker_name: string
  active: boolean | null
  status: ParticipantStatus
  started_at: string | null
  stopped_at: string | null
}

type WorkforceItem = {
  job_id: string
  job_status: string | null
  job_date: string | null
  scheduled_time: string | null
  scheduled_end_time: string | null
  summary_status: SummaryStatus
  site: {
    id: string
    name: string | null
    address: string | null
    lat: number | null
    lng: number | null
    radius: number | null
  } | null
  participants: Participant[]
  participant_count: number
}

type WorkforceResponse = {
  date_from: string
  date_to: string
  generated_at: string
  items: WorkforceItem[]
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function toISODate(value: Date) {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return `${pad2(parsed.getDate())}-${pad2(parsed.getMonth() + 1)}-${parsed.getFullYear()} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`
}

function formatTime(value: string | null) {
  return value ? String(value).slice(0, 5) : '—'
}

function buildMapUrl(item: WorkforceItem | null) {
  const lat = item?.site?.lat
  const lng = item?.site?.lng
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const radius = item?.site?.radius && item.site.radius > 0 ? Math.min(Math.max(item.site.radius, 50), 5000) : 150
  const latDelta = Math.max(radius / 111320, 0.003)
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2)
  const lngDelta = Math.max(radius / (111320 * cosLat), 0.003)
  const bbox = [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta]
    .map((value) => value.toFixed(6))
    .join(',')
  return `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${lat.toFixed(7)},${lng.toFixed(7)}`,
  }).toString()}`
}

function statusLabel(status: SummaryStatus) {
  return ({
    scheduled: 'Запланировано',
    working: 'Работает',
    completed: 'Завершено',
    late: 'Опаздывает',
    missing: 'Не вышел',
    unassigned: 'Без работника',
  } as Record<SummaryStatus, string>)[status]
}

function statusClasses(status: SummaryStatus) {
  if (status === 'working') return 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
  if (status === 'completed') return 'border-sky-400/40 bg-sky-500/20 text-sky-100'
  if (status === 'late') return 'border-amber-400/50 bg-amber-500/20 text-amber-100'
  if (status === 'missing') return 'border-rose-400/50 bg-rose-500/20 text-rose-100'
  if (status === 'unassigned') return 'border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100'
  return 'border-zinc-400/30 bg-zinc-500/15 text-zinc-100'
}

export default function WorkforceMapPage() {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])
  const [dateFrom, setDateFrom] = useState(toISODate(today))
  const [dateTo, setDateTo] = useState(toISODate(today))
  const [status, setStatus] = useState<SummaryStatus | ''>('')
  const [items, setItems] = useState<WorkforceItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/admin')
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      const response = await fetch(`/api/admin/workforce-map?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = (await response.json().catch(() => ({}))) as WorkforceResponse & { error?: string }
      if (response.status === 401) {
        clearClientAuthState()
        router.replace('/admin')
        return
      }
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      setItems(body.items || [])
      setGeneratedAt(body.generated_at || null)
      setSelectedId((current) => current && body.items?.some((item) => item.job_id === current) ? current : body.items?.[0]?.job_id || null)
    } catch (caught) {
      setError(String((caught as Error)?.message || caught))
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, router])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    return () => window.clearInterval(timer)
  }, [load])

  const filtered = useMemo(() => status ? items.filter((item) => item.summary_status === status) : items, [items, status])
  const selected = filtered.find((item) => item.job_id === selectedId) || filtered[0] || null
  const mapUrl = buildMapUrl(selected)
  const problems = filtered.filter((item) => ['late', 'missing', 'unassigned'].includes(item.summary_status))

  const setRange = (mode: 'today' | 'now' | 'week') => {
    const now = new Date()
    setDateFrom(toISODate(now))
    setDateTo(mode === 'week' ? toISODate(addDays(now, 6)) : toISODate(now))
    if (mode === 'now') setStatus('working')
    else setStatus('')
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Карта смен</h1>
            <p className="mt-1 text-sm text-zinc-400">Объекты, назначенные работники и фактический статус смен.</p>
          </div>
          <button onClick={() => router.push('/admin')} className="rounded-xl border border-yellow-400/25 bg-black/30 px-4 py-2 text-sm hover:border-yellow-300/60">Назад в админку</button>
        </div>

        <div className="mt-5 grid gap-3 rounded-3xl border border-yellow-400/15 bg-black/30 p-4 lg:grid-cols-[auto_auto_auto_1fr_auto]">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value as SummaryStatus | '')} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm">
            <option value="">Все статусы</option>
            {(['scheduled', 'working', 'completed', 'late', 'missing', 'unassigned'] as SummaryStatus[]).map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
          </select>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setRange('today')} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm">Сегодня</button>
            <button onClick={() => setRange('now')} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm">Сейчас</button>
            <button onClick={() => setRange('week')} className="rounded-xl border border-zinc-700 px-3 py-2 text-sm">Неделя</button>
          </div>
          <button onClick={() => void load()} disabled={loading} className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">{loading ? 'Обновление…' : 'Обновить'}</button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[420px_1fr]">
          <section className="grid content-start gap-3">
            <div className="flex items-center justify-between text-sm text-zinc-400"><span>Смен: {filtered.length}</span><span>Проблемных: {problems.length}</span></div>
            <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
              {filtered.map((item) => (
                <button key={item.job_id} onClick={() => setSelectedId(item.job_id)} className={`w-full rounded-2xl border p-4 text-left transition ${selected?.job_id === item.job_id ? 'border-yellow-300/60 bg-yellow-400/10' : 'border-zinc-800 bg-black/30 hover:border-zinc-600'}`}>
                  <div className="flex items-start justify-between gap-3"><div className="font-semibold">{item.site?.name || 'Объект не указан'}</div><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClasses(item.summary_status)}`}>{statusLabel(item.summary_status)}</span></div>
                  <div className="mt-1 text-xs text-zinc-400">{item.site?.address || 'Адрес не указан'}</div>
                  <div className="mt-3 text-sm">{formatTime(item.scheduled_time)}–{formatTime(item.scheduled_end_time)} · работников: {item.participant_count}</div>
                  <div className="mt-2 text-xs text-zinc-300">{item.participants.map((participant) => participant.worker_name).join(', ') || 'Работник не назначен'}</div>
                </button>
              ))}
              {!filtered.length ? <div className="rounded-2xl border border-zinc-800 p-6 text-center text-sm text-zinc-500">Смены не найдены</div> : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-yellow-400/15 bg-black/30">
            <div className="min-h-[420px] bg-zinc-900">
              {mapUrl ? <iframe title="Карта объекта" src={mapUrl} className="h-[52vh] min-h-[420px] w-full border-0" loading="lazy" /> : <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-zinc-500">Для выбранного объекта нет корректных координат.</div>}
            </div>
            {selected ? <div className="grid gap-4 p-5 lg:grid-cols-2"><div><div className="text-lg font-semibold">{selected.site?.name || 'Объект не указан'}</div><div className="mt-1 text-sm text-zinc-400">{selected.site?.address || 'Адрес не указан'}</div><div className="mt-3 text-sm">План: {formatTime(selected.scheduled_time)}–{formatTime(selected.scheduled_end_time)}</div><div className="mt-1 text-sm">Радиус: {selected.site?.radius ?? '—'} м</div></div><div className="space-y-2">{selected.participants.map((participant) => <div key={participant.worker_id} className="rounded-2xl border border-zinc-800 bg-black/30 p-3"><div className="flex items-center justify-between gap-2"><span className="font-medium">{participant.worker_name}</span><span className={`rounded-full border px-2 py-1 text-[11px] ${statusClasses(participant.status)}`}>{statusLabel(participant.status)}</span></div><div className="mt-2 text-xs text-zinc-400">Старт: {formatDateTime(participant.started_at)} · Финиш: {formatDateTime(participant.stopped_at)}</div></div>)}{!selected.participants.length ? <div className="text-sm text-zinc-500">Работники не назначены.</div> : null}</div></div> : null}
          </section>
        </div>

        <div className="mt-4 text-right text-xs text-zinc-500">Автообновление раз в минуту{generatedAt ? ` · данные: ${formatDateTime(generatedAt)}` : ''}</div>
      </div>
    </main>
  )
}
