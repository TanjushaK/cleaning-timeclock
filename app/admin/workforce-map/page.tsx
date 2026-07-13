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

type MapPoint = {
  siteId: string
  siteName: string
  address: string
  lat: number
  lng: number
  status: SummaryStatus
  jobs: WorkforceItem[]
  participants: Participant[]
}

type PositionedMapPoint = MapPoint & {
  left: number
  top: number
}

type OverviewMap = {
  url: string
  points: PositionedMapPoint[]
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

function statusRank(status: SummaryStatus) {
  return ({
    completed: 0,
    scheduled: 1,
    working: 2,
    late: 3,
    unassigned: 4,
    missing: 5,
  } as Record<SummaryStatus, number>)[status]
}

function statusClasses(status: SummaryStatus) {
  if (status === 'working') return 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
  if (status === 'completed') return 'border-sky-400/40 bg-sky-500/20 text-sky-100'
  if (status === 'late') return 'border-amber-400/50 bg-amber-500/20 text-amber-100'
  if (status === 'missing') return 'border-rose-400/50 bg-rose-500/20 text-rose-100'
  if (status === 'unassigned') return 'border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100'
  return 'border-zinc-400/30 bg-zinc-500/15 text-zinc-100'
}

function markerClasses(status: SummaryStatus) {
  if (status === 'working') return 'border-emerald-200 bg-emerald-500 text-white'
  if (status === 'completed') return 'border-sky-200 bg-sky-500 text-white'
  if (status === 'late') return 'border-amber-100 bg-amber-500 text-black'
  if (status === 'missing') return 'border-rose-100 bg-rose-600 text-white'
  if (status === 'unassigned') return 'border-fuchsia-100 bg-fuchsia-600 text-white'
  return 'border-zinc-100 bg-zinc-700 text-white'
}

function validCoordinate(value: number | null, min: number, max: number): value is number {
  return value != null && Number.isFinite(value) && value >= min && value <= max
}

function mercatorY(lat: number) {
  const safe = Math.min(85, Math.max(-85, lat))
  const radians = (safe * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + radians / 2))
}

function buildOverviewMap(points: MapPoint[]): OverviewMap | null {
  if (!points.length) return null

  const minLat0 = Math.min(...points.map((point) => point.lat))
  const maxLat0 = Math.max(...points.map((point) => point.lat))
  const minLng0 = Math.min(...points.map((point) => point.lng))
  const maxLng0 = Math.max(...points.map((point) => point.lng))

  const latSpan = Math.max(maxLat0 - minLat0, 0.015)
  const lngSpan = Math.max(maxLng0 - minLng0, 0.02)
  const latPad = Math.max(latSpan * 0.2, 0.006)
  const lngPad = Math.max(lngSpan * 0.2, 0.008)

  const minLat = Math.max(-85, minLat0 - latPad)
  const maxLat = Math.min(85, maxLat0 + latPad)
  const minLng = Math.max(-180, minLng0 - lngPad)
  const maxLng = Math.min(180, maxLng0 + lngPad)

  const yNorth = mercatorY(maxLat)
  const ySouth = mercatorY(minLat)
  const ySpan = Math.max(yNorth - ySouth, Number.EPSILON)
  const xSpan = Math.max(maxLng - minLng, Number.EPSILON)

  const positioned = points.map((point) => ({
    ...point,
    left: Math.min(98, Math.max(2, ((point.lng - minLng) / xSpan) * 100)),
    top: Math.min(96, Math.max(4, ((yNorth - mercatorY(point.lat)) / ySpan) * 100)),
  }))

  const bbox = [minLng, minLat, maxLng, maxLat].map((value) => value.toFixed(6)).join(',')
  const url = `https://www.openstreetmap.org/export/embed.html?${new URLSearchParams({ bbox, layer: 'mapnik' }).toString()}`
  return { url, points: positioned }
}

function markerWorkerLine(point: MapPoint) {
  const names = point.participants.map((participant) => participant.worker_name).filter(Boolean)
  if (!names.length) return 'Работник не назначен'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
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
  const problems = filtered.filter((item) => ['late', 'missing', 'unassigned'].includes(item.summary_status))

  const mapPoints = useMemo(() => {
    const bySite = new Map<string, MapPoint>()

    for (const item of filtered) {
      const lat = item.site?.lat ?? null
      const lng = item.site?.lng ?? null
      if (!validCoordinate(lat, -90, 90) || !validCoordinate(lng, -180, 180)) continue

      const siteId = item.site?.id || `${lat.toFixed(7)}:${lng.toFixed(7)}`
      let point = bySite.get(siteId)
      if (!point) {
        point = {
          siteId,
          siteName: item.site?.name || 'Объект не указан',
          address: item.site?.address || 'Адрес не указан',
          lat,
          lng,
          status: item.summary_status,
          jobs: [],
          participants: [],
        }
        bySite.set(siteId, point)
      }

      point.jobs.push(item)
      if (statusRank(item.summary_status) > statusRank(point.status)) point.status = item.summary_status

      for (const participant of item.participants) {
        const existingIndex = point.participants.findIndex((current) => current.worker_id === participant.worker_id)
        if (existingIndex === -1) {
          point.participants.push(participant)
        } else if (statusRank(participant.status) > statusRank(point.participants[existingIndex].status)) {
          point.participants[existingIndex] = participant
        }
      }
    }

    return Array.from(bySite.values()).sort((a, b) => a.siteName.localeCompare(b.siteName))
  }, [filtered])

  const overviewMap = useMemo(() => buildOverviewMap(mapPoints), [mapPoints])
  const mapWorkerCount = useMemo(() => new Set(mapPoints.flatMap((point) => point.participants.map((participant) => participant.worker_id))).size, [mapPoints])
  const selectedSiteId = selected?.site?.id || null

  const choosePoint = (point: MapPoint) => {
    const best = point.jobs.slice().sort((a, b) => statusRank(b.summary_status) - statusRank(a.summary_status))[0]
    if (best) setSelectedId(best.job_id)
  }

  const setRange = (mode: 'today' | 'now' | 'week') => {
    const now = new Date()
    setDateFrom(toISODate(now))
    setDateTo(mode === 'week' ? toISODate(addDays(now, 6)) : toISODate(now))
    if (mode === 'now') setStatus('working')
    else setStatus('')
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Карта смен</h1>
            <p className="mt-1 text-sm text-zinc-400">Все объекты и назначенные работники одновременно на одной карте.</p>
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

        <section className="mt-5 overflow-hidden rounded-3xl border border-yellow-400/15 bg-black/30">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-yellow-400/10 px-5 py-3 text-sm">
            <div className="font-semibold text-yellow-100">Общая карта</div>
            <div className="text-zinc-400">Объектов: {mapPoints.length} · работников: {mapWorkerCount} · смен: {filtered.length}</div>
          </div>
          <div className="relative h-[58vh] min-h-[460px] overflow-hidden bg-zinc-900">
            {overviewMap ? (
              <>
                <iframe title="Общая карта смен" src={overviewMap.url} className="pointer-events-none absolute inset-0 h-full w-full select-none border-0" loading="lazy" />
                <div className="absolute inset-0 z-10">
                  {overviewMap.points.map((point) => {
                    const selectedPoint = selectedSiteId === point.siteId
                    return (
                      <button
                        key={point.siteId}
                        type="button"
                        onClick={() => choosePoint(point)}
                        style={{ left: `${point.left}%`, top: `${point.top}%` }}
                        className="group absolute -translate-x-1/2 -translate-y-1/2 text-left"
                        title={`${point.siteName}: ${markerWorkerLine(point)}`}
                      >
                        <div className={`flex items-center gap-2 rounded-2xl border bg-black/85 p-1.5 pr-3 shadow-[0_8px_28px_rgba(0,0,0,0.65)] backdrop-blur transition group-hover:scale-105 ${selectedPoint ? 'ring-2 ring-yellow-300' : 'ring-1 ring-black/50'}`}>
                          <span className={`flex h-9 min-w-9 items-center justify-center rounded-full border-2 px-2 text-xs font-black shadow ${markerClasses(point.status)}`}>
                            {point.participants.length || '!'}
                          </span>
                          <span className="hidden max-w-[230px] sm:block">
                            <span className="block truncate text-xs font-bold text-white">{point.siteName}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-zinc-200">{markerWorkerLine(point)}</span>
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-xl border border-white/20 bg-black/80 px-3 py-2 text-[11px] text-zinc-200 shadow-lg">
                  Число в маркере — количество работников на объекте. Нажмите маркер для подробностей.
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[460px] items-center justify-center p-8 text-center text-sm text-zinc-500">У объектов в выбранном периоде нет корректных координат.</div>
            )}
          </div>
        </section>

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

          <section className="rounded-3xl border border-yellow-400/15 bg-black/30">
            {selected ? <div className="grid gap-4 p-5 lg:grid-cols-2"><div><div className="text-lg font-semibold">{selected.site?.name || 'Объект не указан'}</div><div className="mt-1 text-sm text-zinc-400">{selected.site?.address || 'Адрес не указан'}</div><div className="mt-3 text-sm">План: {formatTime(selected.scheduled_time)}–{formatTime(selected.scheduled_end_time)}</div><div className="mt-1 text-sm">Радиус: {selected.site?.radius ?? '—'} м</div></div><div className="space-y-2">{selected.participants.map((participant) => <div key={participant.worker_id} className="rounded-2xl border border-zinc-800 bg-black/30 p-3"><div className="flex items-center justify-between gap-2"><span className="font-medium">{participant.worker_name}</span><span className={`rounded-full border px-2 py-1 text-[11px] ${statusClasses(participant.status)}`}>{statusLabel(participant.status)}</span></div><div className="mt-2 text-xs text-zinc-400">Старт: {formatDateTime(participant.started_at)} · Финиш: {formatDateTime(participant.stopped_at)}</div></div>)}{!selected.participants.length ? <div className="text-sm text-zinc-500">Работники не назначены.</div> : null}</div></div> : <div className="p-8 text-center text-sm text-zinc-500">Выберите объект или смену.</div>}
          </section>
        </div>

        <div className="mt-4 text-right text-xs text-zinc-500">Автообновление раз в минуту{generatedAt ? ` · данные: ${formatDateTime(generatedAt)}` : ''}</div>
      </div>
    </main>
  )
}
