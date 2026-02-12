'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Role = 'admin' | 'worker'

type WorkerRow = {
  id: string
  full_name: string | null
  phone: string | null
  role: Role
}

type SiteRow = {
  id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  radius: number | null
}

function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(' ')
}

function formatNum(n: number | null) {
  if (n == null) return '—'
  return String(Math.round(n * 1e6) / 1e6)
}

function osmEmbed(lat: number, lng: number) {
  const d = 0.003
  const left = lng - d
  const right = lng + d
  const top = lat + d
  const bottom = lat - d
  const marker = `${lat},${lng}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${marker}`
}

function osmOpen(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`
}

export default function AdminPage() {
  const [tab, setTab] = useState<'workers' | 'sites'>('workers')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [sites, setSites] = useState<SiteRow[]>([])

  // Workers form
  const [wEmail, setWEmail] = useState('')
  const [wName, setWName] = useState('')
  const [wPhone, setWPhone] = useState('')

  // Sites form
  const [sName, setSName] = useState('')
  const [sAddr, setSAddr] = useState('')
  const [sRadius, setSRadius] = useState('100')
  const [geoPreview, setGeoPreview] = useState<{
    display_name: string
    lat: number
    lng: number
  } | null>(null)

  function popToast(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 1600)
  }

  async function api<T = any>(url: string, opts?: RequestInit): Promise<T> {
    const r = await fetch(url, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        ...(opts?.headers || {}),
      },
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || `HTTP_${r.status}`)
    return j as T
  }

  async function loadWorkers() {
    setErr(null)
    setBusy(true)
    try {
      const j = await api<{ workers: WorkerRow[] }>('/api/admin/workers')
      setWorkers(j.workers || [])
    } catch (e: any) {
      setErr(e?.message || 'load_workers_error')
    } finally {
      setBusy(false)
    }
  }

  async function loadSites() {
    setErr(null)
    setBusy(true)
    try {
      const j = await api<{ sites: SiteRow[] }>('/api/admin/sites')
      setSites(j.sites || [])
    } catch (e: any) {
      setErr(e?.message || 'load_sites_error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    loadWorkers()
    loadSites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function inviteWorker() {
    setErr(null)
    setBusy(true)
    try {
      const email = wEmail.trim().toLowerCase()
      const full_name = wName.trim()
      const phone = wPhone.trim()

      if (!email) throw new Error('email_required')
      if (!email.includes('@')) throw new Error('email_invalid')
      if (!full_name) throw new Error('full_name_required')

      await api('/api/admin/workers/invite', {
        method: 'POST',
        body: JSON.stringify({ email, full_name, phone }),
      })

      popToast('Работник создан. Письмо отправлено.')
      setWEmail('')
      setWName('')
      setWPhone('')
      await loadWorkers()
    } catch (e: any) {
      setErr(e?.message || 'invite_error')
    } finally {
      setBusy(false)
    }
  }

  async function promoteToAdmin(id: string) {
    setErr(null)
    setBusy(true)
    try {
      await api(`/api/admin/workers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      })
      popToast('Роль обновлена: admin')
      await loadWorkers()
    } catch (e: any) {
      setErr(e?.message || 'promote_error')
    } finally {
      setBusy(false)
    }
  }

  async function createSite() {
    setErr(null)
    setBusy(true)
    try {
      const name = sName.trim()
      const address = sAddr.trim()
      const radius = Number(sRadius || '0')

      if (!name) throw new Error('name_required')
      if (!address) throw new Error('address_required')
      if (!Number.isFinite(radius) || radius <= 0) throw new Error('radius_invalid')

      const payload: any = {
        name,
        address,
        radius,
      }

      if (geoPreview) {
        payload.lat = geoPreview.lat
        payload.lng = geoPreview.lng
      }

      await api('/api/admin/sites', { method: 'POST', body: JSON.stringify(payload) })
      popToast('Объект создан')
      setSName('')
      setSAddr('')
      setSRadius('100')
      setGeoPreview(null)
      await loadSites()
    } catch (e: any) {
      setErr(e?.message || 'create_site_error')
    } finally {
      setBusy(false)
    }
  }

  async function checkAddress() {
    setErr(null)
    setBusy(true)
    try {
      const q = sAddr.trim()
      if (!q) throw new Error('address_required')

      const j = await api<{ ok: boolean; display_name?: string; lat?: number; lng?: number }>(
        '/api/geocode',
        { method: 'POST', body: JSON.stringify({ q }) }
      )

      if (!j?.ok || j.lat == null || j.lng == null) throw new Error('geocode_not_found')

      setGeoPreview({
        display_name: String(j.display_name || q),
        lat: Number(j.lat),
        lng: Number(j.lng),
      })
      popToast('Адрес найден')
    } catch (e: any) {
      setGeoPreview(null)
      setErr(e?.message || 'geocode_error')
    } finally {
      setBusy(false)
    }
  }

  const workersSorted = useMemo(() => {
    const arr = [...workers]
    arr.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    return arr
  }, [workers])

  const sitesSorted = useMemo(() => {
    const arr = [...sites]
    arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [sites])

  return (
    <div className="min-h-screen bg-[#07070b] text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/tanija-logo.png" alt="Tanija" className="h-11 w-11 rounded-2xl" />
            <div>
              <div className="text-2xl font-semibold tracking-tight text-amber-200">Tanija</div>
              <div className="text-sm text-zinc-500">Admin Panel</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 font-semibold text-zinc-200 transition hover:bg-black/40"
            >
              ← На главную
            </Link>

            <button
              onClick={() => {
                loadWorkers()
                loadSites()
              }}
              disabled={busy}
              className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
            >
              {busy ? '…' : 'Обновить'}
            </button>
          </div>
        </div>

        {toast ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {toast}
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => setTab('workers')}
            className={cls(
              'rounded-2xl border px-4 py-2 text-sm font-semibold transition',
              tab === 'workers'
                ? 'border-amber-300/30 bg-amber-300/10 text-amber-200'
                : 'border-zinc-800/80 bg-black/20 text-zinc-300 hover:bg-black/30'
            )}
          >
            Workers
          </button>
          <button
            onClick={() => setTab('sites')}
            className={cls(
              'rounded-2xl border px-4 py-2 text-sm font-semibold transition',
              tab === 'sites'
                ? 'border-amber-300/30 bg-amber-300/10 text-amber-200'
                : 'border-zinc-800/80 bg-black/20 text-zinc-300 hover:bg-black/30'
            )}
          >
            Objects
          </button>
        </div>

        {tab === 'workers' ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-8">
              <div className="text-xl font-semibold text-amber-200">Создать работника</div>
              <div className="mt-2 text-sm text-zinc-500">
                Работнику уйдёт письмо, он сам задаст пароль. Supabase доступ не нужен.
              </div>

              <div className="mt-6 space-y-3">
                <input
                  value={wEmail}
                  onChange={(e) => setWEmail(e.target.value)}
                  placeholder="Email работника"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                  autoComplete="email"
                />
                <input
                  value={wName}
                  onChange={(e) => setWName(e.target.value)}
                  placeholder="ФИО"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />
                <input
                  value={wPhone}
                  onChange={(e) => setWPhone(e.target.value)}
                  placeholder="Телефон (опционально)"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />

                <button
                  onClick={inviteWorker}
                  disabled={busy || !wEmail.trim() || !wName.trim()}
                  className="w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                >
                  {busy ? 'Создаю…' : 'Создать и отправить письмо'}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-8">
              <div className="text-xl font-semibold text-amber-200">Workers</div>
              <div className="mt-4 space-y-3">
                {workersSorted.length === 0 ? (
                  <div className="text-zinc-400">Пока пусто</div>
                ) : (
                  workersSorted.map((w) => (
                    <div key={w.id} className="rounded-3xl border border-zinc-800/80 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-zinc-100">{w.full_name || '—'}</div>
                          <div className="mt-1 text-sm text-zinc-400">{w.phone || '—'}</div>
                          <div className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                            {w.role}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {w.role !== 'admin' ? (
                            <button
                              onClick={() => promoteToAdmin(w.id)}
                              disabled={busy}
                              className="rounded-2xl border border-zinc-700/60 bg-black/30 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
                            >
                              Сделать админом
                            </button>
                          ) : (
                            <div className="text-xs text-zinc-600 text-right">admin</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 text-xs text-zinc-600">
                Если /admin не открывается: сначала войди на главной, потом открывай /admin.
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'sites' ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-8">
              <div className="text-xl font-semibold text-amber-200">Создать объект</div>
              <div className="mt-2 text-sm text-zinc-500">
                Сначала введи адрес → “Проверить адрес” → увидишь, куда попал геокодер → потом “Создать”.
              </div>

              <div className="mt-6 space-y-3">
                <input
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="Название"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />
                <input
                  value={sAddr}
                  onChange={(e) => setSAddr(e.target.value)}
                  placeholder="Адрес"
                  className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                />
                <div className="flex gap-2">
                  <input
                    value={sRadius}
                    onChange={(e) => setSRadius(e.target.value)}
                    placeholder="Радиус (м)"
                    className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 outline-none transition focus:border-amber-300/60"
                  />
                  <button
                    onClick={checkAddress}
                    disabled={busy || !sAddr.trim()}
                    className="shrink-0 rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-black/40 disabled:opacity-50"
                  >
                    {busy ? '…' : 'Проверить адрес'}
                  </button>
                </div>

                {geoPreview ? (
                  <div className="rounded-3xl border border-amber-300/15 bg-amber-300/5 p-4">
                    <div className="text-sm font-semibold text-amber-200">Найдено</div>
                    <div className="mt-1 text-sm text-zinc-200">{geoPreview.display_name}</div>
                    <div className="mt-2 text-xs text-zinc-400">
                      lat: {formatNum(geoPreview.lat)} • lng: {formatNum(geoPreview.lng)}
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800/80 bg-black/20">
                      <div className="h-[320px] w-full">
                        <iframe
                          title="map"
                          src={osmEmbed(geoPreview.lat, geoPreview.lng)}
                          className="h-full w-full"
                          loading="lazy"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex justify-between gap-2">
                      <a
                        href={osmOpen(geoPreview.lat, geoPreview.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40"
                      >
                        Открыть в карте
                      </a>

                      <button
                        onClick={() => setGeoPreview(null)}
                        className="rounded-2xl border border-zinc-700/60 bg-black/30 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-black/40"
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600">Карта появится после “Проверить адрес”.</div>
                )}

                <button
                  onClick={createSite}
                  disabled={busy || !sName.trim() || !sAddr.trim()}
                  className="w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
                >
                  {busy ? 'Создаю…' : 'Создать объект'}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-400/15 bg-[#0b0b12] p-8">
              <div className="text-xl font-semibold text-amber-200">Objects</div>

              <div className="mt-4 space-y-3">
                {sitesSorted.length === 0 ? (
                  <div className="text-zinc-400">Пока пусто</div>
                ) : (
                  sitesSorted.map((s) => (
                    <div key={s.id} className="rounded-3xl border border-zinc-800/80 bg-black/20 p-4">
                      <div className="font-semibold text-zinc-100">{s.name}</div>
                      <div className="mt-1 text-sm text-zinc-400">{s.address}</div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {s.lat == null || s.lng == null ? (
                          <span className="inline-flex rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                            нет lat/lng
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                            lat/lng OK
                          </span>
                        )}

                        <span className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/5 px-3 py-1 text-xs font-semibold text-amber-200">
                          радиус {s.radius ?? 0}м
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 text-xs text-zinc-600">
                START у работника разрешён только если у объекта есть lat/lng + GPS ≤ 80м + дистанция ≤ радиус.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
