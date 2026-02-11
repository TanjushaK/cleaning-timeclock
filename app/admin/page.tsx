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
  profiles: { id: string; full_name: string | null; phone: string | null } | null
}

const UI_BUILD = 'UI v2026-02-12 RU/UA'

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatDateDMY(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${pad2(Number(d))}-${pad2(Number(m))}-${y}`
}

const I18N = {
  ru: {
    title: 'Админ-панель',
    lang_label: 'Язык',
    lang_ru: 'RU',
    lang_uk: 'UA',
    btn_refresh: 'Обновить',
    btn_logout: 'Выйти',
    card_error: 'Ошибка',
    card_ok: 'ОК',

    no_session_title: 'Нет сессии',
    no_session_text: 'Откройте главную страницу, войдите и затем вернитесь в /admin.',

    access_denied_title: 'Доступ запрещён',
    access_denied_text: 'Нужен profiles.role = admin.',

    sec_create_site: 'Создать объект',
    sec_create_job: 'Создать задачу',
    sec_jobs: 'Задачи',
    sec_sites: 'Объекты',

    site_name_ph: 'Название *',
    site_address_ph: 'Адрес',
    site_lat_ph: 'lat (необязательно)',
    site_lng_ph: 'lng (необязательно)',
    site_radius_ph: 'radius_m (по умолчанию 100)',
    site_notes_ph: 'Примечания',
    btn_create_site: 'Создать объект',

    job_worker_ph: 'Сотрудник *',
    job_site_ph: 'Объект *',
    job_date_hint: 'Дата (в списках ДД-MM-ГГГГ)',
    job_time_ph: 'Время (например 08:00, необязательно)',
    btn_create_job: 'Создать задачу',

    filter_all: 'Все',
    filter_planned: 'Запланировано',
    filter_in_progress: 'В работе',
    filter_done: 'Завершено',

    status_planned: 'Запланировано',
    status_in_progress: 'В работе',
    status_done: 'Завершено',

    role_admin: 'админ',
    role_worker: 'сотрудник',

    field_worker: 'Сотрудник',
    field_date: 'Дата',
    field_time: 'Время',
    field_gps: 'GPS',

    gps_no: 'нет lat/lng',
    gps_ok: 'lat/lng OK',
    radius: 'радиус {r}м',

    empty_title: 'Пусто',
    empty_text: 'Задач нет. Создайте выше.',

    msg_site_created: 'Объект создан.',
    msg_job_created: 'Задача создана.',
    err_site_name_required: 'Название объекта обязательно.',
    err_radius_bad: 'radius_m должен быть положительным числом.',
    err_lat_bad: 'lat некорректный.',
    err_lng_bad: 'lng некорректный.',
    err_choose_worker: 'Выберите сотрудника.',
    err_choose_site: 'Выберите объект.',
    err_date_required: 'Дата обязательна.',
    err_load: 'Ошибка загрузки данных.',
    err_profile_not_found: 'Профиль не найден.',
    err_profile_disabled: 'Профиль отключён.',
    err_admin_only: 'Доступ запрещён: нужен role=admin.',
    err_create_site: 'Ошибка создания объекта.',
    err_create_job: 'Ошибка создания задачи.',
  },
  uk: {
    title: 'Адмін-панель',
    lang_label: 'Мова',
    lang_ru: 'RU',
    lang_uk: 'UA',
    btn_refresh: 'Оновити',
    btn_logout: 'Вийти',
    card_error: 'Помилка',
    card_ok: 'ОК',

    no_session_title: 'Немає сесії',
    no_session_text: 'Відкрийте головну сторінку, увійдіть і потім поверніться в /admin.',

    access_denied_title: 'Доступ заборонено',
    access_denied_text: 'Потрібен profiles.role = admin.',

    sec_create_site: "Створити об'єкт",
    sec_create_job: 'Створити завдання',
    sec_jobs: 'Завдання',
    sec_sites: "Об'єкти",

    site_name_ph: 'Назва *',
    site_address_ph: 'Адреса',
    site_lat_ph: 'lat (необовʼязково)',
    site_lng_ph: 'lng (необовʼязково)',
    site_radius_ph: 'radius_m (за замовч. 100)',
    site_notes_ph: 'Нотатки',
    btn_create_site: "Створити об'єкт",

    job_worker_ph: 'Працівник *',
    job_site_ph: "Об'єкт *",
    job_date_hint: 'Дата (у списках ДД-MM-РРРР)',
    job_time_ph: 'Час (наприклад 08:00, необовʼязково)',
    btn_create_job: 'Створити завдання',

    filter_all: 'Усі',
    filter_planned: 'Заплановано',
    filter_in_progress: 'У роботі',
    filter_done: 'Завершено',

    status_planned: 'Заплановано',
    status_in_progress: 'У роботі',
    status_done: 'Завершено',

    role_admin: 'адмін',
    role_worker: 'працівник',

    field_worker: 'Працівник',
    field_date: 'Дата',
    field_time: 'Час',
    field_gps: 'GPS',

    gps_no: 'немає lat/lng',
    gps_ok: 'lat/lng OK',
    radius: 'радіус {r}м',

    empty_title: 'Порожньо',
    empty_text: 'Завдань немає. Створіть вище.',

    msg_site_created: "Об'єкт створено.",
    msg_job_created: 'Завдання створено.',
    err_site_name_required: "Назва об'єкта обовʼязкова.",
    err_radius_bad: 'radius_m має бути додатнім числом.',
    err_lat_bad: 'lat некоректний.',
    err_lng_bad: 'lng некоректний.',
    err_choose_worker: 'Виберіть працівника.',
    err_choose_site: "Виберіть об'єкт.",
    err_date_required: "Дата обов'язкова.",
    err_load: 'Помилка завантаження даних.',
    err_profile_not_found: 'Профіль не знайдено.',
    err_profile_disabled: 'Профіль вимкнено.',
    err_admin_only: 'Доступ заборонено: потрібен role=admin.',
    err_create_site: "Помилка створення об'єкта.",
    err_create_job: 'Помилка створення завдання.',
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

export default function AdminPage() {
  const [lang, setLang] = useState<Lang>('ru')
  const t = useMemo(() => {
    return (key: Key, vars?: Record<string, string | number>) => {
      const dict = I18N[lang]
      const raw = (dict[key] ?? I18N.ru[key]) as string
      return tpl(raw, vars)
    }
  }, [lang])

  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Profile | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [sites, setSites] = useState<Site[]>([])
  const [workers, setWorkers] = useState<Profile[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [filter, setFilter] = useState<'all' | JobStatus>('all')

  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [siteLat, setSiteLat] = useState('')
  const [siteLng, setSiteLng] = useState('')
  const [siteRadius, setSiteRadius] = useState('100')
  const [siteNotes, setSiteNotes] = useState('')

  const [jobWorkerId, setJobWorkerId] = useState('')
  const [jobSiteId, setJobSiteId] = useState('')
  const [jobDate, setJobDate] = useState('')
  const [jobTime, setJobTime] = useState('')

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

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs
    return jobs.filter((j) => j.status === filter)
  }, [jobs, filter])

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

  function roleLabel(r: Role) {
    return r === 'admin' ? t('role_admin') : t('role_worker')
  }

  async function signOut() {
    setError(null)
    setInfo(null)
    await supabase.auth.signOut()
  }

  async function loadAll() {
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      const { data: sess } = await supabase.auth.getSession()
      const s = sess.session
      setSession(s ?? null)

      if (!s?.user) {
        setMe(null)
        setSites([])
        setWorkers([])
        setJobs([])
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
      if (prof.role !== 'admin') throw new Error(t('err_admin_only'))

      setMe(prof as Profile)

      const { data: sitesData, error: sitesErr } = await supabase
        .from('sites')
        .select('id, name, address, lat, lng, radius_m, notes')
        .order('name', { ascending: true })
      if (sitesErr) throw new Error(sitesErr.message)
      setSites((sitesData ?? []) as Site[])

      const { data: workersData, error: workersErr } = await supabase
        .from('profiles')
        .select('id, role, full_name, phone, active')
        .in('role', ['worker', 'admin'])
        .order('role', { ascending: true })
      if (workersErr) throw new Error(workersErr.message)
      setWorkers((workersData ?? []) as Profile[])

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
          sites ( id, name, address, lat, lng, radius_m, notes ),
          profiles:profiles!jobs_worker_id_fkey ( id, full_name, phone )
        `
        )
        .order('job_date', { ascending: false })
      if (jobsErr) throw new Error(jobsErr.message)
      setJobs((jobsData ?? []) as unknown as JobRow[])

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

  async function createSite() {
    setError(null)
    setInfo(null)

    const name = siteName.trim()
    if (!name) {
      setError(t('err_site_name_required'))
      return
    }
    const radius = Number(siteRadius)
    if (!Number.isFinite(radius) || radius <= 0) {
      setError(t('err_radius_bad'))
      return
    }

    const lat = siteLat.trim() === '' ? null : Number(siteLat)
    const lng = siteLng.trim() === '' ? null : Number(siteLng)
    if (lat != null && !Number.isFinite(lat)) {
      setError(t('err_lat_bad'))
      return
    }
    if (lng != null && !Number.isFinite(lng)) {
      setError(t('err_lng_bad'))
      return
    }

    try {
      const { error: insErr } = await supabase.from('sites').insert({
        name,
        address: siteAddress.trim() || null,
        lat,
        lng,
        radius_m: radius,
        notes: siteNotes.trim() || null,
      })
      if (insErr) throw new Error(insErr.message)

      setInfo(t('msg_site_created'))
      setSiteName('')
      setSiteAddress('')
      setSiteLat('')
      setSiteLng('')
      setSiteRadius('100')
      setSiteNotes('')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? t('err_create_site'))
    }
  }

  async function createJob() {
    setError(null)
    setInfo(null)

    if (!jobWorkerId) {
      setError(t('err_choose_worker'))
      return
    }
    if (!jobSiteId) {
      setError(t('err_choose_site'))
      return
    }
    if (!jobDate) {
      setError(t('err_date_required'))
      return
    }

    const date = jobDate.trim()
    const time = jobTime.trim() || null

    try {
      const { error: insErr } = await supabase.from('jobs').insert({
        worker_id: jobWorkerId,
        site_id: jobSiteId,
        job_date: date,
        scheduled_time: time,
        status: 'planned',
      })
      if (insErr) throw new Error(insErr.message)

      setInfo(t('msg_job_created'))
      setJobTime('')
      await loadAll()
    } catch (e: any) {
      setError(e?.message ?? t('err_create_job'))
    }
  }

  const headerName = me?.full_name?.trim() || session?.user?.email || '—'

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
                <div className="text-xs text-muted truncate">{headerName}</div>
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
              <button className="btn-ghost" onClick={loadAll} disabled={loading}>
                {t('btn_refresh')}
              </button>
              <button className="btn" onClick={signOut}>
                {t('btn_logout')}
              </button>
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
            <div className="rounded-3xl border border-stroke bg-card shadow-lux p-6">
              <div className="section-title">{t('no_session_title')}</div>
              <div className="mt-2 text-sm text-muted">{t('no_session_text')}</div>
            </div>
          </main>
        ) : me?.role !== 'admin' ? (
          <main className="mt-6">
            <div className="rounded-3xl border border-stroke bg-card shadow-lux p-6">
              <div className="section-title">{t('access_denied_title')}</div>
              <div className="mt-2 text-sm text-muted">{t('access_denied_text')}</div>
            </div>
          </main>
        ) : (
          <main className="mt-6 space-y-6">
            <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
              <div className="section-title">{t('sec_create_site')}</div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input className="input" placeholder={t('site_name_ph')} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                <input className="input" placeholder={t('site_address_ph')} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
                <input className="input" inputMode="decimal" placeholder={t('site_lat_ph')} value={siteLat} onChange={(e) => setSiteLat(e.target.value)} />
                <input className="input" inputMode="decimal" placeholder={t('site_lng_ph')} value={siteLng} onChange={(e) => setSiteLng(e.target.value)} />
                <input className="input" inputMode="numeric" placeholder={t('site_radius_ph')} value={siteRadius} onChange={(e) => setSiteRadius(e.target.value)} />
                <input className="input" placeholder={t('site_notes_ph')} value={siteNotes} onChange={(e) => setSiteNotes(e.target.value)} />
              </div>

              <div className="mt-4">
                <button className="btn w-full md:w-auto" onClick={createSite} disabled={loading}>
                  {t('btn_create_site')}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
              <div className="section-title">{t('sec_create_job')}</div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <select className="input" value={jobWorkerId} onChange={(e) => setJobWorkerId(e.target.value)}>
                  <option value="">{t('job_worker_ph')}</option>
                  {workers.filter((w) => w.active).map((w) => (
                    <option key={w.id} value={w.id}>
                      {(w.full_name || '—') + ` (${roleLabel(w.role)})`}
                    </option>
                  ))}
                </select>

                <select className="input" value={jobSiteId} onChange={(e) => setJobSiteId(e.target.value)}>
                  <option value="">{t('job_site_ph')}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <div className="rounded-2xl border border-stroke bg-card2 px-4 py-3">
                  <div className="text-xs text-muted">{t('job_date_hint')}</div>
                  <input className="mt-2 input" type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} />
                </div>

                <input className="input" placeholder={t('job_time_ph')} value={jobTime} onChange={(e) => setJobTime(e.target.value)} />
              </div>

              <div className="mt-4">
                <button className="btn w-full md:w-auto" onClick={createJob} disabled={loading}>
                  {t('btn_create_job')}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="section-title">{t('sec_jobs')}</div>
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
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredJobs.map((j) => (
                  <div key={j.id} className="rounded-3xl border border-stroke bg-card2 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{j.sites?.name ?? '—'}</div>
                        <div className="mt-1 text-xs text-muted">{j.sites?.address ?? '—'}</div>
                        <div className="mt-2 text-xs">
                          <span className="text-muted">{t('field_worker')}:</span>{' '}
                          <span className="font-semibold">{j.profiles?.full_name ?? j.worker_id}</span>
                        </div>
                      </div>
                      <span className={statusChipClass(j.status)}>{t(statusKey(j.status))}</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-2xl border border-stroke bg-card px-3 py-2">
                        <div className="text-muted">{t('field_date')}</div>
                        <div className="mt-1 font-semibold">{formatDateDMY(j.job_date)}</div>
                      </div>
                      <div className="rounded-2xl border border-stroke bg-card px-3 py-2">
                        <div className="text-muted">{t('field_time')}</div>
                        <div className="mt-1 font-semibold">{j.scheduled_time ?? '—'}</div>
                      </div>
                      <div className="rounded-2xl border border-stroke bg-card px-3 py-2 col-span-2">
                        <div className="text-muted">{t('field_gps')}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {j.sites?.lat == null || j.sites?.lng == null ? (
                            <span className="chip chip-bad">{t('gps_no')}</span>
                          ) : (
                            <span className="chip chip-ok">{t('gps_ok')}</span>
                          )}
                          <span className="chip chip-gold">{tpl(t('radius'), { r: j.sites?.radius_m ?? 0 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {!loading && filteredJobs.length === 0 ? (
                  <div className="rounded-3xl border border-stroke bg-card p-6 md:col-span-2">
                    <div className="section-title">{t('empty_title')}</div>
                    <div className="mt-2 text-sm text-muted">{t('empty_text')}</div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
              <div className="section-title">{t('sec_sites')}</div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                {sites.map((s) => (
                  <div key={s.id} className="rounded-3xl border border-stroke bg-card2 p-5">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="mt-1 text-xs text-muted">{s.address ?? '—'}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="chip chip-gold">{tpl(t('radius'), { r: s.radius_m })}</span>
                      {s.lat == null || s.lng == null ? (
                        <span className="chip chip-bad">{t('gps_no')}</span>
                      ) : (
                        <span className="chip chip-ok">{t('gps_ok')}</span>
                      )}
                    </div>
                    {s.notes ? <div className="mt-3 text-xs text-muted">{s.notes}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          </main>
        )}

        <footer className="mt-8 pb-6 text-center text-xs text-muted">
          <span className="text-gold">{UI_BUILD}</span>
        </footer>
      </div>
    </div>
  )
}
