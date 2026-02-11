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

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)

  const [userEmail, setUserEmail] = useState('')
  const [loginMsg, setLoginMsg] = useState<string | null>(null)

  const [me, setMe] = useState<Profile | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [workers, setWorkers] = useState<Profile[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [jobs, setJobs] = useState<Job[]>([])

  const [workerSearch, setWorkerSearch] = useState('')
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)

  const [dateISO, setDateISO] = useState(todayISODate())

  const [newJobSiteId, setNewJobSiteId] = useState<string>('')
  const [newJobTime, setNewJobTime] = useState<string>('09:00')

  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [siteLat, setSiteLat] = useState('')
  const [siteLng, setSiteLng] = useState('')
  const [siteRadius, setSiteRadius] = useState('80')

  const refreshLock = useRef(false)

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) ?? null,
    [workers, selectedWorkerId]
  )

  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase()
    if (!q) return workers
    return workers.filter((w) => (w.full_name ?? '').toLowerCase().includes(q) || (w.phone ?? '').toLowerCase().includes(q))
  }, [workers, workerSearch])

  const workerJobs = useMemo(() => {
    if (!selectedWorkerId) return []
    return jobs
      .filter((j) => j.worker_id === selectedWorkerId)
      .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))
  }, [jobs, selectedWorkerId])

  const kpis = useMemo(() => {
    const totalWorkers = workers.length
    const activeWorkers = workers.filter((w) => w.active).length
    const totalJobs = jobs.length
    const planned = jobs.filter((j) => j.status === 'planned').length
    const prog = jobs.filter((j) => j.status === 'in_progress').length
    const done = jobs.filter((j) => j.status === 'done').length
    const gpsMissingSites = sites.filter((s) => s.lat == null || s.lng == null).length
    return { totalWorkers, activeWorkers, totalJobs, planned, prog, done, gpsMissingSites }
  }, [workers, jobs, sites])

  async function loadAll() {
    if (refreshLock.current) return
    refreshLock.current = true
    setToast(null)

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr) throw authErr
      const user = authData.user
      if (!user) {
        setMe(null)
        setWorkers([])
        setSites([])
        setJobs([])
        setSelectedWorkerId(null)
        return
      }

      const { data: p, error: pErr } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone, active, created_at')
        .eq('id', user.id)
        .single()
      if (pErr) throw pErr
      setMe(p as Profile)

      const { data: ws, error: wsErr } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone, active, created_at')
        .eq('role', 'worker')
        .order('full_name', { ascending: true })
      if (wsErr) throw wsErr
      setWorkers(ws as Profile[])

      const { data: ss, error: ssErr } = await supabase
        .from('sites')
        .select('id, name, address, lat, lng, radius_m, notes')
        .order('name', { ascending: true })
      if (ssErr) throw ssErr

      const sitesMapped: Site[] =
        (ss as any[])?.map((s) => ({
          id: s.id,
          name: s.name,
          address: s.address ?? null,
          lat: safeNum(s.lat),
          lng: safeNum(s.lng),
          radius_m: safeNum(s.radius_m),
          notes: s.notes ?? null,
        })) ?? []
      setSites(sitesMapped)

      const { data: jj, error: jjErr } = await supabase
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
        .eq('job_date', dateISO)
        .order('scheduled_time', { ascending: true })
      if (jjErr) throw jjErr

      const mapped: Job[] =
        (jj as any[])?.map((row) => {
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

      if (!selectedWorkerId) {
        const first = (ws as Profile[])?.[0]?.id ?? null
        setSelectedWorkerId(first)
      } else {
        const exists = (ws as Profile[])?.some((w) => w.id === selectedWorkerId)
        if (!exists) setSelectedWorkerId((ws as Profile[])?.[0]?.id ?? null)
      }

      if (!newJobSiteId && sitesMapped.length > 0) setNewJobSiteId(sitesMapped[0].id)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка admin-загрузки' })
    } finally {
      refreshLock.current = false
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      setLoading(true)
      await loadAll()
      if (mounted) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      setLoading(true)
      await loadAll()
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO])

  async function doLogout() {
    setAuthLoading(true)
    try {
      await supabase.auth.signOut()
      setMe(null)
      setWorkers([])
      setSites([])
      setJobs([])
      setSelectedWorkerId(null)
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
        options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin + '/admin' : undefined },
      })
      if (error) throw error
      setLoginMsg('Ссылка для входа отправлена на email. Проверь почту.')
    } catch (e: any) {
      setLoginMsg(e?.message ? String(e.message) : 'Ошибка входа')
    } finally {
      setAuthLoading(false)
    }
  }

  async function doRefresh() {
    setToast({ kind: 'ok', text: 'Обновляю admin…' })
    await loadAll()
    setToast({ kind: 'ok', text: 'Admin обновлён' })
    setTimeout(() => setToast(null), 1200)
  }

  async function toggleWorkerActive(w: Profile) {
    setToast(null)
    try {
      const next = !w.active
      const { error } = await supabase.from('profiles').update({ active: next }).eq('id', w.id)
      if (error) throw error
      setToast({ kind: 'ok', text: `${w.full_name ?? 'Worker'}: ${next ? 'active' : 'inactive'}` })
      await loadAll()
      setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка изменения worker' })
    }
  }

  async function createJob() {
    if (!selectedWorkerId || !newJobSiteId) return
    setToast(null)
    try {
      const { error } = await supabase.from('jobs').insert({
        worker_id: selectedWorkerId,
        site_id: newJobSiteId,
        job_date: dateISO,
        scheduled_time: newJobTime || null,
        status: 'planned',
      })
      if (error) throw error
      setToast({ kind: 'ok', text: 'Job создан' })
      await loadAll()
      setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка создания job' })
    }
  }

  async function setJobStatus(job: Job, status: Job['status']) {
    setToast(null)
    try {
      const { error } = await supabase.from('jobs').update({ status }).eq('id', job.id)
      if (error) throw error
      setToast({ kind: 'ok', text: `Статус: ${statusLabel(status)}` })
      await loadAll()
      setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка смены статуса' })
    }
  }

  async function createSite() {
    setToast(null)
    try {
      const lat = siteLat.trim() ? Number(siteLat.trim()) : null
      const lng = siteLng.trim() ? Number(siteLng.trim()) : null
      const radius = siteRadius.trim() ? Number(siteRadius.trim()) : 80

      const { error } = await supabase.from('sites').insert({
        name: siteName.trim(),
        address: siteAddress.trim() || null,
        lat: lat,
        lng: lng,
        radius_m: Number.isFinite(radius) ? Math.round(radius) : 80,
      })
      if (error) throw error

      setSiteName('')
      setSiteAddress('')
      setSiteLat('')
      setSiteLng('')
      setSiteRadius('80')

      setToast({ kind: 'ok', text: 'Site создан' })
      await loadAll()
      setTimeout(() => setToast(null), 1200)
    } catch (e: any) {
      setToast({ kind: 'err', text: e?.message ? String(e.message) : 'Ошибка создания site' })
    }
  }

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
                  <div className="brandSub">Admin Console</div>
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
              <div className="cardTitle">Admin поднимается…</div>
              <div className="small">Контроль, планирование, KPI — всё в золоте.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="container">
        <div className="shell">
          <div className="header">
            <div className="headerRow">
              <div className="brand">
                <img className="brandLogo" src="/tanija-logo.png" alt="Tanija" />
                <div className="brandText">
                  <div className="brandTitle">TANIJA</div>
                  <div className="brandSub">Admin Console · Secure Access</div>
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
                  <div className="cardTitle">Вход в Admin</div>
                  <div className="cardHint">Email magic link</div>
                </div>

                <div className="row">
                  <div className="col">
                    <div className="small" style={{ marginBottom: 8 }}>Email</div>
                    <input
                      className="input"
                      placeholder="admin@company.com"
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                    />
                    <div className="small" style={{ marginTop: 10 }}>Открыл письмо — ты в /admin.</div>
                  </div>
                </div>

                <div className="hr" />

                <div className="row">
                  <button className="btn btnGold" onClick={doLoginOtp} disabled={authLoading}>
                    {authLoading ? 'Отправляю…' : 'Отправить ссылку'}
                  </button>
                  <a className="btn" href="/">На главную</a>
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
                  <div className="cardTitle">Admin KPI</div>
                  <div className="cardHint">{formatDMY(new Date())}</div>
                </div>
                <div className="small">
                  <div>• Workers / Sites / Jobs</div>
                  <div style={{ marginTop: 10 }}>• Планирование смен</div>
                  <div style={{ marginTop: 10 }}>• Контроль качества GPS</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (me.role !== 'admin') {
    return (
      <div className="container">
        <div className="shell">
          <div className="header">
            <div className="headerRow">
              <div className="brand">
                <img className="brandLogo" src="/tanija-logo.png" alt="Tanija" />
                <div className="brandText">
                  <div className="brandTitle">TANIJA</div>
                  <div className="brandSub">Admin Console</div>
                </div>
              </div>
              <div className="headerActions">
                <a className="btn" href="/">На главную</a>
                <button className="btn btnDanger" onClick={doLogout} disabled={authLoading}>Выйти</button>
              </div>
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div className="card">
            <div className="cardInner">
              <div className="cardTitleRow">
                <div className="cardTitle">Доступ запрещён</div>
                <div className="cardHint">role != admin</div>
              </div>
              <div className="toast toastErr">
                <div className="small">Ты не admin по профилю. Governance работает.</div>
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
                <div className="brandSub">Admin Console · {me.full_name ?? 'Admin'} · {formatDMY(new Date())}</div>
              </div>
            </div>

            <div className="headerActions">
              <a className="btn" href="/">Worker UI</a>
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
                <div className="cardTitle">KPI & Planning</div>
                <div className="cardHint">Дата jobs: {formatDMY(`${dateISO}T00:00:00`)}</div>
              </div>

              <div className="row">
                <div className="col">
                  <div className="small" style={{ marginBottom: 8 }}>Job date (YYYY-MM-DD)</div>
                  <input className="input" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
                </div>
                <div className="col">
                  <div className="small" style={{ marginBottom: 8 }}>Поиск worker</div>
                  <input className="input" placeholder="Имя / телефон" value={workerSearch} onChange={(e) => setWorkerSearch(e.target.value)} />
                </div>
              </div>

              <div className="kpiRow">
                <div className="kpi"><div className="kpiLabel">Workers</div><div className="kpiValue">{kpis.totalWorkers} / active {kpis.activeWorkers}</div></div>
                <div className="kpi"><div className="kpiLabel">Jobs</div><div className="kpiValue">{kpis.totalJobs}</div></div>
                <div className="kpi"><div className="kpiLabel">Planned</div><div className="kpiValue">{kpis.planned}</div></div>
                <div className="kpi"><div className="kpiLabel">In progress</div><div className="kpiValue">{kpis.prog}</div></div>
                <div className="kpi"><div className="kpiLabel">Done</div><div className="kpiValue">{kpis.done}</div></div>
                <div className="kpi"><div className="kpiLabel">Sites without GPS</div><div className="kpiValue">{kpis.gpsMissingSites}</div></div>
              </div>

              <div className="sep" />

              <div className="cardTitleRow">
                <div className="cardTitle">Workers</div>
                <div className="cardHint">toggle active</div>
              </div>

              <div className="list">
                {filteredWorkers.map((w) => {
                  const active = w.id === selectedWorkerId
                  return (
                    <div key={w.id} className={`item ${active ? 'itemActive' : ''}`} onClick={() => setSelectedWorkerId(w.id)}>
                      <div className="itemTop">
                        <div>
                          <div className="itemTitle">{w.full_name ?? '—'}</div>
                          <div className="itemSub">phone: {w.phone ?? '—'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span className="tag">
                            <span className="badgeDot" style={{ background: w.active ? 'var(--ok)' : 'rgba(255,255,255,0.35)' }} />
                            <span>{w.active ? 'active' : 'inactive'}</span>
                          </span>
                          <button className="btn btnGold" onClick={(e) => { e.stopPropagation(); toggleWorkerActive(w) }}>
                            Toggle
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredWorkers.length === 0 && (
                  <div className="toast"><div className="small">Workers не найдены</div></div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="cardInner">
              <div className="cardTitleRow">
                <div className="cardTitle">Worker details</div>
                <div className="cardHint">{selectedWorker?.full_name ?? '—'}</div>
              </div>

              {!selectedWorker ? (
                <div className="toast"><div className="small">Выбери worker слева</div></div>
              ) : (
                <>
                  <div className="row">
                    <div className="col">
                      <div className="small">Worker</div>
                      <div style={{ fontWeight: 900, marginTop: 6 }}>{selectedWorker.full_name ?? '—'}</div>
                      <div className="small" style={{ marginTop: 6 }}>phone: {selectedWorker.phone ?? '—'}</div>
                    </div>
                    <div className="col">
                      <span className="tag">
                        <span className="badgeDot" style={{ background: selectedWorker.active ? 'var(--ok)' : 'rgba(255,255,255,0.35)' }} />
                        <span>{selectedWorker.active ? 'active' : 'inactive'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="sep" />

                  <div className="cardTitleRow">
                    <div className="cardTitle">Create job</div>
                    <div className="cardHint">planned</div>
                  </div>

                  <div className="row">
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>Site</div>
                      <select className="input" value={newJobSiteId} onChange={(e) => setNewJobSiteId(e.target.value)}>
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>Time (HH:MM)</div>
                      <input className="input" value={newJobTime} onChange={(e) => setNewJobTime(e.target.value)} />
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn btnGold" onClick={createJob}>Create job</button>
                  </div>

                  <div className="sep" />

                  <div className="cardTitleRow">
                    <div className="cardTitle">Jobs ({formatDMY(`${dateISO}T00:00:00`)})</div>
                    <div className="cardHint">{workerJobs.length} items</div>
                  </div>

                  {workerJobs.length === 0 ? (
                    <div className="toast"><div className="small">Нет jobs на выбранную дату</div></div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Site</th>
                          <th>Status</th>
                          <th>Start</th>
                          <th>Stop</th>
                          <th>Ops</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workerJobs.map((j) => {
                          const log = j.time_logs?.[0] ?? null
                          return (
                            <tr key={j.id}>
                              <td>{j.scheduled_time ?? '—'}</td>
                              <td>
                                <div style={{ fontWeight: 850 }}>{j.site?.name ?? '—'}</div>
                                <div className="small">{j.site?.address ?? '—'}</div>
                              </td>
                              <td>
                                <span className={statusBadgeClass(j.status)}>
                                  <span className="badgeDot" />
                                  <span>{statusLabel(j.status)}</span>
                                </span>
                              </td>
                              <td>{formatDMYHM(log?.started_at)}</td>
                              <td>{formatDMYHM(log?.ended_at)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button className="btn" onClick={() => setJobStatus(j, 'planned')}>Planned</button>
                                  <button className="btn btnGold" onClick={() => setJobStatus(j, 'in_progress')}>In prog</button>
                                  <button className="btn btnDanger" onClick={() => setJobStatus(j, 'done')}>Done</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}

                  <div className="sep" />

                  <div className="cardTitleRow">
                    <div className="cardTitle">Create site</div>
                    <div className="cardHint">GPS ready</div>
                  </div>

                  <div className="row">
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>Name</div>
                      <input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Site name" />
                    </div>
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>Address</div>
                      <input className="input" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} placeholder="Address" />
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>lat</div>
                      <input className="input" value={siteLat} onChange={(e) => setSiteLat(e.target.value)} placeholder="52.37" />
                    </div>
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>lng</div>
                      <input className="input" value={siteLng} onChange={(e) => setSiteLng(e.target.value)} placeholder="4.90" />
                    </div>
                    <div className="col">
                      <div className="small" style={{ marginBottom: 8 }}>radius_m</div>
                      <input className="input" value={siteRadius} onChange={(e) => setSiteRadius(e.target.value)} placeholder="80" />
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn btnGold" onClick={createSite} disabled={!siteName.trim()}>
                      Create site
                    </button>
                  </div>
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
          Admin Console · контроль смен, качества GPS и статусов.
        </div>
      </div>
    </div>
  )
}
