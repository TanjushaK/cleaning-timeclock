'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Role = 'admin' | 'worker'
type JobStatus = 'planned' | 'in_progress' | 'done'
type Lang = 'ru' | 'uk'

type Profile = {
  id: string
  role: Role
  full_name: string | null
  phone: string | null
  active: boolean
}

type Site = {
  id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  radius_m: number
  notes: string | null
}

type JobRow = {
  id: string
  worker_id: string
  site_id: string
  job_date: string
  scheduled_time: string | null
  status: JobStatus
  sites: Site | null
}

type TimeLogRow = {
  job_id: string
  started_at: string | null
  ended_at: string | null
}

const UI_BUILD = 'UI v2026-02-12 RU/UA'

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatDateDMY(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${pad2(Number(d))}-${pad2(Number(m))}-${y}`
}

function formatDateTimeDMYHM(isoTs: string) {
  const dt = new Date(isoTs)
  if (Number.isNaN(dt.getTime())) return isoTs
  const d = pad2(dt.getDate())
  const m = pad2(dt.getMonth() + 1)
  const y = dt.getFullYear()
  const hh = pad2(dt.getHours())
  const mm = pad2(dt.getMinutes())
  return `${d}-${m}-${y} ${hh}:${mm}`
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

async function getGpsOrThrow(): Promise<{ lat: number; lng: number; accuracy: number }> {
  if (typeof window === 'undefined') throw new Error('GPS недоступен.')
  if (!('geolocation' in navigator)) throw new Error('GPS недоступен на этом устройстве.')

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })

  const lat = pos.coords.latitude
  const lng = pos.coords.longitude
  const accuracy = pos.coords.accuracy

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
    throw new Error('GPS вернул некорректные данные.')
  }

  return { lat, lng, accuracy }
}

const I18N = {
  ru: {
    title: 'Учёт времени',
    subtitle_guest: 'Войдите, чтобы начать',
    admin_mark: ' • Админ',

    lang_label: 'Язык',
    lang_ru: 'RU',
    lang_uk: 'UA',

    btn_refresh: 'Обновить',
    btn_logout: 'Выйти',

    card_error: 'Ошибка',
    card_ok: 'ОК',

    login_title: 'Вход',
    email_ph: 'Эл. почта',
    pass_ph: 'Пароль',
    btn_signin: 'Войти',
    btn_signing: 'Вхожу…',
    login_hint: 'На телефоне: разрешите геолокацию для сайта, иначе старт/стоп будет недоступен.',

    filter_all: 'Все',
    filter_planned: 'Запланировано',
    filter_in_progress: 'В работе',
    filter_done: 'Завершено',

    state_gps: 'Проверяю GPS…',
    state_action: 'Фиксирую…',
    state_loading: 'Загружаю…',
    state_ready: 'Готово',

    status_planned: 'Запланировано',
    status_in_progress: 'В работе',
    status_done: 'Завершено',

    field_date: 'Дата',
    field_time: 'Время',
    field_logs: 'Логи',
    field_gps: 'GPS',

    log_start: 'Старт',
    log_stop: 'Стоп',

    gps_blocked_no_latlng: 'lat/lng отсутствуют — старт/стоп запрещён',
    gps_policy: 'Радиус: {r}м • Точность ≤ 80м',

    btn_start: 'СТАРТ',
    btn_stop: 'СТОП',
    btn_starting: 'СТАРТ…',
    btn_stopping: 'СТОП…',

    empty_title: 'Задач нет',
    empty_text: 'Попросите администратора назначить задачу.',

    footer: 'Сначала телефон • Формат: ДД-MM-ГГГГ • ДД-MM-ГГГГ ЧЧ:ММ',

    err_start_only_planned: 'Старт доступен только для статуса "Запланировано".',
    err_already_running: 'Уже запущено (есть открытый лог).',
    err_site_missing: 'Объект (site) не найден.',
    err_no_latlng: 'Старт/стоп запрещён: у объекта нет GPS (lat/lng).',
    err_gps_inaccurate: 'GPS слишком неточный: {m}м (нужно ≤ 80м).',
    err_out_of_radius: 'Вы вне радиуса: {d}м (лимит {r}м).',
    msg_start_ok: 'Старт зафиксирован.',
    msg_stop_ok: 'Стоп зафиксирован.',
    err_stop_no_started: 'Стоп запрещён: нет started_at.',
    err_stop_already_done: 'Уже завершено (ended_at заполнен).',
    err_open_log_not_found: 'Открытый time_log не найден.',
    err_load: 'Ошибка загрузки данных.',
    msg_signin_ok: 'Вход выполнен.',
    err_signin: 'Ошибка входа.',
    err_start: 'Ошибка старта.',
    err_stop: 'Ошибка стопа.',
    err_profile_not_found: 'Профиль не найден.',
    err_profile_disabled: 'Профиль отключён. Обратитесь к администратору.',
  },
  uk: {
    title: 'Облік часу',
    subtitle_guest: 'Увійдіть, щоб почати',
    admin_mark: ' • Адмін',

    lang_label: 'Мова',
    lang_ru: 'RU',
    lang_uk: 'UA',

    btn_refresh: 'Оновити',
    btn_logout: 'Вийти',

    card_error: 'Помилка',
    card_ok: 'ОК',

    login_title: 'Вхід',
    email_ph: 'Е-пошта',
    pass_ph: 'Пароль',
    btn_signin: 'Увійти',
    btn_signing: 'Входжу…',
    login_hint: 'На телефоні: дозвольте геолокацію для сайту, інакше старт/стоп буде недоступний.',

    filter_all: 'Усі',
    filter_planned: 'Заплановано',
    filter_in_progress: 'У роботі',
    filter_done: 'Завершено',

    state_gps: 'Перевіряю GPS…',
    state_action: 'Фіксую…',
    state_loading: 'Завантажую…',
    state_ready: 'Готово',

    status_planned: 'Заплановано',
    status_in_progress: 'У роботі',
    status_done: 'Завершено',

    field_date: 'Дата',
    field_time: 'Час',
    field_logs: 'Логи',
    field_gps: 'GPS',

    log_start: 'Старт',
    log_stop: 'Стоп',

    gps_blocked_no_latlng: 'lat/lng відсутні — старт/стоп заборонено',
    gps_policy: 'Радіус: {r}м • Точність ≤ 80м',

    btn_start: 'СТАРТ',
    btn_stop: 'СТОП',
    btn_starting: 'СТАРТ…',
    btn_stopping: 'СТОП…',

    empty_title: 'Завдань немає',
    empty_text: 'Попросіть адміністратора призначити завдання.',

    footer: 'Спочатку телефон • Формат: ДД-MM-РРРР • ДД-MM-РРРР ГГ:ХХ',

    err_start_only_planned: 'Старт доступний лише для статусу "Заплановано".',
    err_already_running: 'Вже запущено (є відкритий лог).',
    err_site_missing: "Об'єкт (site) не знайдено.",
    err_no_latlng: "Старт/стоп заборонено: у об'єкта немає GPS (lat/lng).",
    err_gps_inaccurate: 'GPS занадто неточний: {m}м (потрібно ≤ 80м).',
    err_out_of_radius: 'Ви поза радіусом: {d}м (ліміт {r}м).',
    msg_start_ok: 'Старт зафіксовано.',
    msg_stop_ok: 'Стоп зафіксовано.',
    err_stop_no_started: 'Стоп заборонено: немає started_at.',
    err_stop_already_done: 'Вже завершено (ended_at заповнено).',
    err_open_log_not_found: 'Відкритий time_log не знайдено.',
    err_load: 'Помилка завантаження даних.',
    msg_signin_ok: 'Вхід виконано.',
    err_signin: 'Помилка входу.',
    err_start: 'Помилка старту.',
    err_stop: 'Помилка стопу.',
    err_profile_not_found: 'Профіль не знайдено.',
    err_profile_disabled: 'Профіль вимкнено. Зверніться до адміністратора.',
  },
} as const

type Key = keyof typeof I18N.ru

function tpl(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k) => (vars[k] ?? `{${k}}`).toString())
}

function statusKey(s: JobStatus): Key {
  if (s === 'planned') return 'status_planned'
  if (s === 'in_progress') return 'status_in_progress'
  return 'status_done'
}

function statusChipClass(s: JobStatus) {
  if (s === 'planned') return 'chip chip-gold'
  if (s === 'in_progress') return 'chip chip-ok'
  return 'chip'
}

function LangSwitch({
  lang,
  onChange,
  labelRU,
  labelUA,
  label,
}: {
  lang: Lang
  onChange: (l: Lang) => void
  labelRU: string
  labelUA: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted hidden sm:inline">{label}</span>
      <div className="flex rounded-2xl border border-stroke bg-card2 p-1">
        <button className={lang === 'ru' ? 'chip chip-gold' : 'chip'} onClick={() => onChange('ru')} type="button">
          {labelRU}
        </button>
        <button className={lang === 'uk' ? 'chip chip-gold' : 'chip'} onClick={() => onChange('uk')} type="button">
          {labelUA}
        </button>
      </div>
    </div>
  )
}

export default function Page() {
  const [lang, setLang] = useState<Lang>('ru')
  const t = useMemo(() => {
    return (key: Key, vars?: Record<string, string | number>) => {
      const dict = I18N[lang]
      const raw = (dict[key] ?? I18N.ru[key]) as string
      return tpl(raw, vars)
    }
  }, [lang])

  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [jobs, setJobs] = useState<JobRow[]>([])
  const [logs, setLogs] = useState<Record<string, TimeLogRow>>({})
  const [filter, setFilter] = useState<'all' | JobStatus>('all')

  const [actionJobId, setActionJobId] = useState<string | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)

  useEffect(() => {
    try {
      const saved = (localStorage.getItem('tanija_lang') as Lang | null) ?? 'ru'
      if (saved === 'ru' || saved === 'uk') setLang(saved)
    } catch {}
  }, [])

  function setLangPersist(next: Lang) {
    setLang(next)
    try {
      localStorage.setItem('tanija_lang', next)
    } catch {}
  }

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session ?? null)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs
    return jobs.filter((j) => j.status === filter)
  }, [jobs, filter])

  async function loadAll() {
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      const { data: sess } = await supabase.auth.getSession()
      const s = sess.session
      setSession(s ?? null)
      if (!s?.user) {
        setProfile(null)
        setJobs([])
        setLogs({})
        setLoading(false)
        return
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone, active')
        .eq('id', s.user.id)
        .single()

      if (profErr) throw new Error(profErr.message)
      if (!prof) throw new Error(t('err_profile_not_found'))
      if (!prof.active) throw new Error(t('err_profile_disabled'))

      setProfile(prof as Profile)

      const { data: jobsData, error: jobsErr } = await supabase
        .from('jobs')
        .select(
          `
          id,
          worker_id,
          site_id,
          job_date,
          scheduled_time,
          status,
          sites (
            id, name, address, lat, lng, radius_m, notes
          )
        `
        )
        .eq('worker_id', s.user.id)
        .order('job_date', { ascending: false })

      if (jobsErr) throw new Error(jobsErr.message)

      const jobRows = (jobsData ?? []) as unknown as JobRow[]
      setJobs(jobRows)

      const jobIds = jobRows.map((j) => j.id)
      if (jobIds.length === 0) {
        setLogs({})
        setLoading(false)
        return
      }

      const { data: logsData, error: logsErr } = await supabase
        .from('time_logs')
        .select('job_id, started_at, ended_at')
        .in('job_id', jobIds)
        .order('started_at', { ascending: false })

      if (logsErr) throw new Error(logsErr.message)

      const map: Record<string, TimeLogRow> = {}
      for (const row of (logsData ?? []) as unknown as TimeLogRow[]) {
        if (!map[row.job_id]) map[row.job_id] = row
      }
      setLogs(map)

      setLoading(false)
    } catch (e: any) {
      setLoading(false)
      setError(e?.message ?? t('err_load'))
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function signIn() {
    setError(null)
    setInfo(null)
    setAuthBusy(true)
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signErr) throw new Error(signErr.message)
      setInfo(t('msg_signin_ok'))
      setPassword('')
    } catch (e: any) {
      setError(e?.message ?? t('err_signin'))
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    setError(null)
    setInfo(null)
    await supabase.auth.signOut()
    setProfile(null)
    setJobs([])
    setLogs({})
  }

  async function ensureGpsForSiteOrThrow(site: Site) {
    if (site.lat == null || site.lng == null) {
      throw new Error(t('err_no_latlng'))
    }
    setGpsBusy(true)
    try {
      const { lat, lng, accuracy } = await getGpsOrThrow()
      if (accuracy > 80) {
        throw new Error(t('err_gps_inaccurate', { m: Math.round(accuracy) }))
      }
      const distance = haversineMeters(lat, lng, site.lat, site.lng)
      if (distance > site.radius_m) {
        throw new Error(t('err_out_of_radius', { d: Math.round(distance), r: site.radius_m }))
      }
      return { lat, lng, accuracy, distance }
    } finally {
      setGpsBusy(false)
    }
  }

  async function onStart(job: JobRow) {
    setError(null)
    setInfo(null)
    if (!profile) return
    if (job.status !== 'planned') {
      setError(t('err_start_only_planned'))
      return
    }
    const log = logs[job.id]
    if (log?.started_at && !log?.ended_at) {
      setError(t('err_already_running'))
      return
    }
    if (!job.sites) {
      setError(t('err_site_missing'))
      return
    }

    setActionJobId(job.id)
    try {
      const gps = await ensureGpsForSiteOrThrow(job.sites)
      const startedAt = new Date().toISOString()

      const { error: insErr } = await supabase.from('time_logs').insert({
        job_id: job.id,
        started_at: startedAt,
        start_lat: gps.lat,
        start_lng: gps.lng,
        start_accuracy_m: gps.accuracy,
        start_distance_m: gps.distance,
      })
      if (insErr) throw new Error(insErr.message)

      const { error: updErr } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', job.id)
      if (updErr) throw new Error(updErr.message)

      setInfo(t('msg_start_ok'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? t('err_start'))
    } finally {
      setActionJobId(null)
    }
  }

  async function onStop(job: JobRow) {
    setError(null)
    setInfo(null)
    if (!profile) return
    const log = logs[job.id]
    if (!log?.started_at) {
      setError(t('err_stop_no_started'))
      return
    }
    if (log?.ended_at) {
      setError(t('err_stop_already_done'))
      return
    }
    if (!job.sites) {
      setError(t('err_site_missing'))
      return
    }

    setActionJobId(job.id)
    try {
      const gps = await ensureGpsForSiteOrThrow(job.sites)

      const { data: openLog, error: openErr } = await supabase
        .from('time_logs')
        .select('job_id, started_at, ended_at')
        .eq('job_id', job.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (openErr) throw new Error(openErr.message)
      if (!openLog) throw new Error(t('err_open_log_not_found'))

      const endedAt = new Date().toISOString()

      const { error: updLogErr } = await supabase
        .from('time_logs')
        .update({
          ended_at: endedAt,
          end_lat: gps.lat,
          end_lng: gps.lng,
          end_accuracy_m: gps.accuracy,
          end_distance_m: gps.distance,
        })
        .eq('job_id', job.id)
        .is('ended_at', null)

      if (updLogErr) throw new Error(updLogErr.message)

      const { error: updJobErr } = await supabase.from('jobs').update({ status: 'done' }).eq('id', job.id)
      if (updJobErr) throw new Error(updJobErr.message)

      setInfo(t('msg_stop_ok'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? t('err_stop'))
    } finally {
      setActionJobId(null)
    }
  }

  const headerName = profile?.full_name?.trim() || session?.user?.email || '—'
  const adminMark = profile?.role === 'admin' ? t('admin_mark') : ''
  const subtitle = session?.user ? `${headerName}${adminMark}` : t('subtitle_guest')

  return (
    <div className="min-h-screen safe-pad">
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-3 backdrop-blur-xl bg-black/30 border-b border-stroke">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-card border border-stroke shadow-lux overflow-hidden shrink-0">
                <Image
                  src="/tanija-logo.png"
                  alt="Tanija"
                  width={80}
                  height={80}
                  className="h-full w-full object-contain p-1"
                  priority
                />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-base font-semibold truncate">
                  {t('title')} <span className="text-gold">Tanija</span>
                </div>
                <div className="text-xs text-muted truncate">{subtitle}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <LangSwitch
                lang={lang}
                onChange={setLangPersist}
                label={t('lang_label')}
                labelRU={t('lang_ru')}
                labelUA={t('lang_uk')}
              />

              {session?.user ? (
                <>
                  <button className="btn-ghost" onClick={loadAll} disabled={loading || gpsBusy}>
                    {t('btn_refresh')}
                  </button>
                  <button className="btn" onClick={signOut} disabled={gpsBusy}>
                    {t('btn_logout')}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-stroke bg-card px-4 py-3 text-sm lux-shimmer">
              <span className="chip chip-bad">{t('card_error')}</span>
              <div className="mt-2 text-sm">{error}</div>
            </div>
          ) : null}

          {info ? (
            <div className="mt-3 rounded-2xl border border-stroke bg-card px-4 py-3 text-sm">
              <span className="chip chip-ok">{t('card_ok')}</span>
              <div className="mt-2 text-sm">{info}</div>
            </div>
          ) : null}
        </header>

        {!session?.user ? (
          <main className="mt-6">
            <div className="mx-auto max-w-md rounded-3xl border border-stroke bg-card shadow-lux p-5">
              <div className="section-title">{t('login_title')}</div>
              <div className="mt-4 space-y-3">
                <input
                  className="input"
                  inputMode="email"
                  placeholder={t('email_ph')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder={t('pass_ph')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button className="btn w-full" onClick={signIn} disabled={authBusy || !email || !password}>
                  {authBusy ? t('btn_signing') : t('btn_signin')}
                </button>
                <div className="text-xs text-muted">{t('login_hint')}</div>
              </div>
            </div>
          </main>
        ) : (
          <main className="mt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                <button className={filter === 'all' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('all')}>
                  {t('filter_all')}
                </button>
                <button className={filter === 'planned' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('planned')}>
                  {t('filter_planned')}
                </button>
                <button className={filter === 'in_progress' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('in_progress')}>
                  {t('filter_in_progress')}
                </button>
                <button className={filter === 'done' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('done')}>
                  {t('filter_done')}
                </button>
              </div>

              <div className="text-xs text-muted">
                {gpsBusy ? t('state_gps') : actionJobId ? t('state_action') : loading ? t('state_loading') : t('state_ready')}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredJobs.map((job) => {
                const site = job.sites
                const log = logs[job.id]
                const started = log?.started_at ? formatDateTimeDMYHM(log.started_at) : null
                const ended = log?.ended_at ? formatDateTimeDMYHM(log.ended_at) : null

                const canStart =
                  job.status === 'planned' && (!log?.started_at || (log?.started_at && log?.ended_at))
                const canStop = !!log?.started_at && !log?.ended_at

                const busy = actionJobId === job.id || gpsBusy

                return (
                  <div key={job.id} className="rounded-3xl border border-stroke bg-card shadow-lux p-5 lux-shimmer">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{site?.name ?? t('err_site_missing')}</div>
                        <div className="mt-1 text-xs text-muted">{site?.address ?? '—'}</div>
                      </div>
                      <span className={statusChipClass(job.status)}>{t(statusKey(job.status))}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-2xl border border-stroke bg-card2 px-3 py-2">
                        <div className="text-muted">{t('field_date')}</div>
                        <div className="mt-1 font-semibold">{formatDateDMY(job.job_date)}</div>
                      </div>
                      <div className="rounded-2xl border border-stroke bg-card2 px-3 py-2">
                        <div className="text-muted">{t('field_time')}</div>
                        <div className="mt-1 font-semibold">{job.scheduled_time ?? '—'}</div>
                      </div>

                      <div className="rounded-2xl border border-stroke bg-card2 px-3 py-2 col-span-2">
                        <div className="text-muted">{t('field_logs')}</div>
                        <div className="mt-1">
                          <div>
                            <span className="text-muted">{t('log_start')}:</span>{' '}
                            <span className="font-semibold">{started ?? '—'}</span>
                          </div>
                          <div className="mt-1">
                            <span className="text-muted">{t('log_stop')}:</span>{' '}
                            <span className="font-semibold">{ended ?? '—'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-stroke bg-card2 px-3 py-2 col-span-2">
                        <div className="text-muted">{t('field_gps')}</div>
                        <div className="mt-1">
                          {site?.lat == null || site?.lng == null ? (
                            <span className="chip chip-bad">{t('gps_blocked_no_latlng')}</span>
                          ) : (
                            <span className="chip chip-gold">{t('gps_policy', { r: site.radius_m })}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <button className="btn w-full" onClick={() => onStart(job)} disabled={!canStart || busy}>
                        {busy && canStart ? t('btn_starting') : t('btn_start')}
                      </button>
                      <button className="btn-ghost w-full" onClick={() => onStop(job)} disabled={!canStop || busy}>
                        {busy && canStop ? t('btn_stopping') : t('btn_stop')}
                      </button>
                    </div>
                  </div>
                )
              })}

              {!loading && filteredJobs.length === 0 ? (
                <div className="rounded-3xl border border-stroke bg-card shadow-lux p-6 md:col-span-2">
                  <div className="section-title">{t('empty_title')}</div>
                  <div className="mt-2 text-sm text-muted">{t('empty_text')}</div>
                </div>
              ) : null}
            </div>
          </main>
        )}

        <footer className="mt-8 pb-6 text-center text-xs text-muted">
          {t('footer')} • <span className="text-gold">{UI_BUILD}</span>
        </footer>
      </div>
    </div>
  )
}
