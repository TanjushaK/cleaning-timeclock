'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { clearClientAuthState, getAccessToken } from '@/lib/auth-fetch'

type Site = {
  id: string
  name?: string | null
  address?: string | null
  street?: string | null
  house_number?: string | null
  postal_code?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
  radius?: number | null
  archived_at?: string | null
  coordinates_source?: string | null
  coordinates_verified_at?: string | null
}

type AuditStatus = 'verified' | 'legacy' | 'missing'

function statusOf(site: Site): AuditStatus {
  const hasCoordinates = Number.isFinite(site.lat) && Number.isFinite(site.lng)
  if (!hasCoordinates) return 'missing'
  return site.coordinates_source === 'geocoder_confirmed' || site.coordinates_source === 'manual_pin'
    ? 'verified'
    : 'legacy'
}

function statusLabel(status: AuditStatus) {
  if (status === 'verified') return 'Подтверждено'
  if (status === 'legacy') return 'Старые координаты'
  return 'Координат нет'
}

function statusClass(status: AuditStatus) {
  if (status === 'verified') return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
  if (status === 'legacy') return 'border-amber-400/40 bg-amber-500/15 text-amber-100'
  return 'border-rose-400/40 bg-rose-500/15 text-rose-100'
}

function coordKey(site: Site) {
  if (!Number.isFinite(site.lat) || !Number.isFinite(site.lng)) return ''
  return `${Number(site.lat).toFixed(6)},${Number(site.lng).toFixed(6)}`
}

export default function SiteCoordinateAuditPage() {
  const router = useRouter()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | AuditStatus>('all')

  const load = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/admin')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/sites/list?include_archived=1', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (response.status === 401) {
        clearClientAuthState()
        router.replace('/admin')
        return
      }
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
      setSites(Array.isArray(body?.sites) ? body.sites : [])
    } catch (caught) {
      setError(String((caught as Error)?.message || caught))
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { void load() }, [load])

  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>()
    for (const site of sites) {
      const key = coordKey(site)
      if (key) counts.set(key, (counts.get(key) || 0) + 1)
    }
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key))
  }, [sites])

  const rows = useMemo(() => sites
    .map((site) => {
      const status = statusOf(site)
      const issues: string[] = []
      if (!site.house_number) issues.push('нет номера дома')
      if (!site.postal_code) issues.push('нет индекса')
      if (!site.city) issues.push('нет города')
      if (duplicateKeys.has(coordKey(site))) issues.push('дубль координат')
      if ((site.radius ?? 0) < 25 || (site.radius ?? 0) > 500) issues.push('подозрительный радиус')
      return { site, status, issues }
    })
    .filter((row) => filter === 'all' || row.status === filter)
    .sort((a, b) => (a.site.name || '').localeCompare(b.site.name || '')), [sites, duplicateKeys, filter])

  const counts = useMemo(() => ({
    verified: sites.filter((site) => statusOf(site) === 'verified').length,
    legacy: sites.filter((site) => statusOf(site) === 'legacy').length,
    missing: sites.filter((site) => statusOf(site) === 'missing').length,
  }), [sites])

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Аудит координат объектов</h1>
            <p className="mt-1 text-sm text-zinc-400">Только просмотр. Ничего не изменяется автоматически.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className="rounded-xl border border-yellow-400/25 px-4 py-2 text-sm">Обновить</button>
            <button onClick={() => router.push('/admin?tab=sites')} className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-black">Объекты</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button onClick={() => setFilter('verified')} className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-left"><div className="text-sm text-emerald-100">Подтверждено</div><div className="mt-1 text-2xl font-bold">{counts.verified}</div></button>
          <button onClick={() => setFilter('legacy')} className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-left"><div className="text-sm text-amber-100">Старые координаты</div><div className="mt-1 text-2xl font-bold">{counts.legacy}</div></button>
          <button onClick={() => setFilter('missing')} className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-left"><div className="text-sm text-rose-100">Координат нет</div><div className="mt-1 text-2xl font-bold">{counts.missing}</div></button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(['all', 'verified', 'legacy', 'missing'] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`rounded-xl border px-3 py-2 text-sm ${filter === value ? 'border-yellow-300 bg-yellow-400/10' : 'border-zinc-700'}`}>{value === 'all' ? 'Все' : statusLabel(value)}</button>)}
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm">{error}</div> : null}
        {loading ? <div className="mt-6 text-sm text-zinc-400">Загрузка…</div> : null}

        <div className="mt-5 overflow-x-auto rounded-3xl border border-yellow-400/15 bg-black/25">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="border-b border-yellow-400/10 text-zinc-400"><tr><th className="p-3">Объект</th><th className="p-3">Адрес</th><th className="p-3">Координаты</th><th className="p-3">Радиус</th><th className="p-3">Источник</th><th className="p-3">Статус</th><th className="p-3">Замечания</th></tr></thead>
            <tbody>{rows.map(({ site, status, issues }) => <tr key={site.id} className="border-b border-zinc-800/70 last:border-b-0"><td className="p-3"><div className="font-semibold">{site.name || 'Без названия'}</div>{site.archived_at ? <div className="text-xs text-zinc-500">В архиве</div> : null}</td><td className="p-3"><div>{site.address || '—'}</div><div className="mt-1 text-xs text-zinc-500">{[site.postal_code, site.city].filter(Boolean).join(' ') || '—'}</div></td><td className="p-3 font-mono text-xs">{coordKey(site) || '—'}</td><td className="p-3">{site.radius ?? '—'} м</td><td className="p-3 text-xs">{site.coordinates_source || '—'}</td><td className="p-3"><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(status)}`}>{statusLabel(status)}</span></td><td className="p-3 text-xs text-zinc-300">{issues.join(', ') || '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
