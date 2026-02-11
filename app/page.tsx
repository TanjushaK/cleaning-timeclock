'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Profile = {
  id: string
  role: 'admin' | 'worker'
  full_name: string | null
  phone: string | null
  active: boolean | null
  created_at: string | null
}

type Site = {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  radius_m: number | null
  notes: string | null
}

type TimeLog = {
  job_id: string
  started_at: string | null
  ended_at: string | null
  start_lat: number | null
  start_lng: number | null
  start_accuracy_m: number | null
  start_distance_m: number | null
  end_lat: number | null
  end_lng: number | null
  end_accuracy_m: number | null
  end_distance_m: number | null
}

type Job = {
  id: string
  worker_id: string | null
  site_id: string | null
  job_date: string
  scheduled_time: string | null
  status: 'planned' | 'in_progress' | 'done'
  site?: Site | null
  time_logs?: TimeLog[] | null
}

type Filter = 'all' | 'planned' | 'in_progress' | 'done'

type GeoState = {
  ok: boolean
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  distance_m: number | null
  reason: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatDMY(input: string | Date | null | undefined) {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`
}

function formatDMYHM(input: string | Date | null | undefined) {
  if (!input) return '—'
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`
}

function todayISODate() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function safeNum(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function statusLabel(s: Job['status']) {
  if (s === 'planned') return 'Planned'
  if (s === 'in_progress') return 'In progress'
  return 'Done'
}

function statusBadgeClass(s: Job['status']) {
  if (s === 'planned') return 'badge badgePlanned'
  if (s === 'in_progress') return 'badge badgeProgress'
  return 'badge badgeDone'
}

export default function Page() {
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)

  const [userEmail, setUserEmail] = useState('')
  const [loginMsg, setLoginMsg] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [geo, setGeo] = useState<GeoState>({
    ok: false,
    lat: null,
    lng: null,
    accuracy_m: null,
    distance_m: null,
    reason: 'GPS ещё не запрашивался',
  })

  const refreshLock = useRef(false)

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedId) ?? null, [jobs, selectedId])

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs
    return jobs.filter((j) => j.status === filter)
  }, [jobs, filter])

  const kpis = useMemo(() => {
    const total = jobs.length
    const planned = jobs.filter((j) => j.status === 'planned').length
    const prog = jobs.filter((j) => j.status === 'in_progress').length
    const done = jobs.filter((j) => j.status === 'done').length
    return { total, planned, prog, done }
  }, [jobs])

  function getPrimaryLog(job: Job | null): TimeLog | null {
    if (!job?.time_logs || job.time_logs.length === 0) return null
    return job.time_logs[0] ?? null
  }

  async function loadProfileAndJobs() {
    if (refreshLock.current) return
    refreshLock.current = true
    setToast(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      const user = authData.user
      if (!user) {
        setProfile(null)
        setJobs([])
        setSelectedId(null)
        return
      }

      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone, active, created_at')
        .eq('id', user.id)
        .single()
      if (pErr) throw pErr
      setProfile(p as Profile)

      const d = todayISODate()

      const { data: j, error: jErr } = await supabase
        .from('jobs')
        .select(
          `
          id,
          worker_id,
          site_id,
          job_date,
          scheduled_time,
          status,
          sites:site_id (
            id, name, address, lat, lng, radius_m, notes
          ),
          time_logs:time_logs (
            job_id,
            started_at,
            ended_at,
            start_lat,
            start_lng,
            start_accuracy_m,
            start_distance_m,
            end_lat,
            end_lng,
            end_accuracy_m,
            end_distance_m
          )
        `
        )
        .eq('worker_id', user.id)
        .eq('job_date', d)
        .order('scheduled_time', { ascending: true })

      if (jErr) throw jErr

      const mapped: Job[] =
        (j as any[])?.map((row) => {
          const site: Site | null = row.sites
            ? {
                id: row.sites.id,
                name: row.sites.name,
                address: row.sites.address ?? null,
                lat: safeNum(row.sites.lat),
                lng: safeNum(row.sites.lng),
                radius_m: safeNum(row.sites.radius_m),
                notes: row.sites.notes ?? null,
              }
            : null

          const logsRaw = Array.isArray(row.time_logs) ? row.time_logs : []
          const logs: TimeLog[] = logsRaw.map((l: any) => ({
            job_id: l.job_id,
            started_at: l.started_at ?? null,
            ended_at: l.ended_at ?? null,
            start_lat: safeNum(l.start_lat),
            start_lng: safeNum(l.start_lng),
            start_accuracy_m: safeNum(l.start_accuracy_m),
            start_distance_m: safeNum(l.start_distance_m),
            end_lat: safeNum(l.end_lat),
            end_lng: safeNum(l.end_lng),
            end_accuracy_m: safeNum(l.end_accuracy_m),
            end_distance_m: safeNum(l.end_distance_m),
          }))

          return {
            id: row.id,
            worker_id: row.worker_id ?? null,
            site_id: row.site_id ?? null,
            job_date: row.job_date,
            scheduled_time: row.scheduled_time ?? null,
            status: row.status,
            site,
            time_logs: logs,
          } as Job
        }) ?? []

      setJobs(mapped)

      if (!selectedId && mapped.length > 0) setSelectedId(mapped[0].id)
      if (selectedId && !mapped.some((x) => x.id === selectedId)) setSelectedId(mapped[0]?.id ?? null)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка загрузки данных' })
    } finally {
      refreshLock.current = false
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      await loadProfileAndJobs()
      if (mounted) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      setLoading(true)
      await loadProfileAndJobs()
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function requestGPSAndCompute(job: Job | null): Promise<GeoState> {
    const site = job?.site ?? null

    if (!job) {
      return { ok: false, lat: null, lng: null, accuracy_m: null, distance_m: null, reason: 'Сначала выбери задачу' }
    }

    if (site?.lat == null || site?.lng == null) {
      return {
        ok: false,
        lat: null,
        lng: null,
        accuracy_m: null,
        distance_m: null,
        reason: 'На объекте нет координат (lat/lng). START/STOP запрещён.',
      }
    }

    const radius = site.radius_m ?? 0
    if (!radius || radius <= 0) {
      return { ok: false, lat: null, lng: null, accuracy_m: null, distance_m: null, reason: 'У объекта не задан радиус. START/STOP запрещён.' }
    }

    if (!navigator.geolocation) {
      return { ok: false, lat: null, lng: null, accuracy_m: null, distance_m: null, reason: 'Геолокация в браузере недоступна' }
    }

    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      })
    })

    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    const acc = pos.coords.accuracy
    const dist = haversineMeters(lat, lng, site.lat, site.lng)

    const accOk = acc <= 80
    const distOk = dist <= radius

    let reason: string | null = null
    if (!accOk) reason = `Точность GPS слабая: ${Math.round(acc)}м (нужно ≤ 80м)`
    if (accOk && !distOk) reason = `Ты вне радиуса: ${Math.round(dist)}м (лимит ${Math.round(radius)}м)`
    if (accOk && distOk) reason = 'GPS ок: можно работать'

    return { ok: accOk && distOk, lat, lng, accuracy_m: acc, distance_m: dist, reason }
  }

  function canStart(job: Job | null, g: GeoState) {
    const log = getPrimaryLog(job)
    const site = job?.site ?? null
    if (!job) return { ok: false, why: 'Нет задачи' }
    if (job.status !== 'planned') return { ok: false, why: 'START доступен только для Planned' }
    if (log?.started_at) return { ok: false, why: 'START уже сделан' }
    if (site?.lat == null || site?.lng == null) return { ok: false, why: 'Нет координат у объекта' }
    if (!g.ok) return { ok: false, why: g.reason ?? 'GPS не прошёл проверку' }
    return { ok: true, why: null as any }
  }

  function canStop(job: Job | null, g: GeoState) {
    const log = getPrimaryLog(job)
    const site = job?.site ?? null
    if (!job) return { ok: false, why: 'Нет задачи' }
    if (!log?.started_at) return { ok: false, why: 'Сначала START' }
    if (log?.ended_at) return { ok: false, why: 'STOP уже сделан' }
    if (site?.lat == null || site?.lng == null) return { ok: false, why: 'Нет координат у объекта' }
    if (!g.ok) return { ok: false, why: g.reason ?? 'GPS не прошёл проверку' }
    return { ok: true, why: null as any }
  }

  async function doRefresh() {
    setToast({ kind: 'ok', text: 'Обновляю данные…' })
    await loadProfileAndJobs()
    setToast({ kind: 'ok', text: 'Данные обновлены' })
    setTimeout(() => setToast(null), 1200)
  }

  async function doLogout() {
    setAuthLoading(true)
    try {
      await supabase.auth.signOut()
      setProfile(null)
      setJobs([])
      setSelectedId(null)
      setGeo({ ok: false, lat: null, lng: null, accuracy_m: null, distance_m: null, reason: 'GPS ещё не запрашивался' })
    } finally {
      setAuthLoading(false)
    }
  }

  async function doLoginOtp() {
    const email = userEmail.trim()
    if (!email) {
      setLoginMsg('Введи email')
      return
    }
    setAuthLoading(true)
    setLoginMsg(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
      })
      if (error) throw error
      setLoginMsg('Ссылка для входа отправлена на email. Проверь почту.')
    } catch (e: any) {
      setLoginMsg(e?.message ? String(e.message) : 'Ошибка входа')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleGPS() {
    setToast(null)
    try {
      const g = await requestGPSAndCompute(selectedJob)
      setGeo(g)
      setToast({ kind: g.ok ? 'ok' : 'err', text: g.reason ?? (g.ok ? 'GPS ок' : 'GPS ошибка') })
      if (g.ok) setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setGeo({ ok: false, lat: null, lng: null, accuracy_m: null, distance_m: null, reason: e?.message ? String(e.message) : 'Ошибка GPS' })
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка GPS' })
    }
  }

  async function doStart() {
    if (!selectedJob) return
    setToast(null)

    const g = await requestGPSAndCompute(selectedJob)
    setGeo(g)

    const check = canStart(selectedJob, g)
    if (!check.ok) {
      setToast({ kind: 'err', text: check.why })
      return
    }

    try {
      const nowIso = new Date().toISOString()

      const { error: insErr } = await supabase.from('time_logs').insert({
        job_id: selectedJob.id,
        started_at: nowIso,
        start_lat: g.lat,
        start_lng: g.lng,
        start_accuracy_m: g.accuracy_m,
        start_distance_m: g.distance_m,
      })
      if (insErr) throw insErr

      const { error: upErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', selectedJob.id)
      if (upErr) throw upErr

      setToast({ kind: 'ok', text: 'START зафиксирован' })
      await loadProfileAndJobs()
      setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка START' })
    }
  }

  async function doStop() {
    if (!selectedJob) return
    setToast(null)

    const log = getPrimaryLog(selectedJob)
    if (!log?.started_at) {
      setToast({ kind: 'err', text: 'Сначала START' })
      return
    }

    const g = await requestGPSAndCompute(selectedJob)
    setGeo(g)

    const check = canStop(selectedJob, g)
    if (!check.ok) {
      setToast({ kind: 'err', text: check.why })
      return
    }

    try {
      const nowIso = new Date().toISOString()

      const { error: upLogErr } = await supabase
        .from('time_logs')
        .update({
          ended_at: nowIso,
          end_lat: g.lat,
          end_lng: g.lng,
          end_accuracy_m: g.accuracy_m,
          end_distance_m: g.distance_m,
        })
        .eq('job_id', selectedJob.id)
      if (upLogErr) throw upLogErr

      const { error: upJobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', selectedJob.id)
      if (upJobErr) throw upJobErr

      setToast({ kind: 'ok', text: 'STOP зафиксирован' })
      await loadProfileAndJobs()
      setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка STOP' })
    }
  }

  const primaryLog = useMemo(() => getPrimaryLog(selectedJob), [selectedJob])
  const startState = useMemo(() => canStart(selectedJob, geo), [selectedJob, geo])
  const stopState = useMemo(() => canStop(selectedJob, geo), [selectedJob, geo])

  if (loading) {
    return (
      <div className="container">
        <div className="shell">
          <div className="header">
            <div className="headerRow">
              <div className="brand">
                <img className="brandLogo" src="/tanija-logo.png" alt="Tanija" />
                <div className="brandText">
                  <div className="brandTitle">TANIJA</div>
                  <div className="brandSub">Cleaning Timeclock</div>
                </div>
              </div>
              <div className="headerActions">
                <button className="btn btnGhost" disabled>Загрузка…</button>
              </div>
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div className="card">
            <div className="watermark"><img src="/tanija-logo.png" alt="" /></div>
            <div className="cardInner">
              <div className="cardTitle">Делаю luxury…</div>
              <div className="small">Тёмный+золото, watermark, микроанимации. Всё как ты хотел.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container">
        <div className="shell">
          <div className="header">
            <div className="headerRow">
              <div className="brand">
                <img className="brandLogo" src="/tanija-logo.png" alt="Tanija" />
                <div className="brandText">
                  <div className="brandTitle">TANIJA</div>
                  <div className="brandSub">Secure Access</div>
                </div>
              </div>
              <div className="headerActions">
                <span className="badge"><span className="badgeDot" /><span>Supabase Auth</span></span>
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="card">
              <div className="watermark"><img src="/tanija-logo.png" alt="" /></div>
              <div className="cardInner">
                <div className="cardTitleRow">
                  <div className="cardTitle">Вход</div>
                  <div className="cardHint">Email magic link</div>
                </div>

                <div className="row">
                  <div className="col">
                    <div className="small" style={{ marginBottom: 8 }}>Email</div>
                    <input
                      className="input"
                      placeholder="name@company.com"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                    />
                    <div className="small" style={{ marginTop: 10 }}>Открыл письмо — ты внутри.</div>
                  </div>
                </div>

                <div className="hr" />

                <div className="row">
                  <button className="btn btnGold" onClick={doLoginOtp} disabled={authLoading}>
                    {authLoading ? 'Отправляю…' : 'Отправить ссылку'}
                  </button>
                </div>

                {loginMsg && <div className="sep" />}
                {loginMsg && (
                  <div className={`toast ${loginMsg.toLowerCase().includes('ошибка') ? 'toastErr' : ''}`}>
                    <div className="small">{loginMsg}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="cardInner">
                <div className="cardTitleRow">
                  <div className="cardTitle">Правила</div>
                  <div className="cardHint">GPS governance</div>
                </div>
                <div className="small">
                  <div>• Форматы: <b>ДД-ММ-ГГГГ</b> и <b>ДД-ММ-ГГГГ ЧЧ:ММ</b></div>
                  <div style={{ marginTop: 10 }}>• START/STOP: accuracy ≤ 80м и в радиусе объекта</div>
                  <div style={{ marginTop: 10 }}>• Если у site нет lat/lng — START/STOP заблокирован</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="header">
          <div className="headerRow">
            <div className="brand">
              <img className="brandLogo" src="/tanija-logo.png" alt="Tanija" />
              <div className="brandText">
                <div className="brandTitle">TANIJA</div>
                <div className="brandSub">{profile.full_name ?? 'Worker'} · {formatDMY(new Date())}</div>
              </div>
            </div>

            <div className="headerActions">
              {profile.role === 'admin' && (
                <a className="btn btnGold" href="/admin">Admin</a>
              )}
              <button className="btn btnGhost" onClick={doRefresh} disabled={authLoading}>Обновить</button>
              <button className="btn btnDanger" onClick={doLogout} disabled={authLoading}>Выйти</button>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="watermark"><img src="/tanija-logo.png" alt="" /></div>
            <div className="cardInner">
              <div className="cardTitleRow">
                <div className="cardTitle">Jobs на сегодня</div>
                <div className="cardHint">{formatDMY(`${todayISODate()}T00:00:00`)}</div>
              </div>

              <div className="pillBar">
                <div className={`pill ${filter === 'all' ? 'pillActive' : ''}`} onClick={() => setFilter('all')}>All</div>
                <div className={`pill ${filter === 'planned' ? 'pillActive' : ''}`} onClick={() => setFilter('planned')}>Planned</div>
                <div className={`pill ${filter === 'in_progress' ? 'pillActive' : ''}`} onClick={() => setFilter('in_progress')}>In progress</div>
                <div className={`pill ${filter === 'done' ? 'pillActive' : ''}`} onClick={() => setFilter('done')}>Done</div>
              </div>

              <div className="kpiRow">
                <div className="kpi"><div className="kpiLabel">Total</div><div className="kpiValue">{kpis.total}</div></div>
                <div className="kpi"><div className="kpiLabel">Planned</div><div className="kpiValue">{kpis.planned}</div></div>
                <div className="kpi"><div className="kpiLabel">In progress</div><div className="kpiValue">{kpis.prog}</div></div>
                <div className="kpi"><div className="kpiLabel">Done</div><div className="kpiValue">{kpis.done}</div></div>
              </div>

              <div className="list">
                {filteredJobs.length === 0 ? (
                  <div className="toast"><div className="small">На сегодня задач нет.</div></div>
                ) : (
                  filteredJobs.map((j) => {
                    const active = j.id === selectedId
                    const site = j.site ?? null
                    return (
                      <div key={j.id} className={`item ${active ? 'itemActive' : ''}`} onClick={() => setSelectedId(j.id)}>
                        <div className="itemTop">
                          <div>
                            <div className="itemTitle">{site?.name ?? 'Объект не найден'}</div>
                            <div className="itemSub">
                              {site?.address ?? '—'} <br />
                              Дата: {formatDMY(`${j.job_date}T00:00:00`)} · Время: {j.scheduled_time ?? '—'}
                            </div>
                          </div>

                          <span className={statusBadgeClass(j.status)}>
                            <span className="badgeDot" />
                            <span>{statusLabel(j.status)}</span>
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardInner">
              <div className="cardTitleRow">
                <div className="cardTitle">Детали</div>
                <div className="cardHint">GPS контроль</div>
              </div>

              {!selectedJob ? (
                <div className="toast"><div className="small">Выбери задачу слева.</div></div>
              ) : (
                <>
                  <div className="row">
                    <div className="col">
                      <div className="small">Объект</div>
                      <div style={{ fontWeight: 900, marginTop: 6 }}>{selectedJob.site?.name ?? '—'}</div>
                      <div className="small" style={{ marginTop: 6 }}>{selectedJob.site?.address ?? '—'}</div>
                    </div>
                  </div>

                  <div className="sep" />

                  <div className="row">
                    <div className="col">
                      <span className={statusBadgeClass(selectedJob.status)}>
                        <span className="badgeDot" />
                        <span>{statusLabel(selectedJob.status)}</span>
                      </span>
                      <div className="small" style={{ marginTop: 10 }}>
                        Дата: {formatDMY(`${selectedJob.job_date}T00:00:00`)} · Время: {selectedJob.scheduled_time ?? '—'}
                      </div>
                    </div>
                  </div>

                  <div className="sep" />

                  <div className="row">
                    <div className="col">
                      <div className="small">START</div>
                      <div style={{ fontWeight: 850, marginTop: 6 }}>{formatDMYHM(primaryLog?.started_at)}</div>
                    </div>
                    <div className="col">
                      <div className="small">STOP</div>
                      <div style={{ fontWeight: 850, marginTop: 6 }}>{formatDMYHM(primaryLog?.ended_at)}</div>
                    </div>
                  </div>

                  <div className="sep" />

                  <div className="row">
                    <button className="btn" onClick={handleGPS}>Проверить GPS</button>
                  </div>

                  <div className="kpiRow">
                    <div className="kpi">
                      <div className="kpiLabel">Accuracy</div>
                      <div className="kpiValue">{geo.accuracy_m == null ? '—' : `${Math.round(geo.accuracy_m)} м`}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpiLabel">Distance</div>
                      <div className="kpiValue">{geo.distance_m == null ? '—' : `${Math.round(geo.distance_m)} м`}</div>
                    </div>
                  </div>

                  <div className="small" style={{ marginTop: 10 }}>{geo.reason ?? '—'}</div>

                  <div className="sep" />

                  <div className="row">
                    <button className="btn btnGold" onClick={doStart} disabled={!startState.ok}>START</button>
                    <button className="btn btnDanger" onClick={doStop} disabled={!stopState.ok}>STOP</button>
                  </div>

                  <div className="small" style={{ marginTop: 10 }}>
                    {!startState.ok && !primaryLog?.started_at ? `START: ${startState.why}` : null}
                    {!stopState.ok && primaryLog?.started_at && !primaryLog?.ended_at ? `STOP: ${stopState.why}` : null}
                  </div>

                  <div className="sep" />

                  <div className="row">
                    <div className="col">
                      <div className="small">Координаты объекта</div>
                      <div className="small" style={{ marginTop: 6 }}>
                        lat: {selectedJob.site?.lat ?? '—'} · lng: {selectedJob.site?.lng ?? '—'} · radius: {selectedJob.site?.radius_m ?? '—'}м
                      </div>
                    </div>
                  </div>

                  {(selectedJob.site?.lat == null || selectedJob.site?.lng == null) && (
                    <>
                      <div className="sep" />
                      <div className="toast toastErr">
                        <div className="small">У объекта нет lat/lng — START/STOP заблокирован.</div>
                      </div>
                    </>
                  )}
                </>
              )}

              {toast && (
                <>
                  <div className="sep" />
                  <div className={`toast ${toast.kind === 'err' ? 'toastErr' : 'toastOk'}`}>
                    <div className="small">{toast.text}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: 18 }} />
        <div className="small" style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
          Tanija · luxury control, zero excuses.
        </div>
      </div>
    </div>
  )
}
