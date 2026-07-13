/* eslint-disable @next/next/no-img-element */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { clearClientAuthState, getAccessToken } from '@/lib/auth-fetch'

type ParticipantStatus = 'scheduled' | 'working' | 'completed' | 'late' | 'missing' | 'cancelled'
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

type MapTile = {
  key: string
  url: string
  left: number
  top: number
}

type PositionedPoint = MapPoint & {
  left: number
  top: number
  anchorLeft: number
  anchorTop: number
}

type MapLayout = {
  tiles: MapTile[]
  points: PositionedPoint[]
  zoom: number
}

const TILE_SIZE = 256
const MIN_ZOOM = 4
const MAX_ZOOM = 18
const MAX_MERCATOR_LATITUDE = 85.05112878

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
    cancelled: 'Отменено',
    unassigned: 'Без работника',
  } as Record<SummaryStatus, string>)[status]
}

function statusRank(status: SummaryStatus) {
  return ({
    cancelled: 0,
    completed: 1,
    scheduled: 2,
    working: 3,
    late: 4,
    unassigned: 5,
    missing: 6,
  } as Record<SummaryStatus, number>)[status]
}

function statusClasses(status: SummaryStatus) {
  if (status === 'working') return 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
  if (status === 'completed') return 'border-sky-400/40 bg-sky-500/20 text-sky-100'
  if (status === 'late') return 'border-amber-400/50 bg-amber-500/20 text-amber-100'
  if (status === 'missing') return 'border-rose-400/50 bg-rose-500/20 text-rose-100'
  if (status === 'unassigned') return 'border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100'
  if (status === 'cancelled') return 'border-zinc-500/40 bg-zinc-700/30 text-zinc-300'
  return 'border-zinc-400/30 bg-zinc-500/15 text-zinc-100'
}

function markerClasses(status: SummaryStatus) {
  if (status === 'working') return 'border-emerald-200 bg-emerald-500 text-white'
  if (status === 'completed') return 'border-sky-200 bg-sky-500 text-white'
  if (status === 'late') return 'border-amber-100 bg-amber-500 text-black'
  if (status === 'missing') return 'border-rose-100 bg-rose-600 text-white'
  if (status === 'unassigned') return 'border-fuchsia-100 bg-fuchsia-600 text-white'
  if (status === 'cancelled') return 'border-zinc-300 bg-zinc-600 text-white'
  return 'border-zinc-100 bg-zinc-700 text-white'
}

function validCoordinate(value: number | null, min: number, max: number): value is number {
  return value != null && Number.isFinite(value) && value >= min && value <= max
}

function markerWorkerLine(point: MapPoint) {
  const names = point.participants.map((participant) => participant.worker_name).filter(Boolean)
  if (!names.length) return 'Работник не назначен'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

function worldPixel(lat: number, lng: number, zoom: number) {
  const safeLat = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat))
  const scale = TILE_SIZE * 2 ** zoom
  const sin = Math.sin((safeLat * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function fitZoom(points: MapPoint[], width: number, height: number, padding: number) {
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const pixels = points.map((point) => worldPixel(point.lat, point.lng, zoom))
    const xs = pixels.map((point) => point.x)
    const ys = pixels.map((point) => point.y)
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    if (spanX <= Math.max(1, width - padding * 2) && spanY <= Math.max(1, height - padding * 2)) {
      return zoom
    }
  }
  return MIN_ZOOM
}

function spreadClosePoints(
  points: Array<MapPoint & { left: number; top: number }>,
  width: number,
  height: number,
): PositionedPoint[] {
  const minimumDistance = width < 640 ? 44 : 50
  const edge = width < 640 ? 22 : 26
  const placed: PositionedPoint[] = []

  for (const point of points) {
    const anchorLeft = point.left
    const anchorTop = point.top
    let left = anchorLeft
    let top = anchorTop

    const overlaps = (candidateLeft: number, candidateTop: number) =>
      placed.some((current) => Math.hypot(current.left - candidateLeft, current.top - candidateTop) < minimumDistance)

    if (overlaps(left, top)) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const ring = 1 + Math.floor(attempt / 8)
        const radius = Math.min(72, minimumDistance * 0.72 * ring)
        const angle = (attempt * 137.508 * Math.PI) / 180
        const candidateLeft = Math.max(edge, Math.min(width - edge, anchorLeft + Math.cos(angle) * radius))
        const candidateTop = Math.max(edge, Math.min(height - edge, anchorTop + Math.sin(angle) * radius))
        if (!overlaps(candidateLeft, candidateTop)) {
          left = candidateLeft
          top = candidateTop
          break
        }
      }
    }

    placed.push({ ...point, left, top, anchorLeft, anchorTop })
  }

  return placed
}

function buildMapLayout(points: MapPoint[], width: number, height: number, zoomOffset: number): MapLayout | null {
  if (!points.length || width <= 0 || height <= 0) return null

  const padding = width < 640 ? 42 : 100
  const fittedZoom = fitZoom(points, width, height, padding)
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fittedZoom + zoomOffset))
  const projected = points.map((point) => ({ point, ...worldPixel(point.lat, point.lng, zoom) }))
  const xs = projected.map((point) => point.x)
  const ys = projected.map((point) => point.y)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
  const originX = centerX - width / 2
  const originY = centerY - height / 2
  const tileCount = 2 ** zoom
  const firstTileX = Math.floor(originX / TILE_SIZE)
  const lastTileX = Math.floor((originX + width) / TILE_SIZE)
  const firstTileY = Math.floor(originY / TILE_SIZE)
  const lastTileY = Math.floor((originY + height) / TILE_SIZE)
  const tiles: MapTile[] = []

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) continue
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount
      tiles.push({
        key: `${zoom}:${tileX}:${tileY}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
        left: tileX * TILE_SIZE - originX,
        top: tileY * TILE_SIZE - originY,
      })
    }
  }

  const screenPoints = projected.map(({ point, x, y }) => ({
    ...point,
    left: x - originX,
    top: y - originY,
  }))

  return {
    zoom,
    tiles,
    points: spreadClosePoints(screenPoints, width, height),
  }
}

function WorkforceOverviewMap({
  points,
  selectedSiteId,
  onChoose,
}: {
  points: MapPoint[]
  selectedSiteId: string | null
  onChoose: (point: MapPoint) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [zoomOffset, setZoomOffset] = useState(0)
  const [mobileDetailsSiteId, setMobileDetailsSiteId] = useState<string | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setZoomOffset(0)
    setMobileDetailsSiteId(null)
  }, [points])

  const layout = useMemo(
    () => buildMapLayout(points, viewport.width, viewport.height, zoomOffset),
    [points, viewport.height, viewport.width, zoomOffset],
  )
  const mobileDetailsPoint = points.find((point) => point.siteId === mobileDetailsSiteId) || null

  const choosePoint = (point: MapPoint) => {
    setMobileDetailsSiteId(point.siteId)
    onChoose(point)
  }

  return (
    <div ref={containerRef} className="relative h-[54vh] min-h-[420px] overflow-hidden bg-zinc-900 sm:h-[58vh] sm:min-h-[460px]">
      {layout ? (
        <>
          <div className="absolute inset-0 overflow-hidden bg-[#d8e5cf]">
            {layout.tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.url}
                alt=""
                draggable={false}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="pointer-events-none absolute h-64 w-64 max-w-none select-none"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
          </div>

          <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden="true">
            {layout.points.map((point) => {
              const moved = Math.hypot(point.left - point.anchorLeft, point.top - point.anchorTop) > 5
              return moved ? (
                <line
                  key={`line:${point.siteId}`}
                  x1={point.anchorLeft}
                  y1={point.anchorTop}
                  x2={point.left}
                  y2={point.top}
                  stroke="rgba(24,24,27,0.55)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              ) : null
            })}
          </svg>

          <div className="absolute inset-0 z-10">
            {layout.points.map((point) => {
              const selected = selectedSiteId === point.siteId
              return (
                <button
                  key={point.siteId}
                  type="button"
                  onClick={() => choosePoint(point)}
                  style={{ left: point.left, top: point.top }}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 text-left ${selected ? 'z-20' : 'z-10'}`}
                  aria-label={`${point.siteName}, ${point.address}`}
                  title={`${point.siteName}: ${point.address}`}
                >
                  <div className={`relative flex items-center rounded-full border bg-black/85 p-1 shadow-[0_6px_22px_rgba(0,0,0,0.65)] backdrop-blur transition group-hover:scale-105 ${selected ? 'ring-2 ring-yellow-300 sm:gap-2 sm:rounded-2xl sm:pr-3' : 'ring-1 ring-black/50'}`}>
                    <span className={`flex h-8 min-w-8 items-center justify-center rounded-full border-2 px-1.5 text-[10px] font-black shadow sm:h-9 sm:min-w-9 sm:px-2 sm:text-xs ${markerClasses(point.status)}`}>
                      {point.participants.length || '!'}
                    </span>
                    {selected ? (
                      <span className="hidden max-w-[230px] sm:block">
                        <span className="block truncate text-xs font-bold text-white">{point.siteName}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-zinc-200">{point.address}</span>
                      </span>
                    ) : (
                      <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-white/15 bg-black/90 px-2 py-1 text-center text-[10px] text-white shadow-lg group-hover:sm:block">
                        <span className="block font-semibold">{point.siteName}</span>
                        <span className="block truncate text-zinc-300">{point.address}</span>
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="absolute right-3 top-3 z-30 grid gap-1 rounded-xl border border-black/15 bg-white/90 p-1 shadow-lg">
            <button type="button" aria-label="Увеличить карту" onClick={() => setZoomOffset((value) => Math.min(3, value + 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-xl font-bold text-black hover:bg-zinc-200">+</button>
            <button type="button" aria-label="Уменьшить карту" onClick={() => setZoomOffset((value) => Math.max(-3, value - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-xl font-bold text-black hover:bg-zinc-200">−</button>
            <button type="button" aria-label="Показать все объекты" onClick={() => setZoomOffset(0)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-bold text-black hover:bg-zinc-200">Все</button>
          </div>

          {mobileDetailsPoint ? (
            <div className="absolute inset-x-2 bottom-2 z-30 rounded-xl border border-yellow-300/40 bg-black/94 px-3 py-2 text-left shadow-2xl backdrop-blur sm:hidden">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-xs font-bold text-white">{mobileDetailsPoint.siteName}</div>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${statusClasses(mobileDetailsPoint.status)}`}>{statusLabel(mobileDetailsPoint.status)}</span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-200">{mobileDetailsPoint.address}</div>
                </div>
                <button type="button" aria-label="Закрыть карточку объекта" onClick={() => setMobileDetailsSiteId(null)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm text-white">×</button>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-1 left-2 z-20 text-[9px] text-zinc-700 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] sm:text-[10px]">
            © OpenStreetMap contributors
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-zinc-500">У объектов в выбранном периоде нет корректных координат.</div>
      )}
    </div>
  )
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
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm" />
          <select value={status} onChange={(event) => setStatus(event.target.value as SummaryStatus | '')} className="rounded-xl border border-yellow-400/20 bg-black/40 px-3 py-2 text-sm">
            <option value="">Все статусы</option>
            {(['scheduled', 'working', 'completed', 'late', 'missing', 'cancelled', 'unassigned'] as SummaryStatus[]).map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
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
          <WorkforceOverviewMap points={mapPoints} selectedSiteId={selectedSiteId} onChoose={choosePoint} />
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
