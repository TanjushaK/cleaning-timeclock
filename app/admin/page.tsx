'use client'

import Image from 'next/image'
import Link from 'next/link'
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
  avatar_url: string | null
}

type WorkerRow = Profile & { email: string | null }

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
  planned_minutes: number | null
  status: JobStatus
  sites: Site | null
  profiles: { id: string; full_name: string | null; phone: string | null; avatar_url: string | null } | null
}

type ReportRow = {
  job_id: string
  job_date: string
  scheduled_time: string | null
  planned_minutes: number | null
  status: JobStatus
  worker_id: string
  worker_name: string | null
  worker_avatar_url: string | null
  site_id: string
  site_name: string | null
  started_at: string
  ended_at: string
  minutes: number
}

type ReportResponse = {
  from: string
  to: string
  total_minutes: number
  total_hours: number
  by_worker: { worker_id: string; worker_name: string | null; avatar_url: string | null; minutes: number; hours: number }[]
  rows: ReportRow[]
  incomplete: { job_id: string; worker_id: string; started_at: string }[]
}

type Tab = 'workers' | 'sites' | 'jobs' | 'reports' | 'schedule'

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

function addDays(isoDate: string, days: number) {
  const dt = new Date(`${isoDate}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + days)
  const y = dt.getUTCFullYear()
  const m = pad2(dt.getUTCMonth() + 1)
  const d = pad2(dt.getUTCDate())
  return `${y}-${m}-${d}`
}

const I18N = {
  ru: {
    title: 'Админ-панель',
    lang_label: 'Язык',
    lang_ru: 'RU',
    lang_uk: 'UA',

    btn_refresh: 'Обновить',
    btn_logout: 'Выйти',
    btn_home: 'Главная',

    tab_workers: 'Работники',
    tab_sites: 'Объекты',
    tab_jobs: 'Задачи',
    tab_reports: 'Отчёты',
    tab_schedule: 'График',

    card_error: 'Ошибка',
    card_ok: 'ОК',

    no_session_title: 'Нет сессии',
    no_session_text: 'Откройте главную страницу, войдите и затем вернитесь в /admin.',

    access_denied_title: 'Доступ запрещён',
    access_denied_text: 'Нужен profiles.role = admin.',

    state_loading: 'Загружаю…',
    state_ready: 'Готово',

    // Workers
    sec_workers_create: 'Создать работника',
    sec_workers_list: 'Список работников',
    worker_email_ph: 'Email *',
    worker_pass_ph: 'Пароль *',
    worker_name_ph: 'Имя',
    worker_phone_ph: 'Телефон',
    btn_worker_create: 'Создать',
    btn_worker_creating: 'Создаю…',
    btn_worker_disable: 'Деактивировать',
    btn_worker_enable: 'Активировать',
    btn_worker_delete: 'Удалить',
    btn_worker_setpass: 'Сбросить пароль',
    worker_active: 'активен',
    worker_disabled: 'отключён',

    // Sites
    sec_site_form: 'Объект (создать/редактировать)',
    sec_sites_list: 'Список объектов',
    site_name_ph: 'Название *',
    site_address_ph: 'Адрес',
    site_lat_ph: 'lat (необязательно)',
    site_lng_ph: 'lng (необязательно)',
    site_radius_ph: 'radius_m (по умолч. 100)',
    site_notes_ph: 'Примечания',
    btn_site_create: 'Создать',
    btn_site_save: 'Сохранить',
    btn_site_cancel: 'Сбросить',
    btn_site_edit: 'Редактировать',
    btn_site_delete: 'Удалить',

    // Jobs
    sec_job_create: 'Создать задачу',
    sec_jobs_list: 'Список задач',
    job_worker_ph: 'Работник *',
    job_site_ph: 'Объект *',
    job_date_hint: 'Дата',
    job_time_ph: 'Время (например 08:00, необязательно)',
    job_plan_ph: 'План, минут (например 240)',
    btn_job_create: 'Создать',
    btn_job_delete: 'Удалить',

    filter_all: 'Все',
    filter_planned: 'Запланировано',
    filter_in_progress: 'В работе',
    filter_done: 'Завершено',

    status_planned: 'Запланировано',
    status_in_progress: 'В работе',
    status_done: 'Завершено',

    // Reports
    sec_reports: 'Отчёты по диапазону',
    rep_from: 'С',
    rep_to: 'По',
    rep_worker: 'Работник',
    rep_worker_all: 'Все',
    btn_rep_run: 'Сформировать',
    rep_total: 'Итого',
    rep_by_worker: 'По работникам',
    rep_rows: 'Детализация',
    rep_incomplete: 'Незакрытые (без СТОП)',
    preset_7: '7д',
    preset_14: '14д',
    preset_30: '30д',
    preset_60: '60д',
    preset_365: '365д',

    // Schedule
    sec_schedule: 'График (день/неделя)',
    sch_day: 'День',
    sch_week: 'Неделя',
    sch_date: 'Дата',
    btn_prev: 'Назад',
    btn_today: 'Сегодня',
    btn_next: 'Вперёд',

    field_worker: 'Работник',
    field_site: 'Объект',
    field_date: 'Дата',
    field_time: 'Время',
    field_plan: 'План',
    field_status: 'Статус',
    field_fact: 'Факт',

    empty_title: 'Пусто',
    empty_text: 'Записей нет.',

    msg_saved: 'Сохранено.',
    msg_created: 'Создано.',
    msg_deleted: 'Удалено.',

    err_required: 'Заполните обязательные поля.',
    err_bad_number: 'Некорректное число.',
    err_load: 'Ошибка загрузки данных.',
    err_admin_only: 'Доступ запрещён: нужен role=admin.',
  },
  uk: {
    title: 'Адмін-панель',
    lang_label: 'Мова',
    lang_ru: 'RU',
    lang_uk: 'UA',

    btn_refresh: 'Оновити',
    btn_logout: 'Вийти',
    btn_home: 'Головна',

    tab_workers: 'Працівники',
    tab_sites: "Об'єкти",
    tab_jobs: 'Завдання',
    tab_reports: 'Звіти',
    tab_schedule: 'Графік',

    card_error: 'Помилка',
    card_ok: 'ОК',

    no_session_title: 'Немає сесії',
    no_session_text: 'Відкрийте головну сторінку, увійдіть і потім поверніться в /admin.',

    access_denied_title: 'Доступ заборонено',
    access_denied_text: 'Потрібен profiles.role = admin.',

    state_loading: 'Завантажую…',
    state_ready: 'Готово',

    // Workers
    sec_workers_create: 'Створити працівника',
    sec_workers_list: 'Список працівників',
    worker_email_ph: 'Email *',
    worker_pass_ph: 'Пароль *',
    worker_name_ph: "Ім'я",
    worker_phone_ph: 'Телефон',
    btn_worker_create: 'Створити',
    btn_worker_creating: 'Створюю…',
    btn_worker_disable: 'Деактивувати',
    btn_worker_enable: 'Активувати',
    btn_worker_delete: 'Видалити',
    btn_worker_setpass: 'Скинути пароль',
    worker_active: 'активний',
    worker_disabled: 'вимкнений',

    // Sites
    sec_site_form: "Об'єкт (створити/редагувати)",
    sec_sites_list: "Список об'єктів",
    site_name_ph: 'Назва *',
    site_address_ph: 'Адреса',
    site_lat_ph: 'lat (необовʼязково)',
    site_lng_ph: 'lng (необовʼязково)',
    site_radius_ph: 'radius_m (за замовч. 100)',
    site_notes_ph: 'Нотатки',
    btn_site_create: 'Створити',
    btn_site_save: 'Зберегти',
    btn_site_cancel: 'Скинути',
    btn_site_edit: 'Редагувати',
    btn_site_delete: 'Видалити',

    // Jobs
    sec_job_create: 'Створити завдання',
    sec_jobs_list: 'Список завдань',
    job_worker_ph: 'Працівник *',
    job_site_ph: "Об'єкт *",
    job_date_hint: 'Дата',
    job_time_ph: 'Час (наприклад 08:00, необовʼязково)',
    job_plan_ph: 'План, хв (наприклад 240)',
    btn_job_create: 'Створити',
    btn_job_delete: 'Видалити',

    filter_all: 'Усі',
    filter_planned: 'Заплановано',
    filter_in_progress: 'У роботі',
    filter_done: 'Завершено',

    status_planned: 'Заплановано',
    status_in_progress: 'У роботі',
    status_done: 'Завершено',

    // Reports
    sec_reports: 'Звіти по діапазону',
    rep_from: 'З',
    rep_to: 'По',
    rep_worker: 'Працівник',
    rep_worker_all: 'Усі',
    btn_rep_run: 'Сформувати',
    rep_total: 'Разом',
    rep_by_worker: 'По працівниках',
    rep_rows: 'Деталізація',
    rep_incomplete: 'Незакриті (без СТОП)',
    preset_7: '7д',
    preset_14: '14д',
    preset_30: '30д',
    preset_60: '60д',
    preset_365: '365д',

    // Schedule
    sec_schedule: 'Графік (день/тиждень)',
    sch_day: 'День',
    sch_week: 'Тиждень',
    sch_date: 'Дата',
    btn_prev: 'Назад',
    btn_today: 'Сьогодні',
    btn_next: 'Вперед',

    field_worker: 'Працівник',
    field_site: "Об'єкт",
    field_date: 'Дата',
    field_time: 'Час',
    field_plan: 'План',
    field_status: 'Статус',
    field_fact: 'Факт',

    empty_title: 'Порожньо',
    empty_text: 'Записів немає.',

    msg_saved: 'Збережено.',
    msg_created: 'Створено.',
    msg_deleted: 'Видалено.',

    err_required: "Заповніть обов'язкові поля.",
    err_bad_number: 'Некоректне число.',
    err_load: 'Помилка завантаження даних.',
    err_admin_only: 'Доступ заборонено: потрібен role=admin.',
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

async function apiJson<T>(path: string, session: Session | null, init?: RequestInit): Promise<T> {
  const token = session?.access_token
  if (!token) throw new Error('Нет сессии')

  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || 'Ошибка API')
  return json as T
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

  const [tab, setTab] = useState<Tab>('workers')

  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Profile | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [sites, setSites] = useState<Site[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [filter, setFilter] = useState<'all' | JobStatus>('all')

  // Workers create
  const [newEmail, setNewEmail] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [workerBusy, setWorkerBusy] = useState(false)

  // Sites form
  const [siteEditId, setSiteEditId] = useState<string | null>(null)
  const [siteName, setSiteName] = useState('')
  const [siteAddress, setSiteAddress] = useState('')
  const [siteLat, setSiteLat] = useState('')
  const [siteLng, setSiteLng] = useState('')
  const [siteRadius, setSiteRadius] = useState('100')
  const [siteNotes, setSiteNotes] = useState('')

  // Jobs create
  const [jobWorkerId, setJobWorkerId] = useState('')
  const [jobSiteId, setJobSiteId] = useState('')
  const [jobDate, setJobDate] = useState('')
  const [jobTime, setJobTime] = useState('')
  const [jobPlan, setJobPlan] = useState('240')

  // Reports
  const todayIso = useMemo(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = pad2(d.getMonth() + 1)
    const dd = pad2(d.getDate())
    return `${y}-${m}-${dd}`
  }, [])

  const [repFrom, setRepFrom] = useState(addDays(todayIso, -6))
  const [repTo, setRepTo] = useState(todayIso)
  const [repWorker, setRepWorker] = useState('')
  const [repBusy, setRepBusy] = useState(false)
  const [rep, setRep] = useState<ReportResponse | null>(null)

  // Schedule
  const [schMode, setSchMode] = useState<'day' | 'week'>('week')
  const [schDate, setSchDate] = useState(todayIso)
  const [schBusy, setSchBusy] = useState(false)
  const [schJobs, setSchJobs] = useState<JobRow[]>([])

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

  async function signOut() {
    setError(null)
    setInfo(null)
    await supabase.auth.signOut()
    setMe(null)
    setSites([])
    setWorkers([])
    setJobs([])
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
        .select('id, role, full_name, phone, active, avatar_url')
        .eq('id', s.user.id)
        .single()

      if (profErr) throw new Error(profErr.message)
      if (!prof) throw new Error('Профиль не найден')
      if (!prof.active) throw new Error('Профиль отключён')
      if (prof.role !== 'admin') throw new Error(t('err_admin_only'))
      setMe(prof as Profile)

      const [sitesRes, workersRes, jobsRes] = await Promise.all([
        apiJson<{ sites: Site[] }>('/api/admin/sites', s),
        apiJson<{ workers: WorkerRow[] }>('/api/admin/workers', s),
        apiJson<{ jobs: JobRow[] }>(`/api/admin/jobs?from=${encodeURIComponent(addDays(todayIso, -60))}&to=${encodeURIComponent(todayIso)}`, s),
      ])

      setSites(sitesRes.sites)
      setWorkers(workersRes.workers)
      setJobs(jobsRes.jobs)
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

  async function workerCreate() {
    setError(null)
    setInfo(null)
    const email = newEmail.trim()
    const password = newPass.trim()
    if (!email || !password) {
      setError(t('err_required'))
      return
    }

    setWorkerBusy(true)
    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson('/api/admin/workers', s, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          full_name: newName.trim() || null,
          phone: newPhone.trim() || null,
        }),
      })
      setNewEmail('')
      setNewPass('')
      setNewName('')
      setNewPhone('')
      setInfo(t('msg_created'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    } finally {
      setWorkerBusy(false)
    }
  }

  async function workerToggleActive(id: string, active: boolean) {
    setError(null)
    setInfo(null)
    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson(`/api/admin/workers/${id}`, s, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      })
      setInfo(t('msg_saved'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  async function workerResetPassword(id: string) {
    setError(null)
    setInfo(null)
    const password = prompt('Новый пароль (минимум 6 символов):')?.trim() || ''
    if (password.length < 6) return
    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson(`/api/admin/workers/${id}`, s, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      })
      setInfo(t('msg_saved'))
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  async function workerDelete(id: string) {
    setError(null)
    setInfo(null)
    const ok = confirm('Удалить работника НАВСЕГДА? Это удалит его задачи и логи.')
    if (!ok) return
    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson(`/api/admin/workers/${id}`, s, { method: 'DELETE' })
      setInfo(t('msg_deleted'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  function siteResetForm() {
    setSiteEditId(null)
    setSiteName('')
    setSiteAddress('')
    setSiteLat('')
    setSiteLng('')
    setSiteRadius('100')
    setSiteNotes('')
  }

  function siteFillForm(s: Site) {
    setSiteEditId(s.id)
    setSiteName(s.name)
    setSiteAddress(s.address ?? '')
    setSiteLat(s.lat == null ? '' : String(s.lat))
    setSiteLng(s.lng == null ? '' : String(s.lng))
    setSiteRadius(String(s.radius_m ?? 100))
    setSiteNotes(s.notes ?? '')
  }

  async function siteSave() {
    setError(null)
    setInfo(null)

    const name = siteName.trim()
    if (!name) {
      setError(t('err_required'))
      return
    }

    const radius = Number(siteRadius)
    if (!Number.isFinite(radius) || radius <= 0) {
      setError(t('err_bad_number'))
      return
    }

    const lat = siteLat.trim() === '' ? null : Number(siteLat)
    const lng = siteLng.trim() === '' ? null : Number(siteLng)
    if (lat != null && !Number.isFinite(lat)) {
      setError(t('err_bad_number'))
      return
    }
    if (lng != null && !Number.isFinite(lng)) {
      setError(t('err_bad_number'))
      return
    }

    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      const body = {
        name,
        address: siteAddress.trim() || null,
        lat,
        lng,
        radius_m: radius,
        notes: siteNotes.trim() || null,
      }

      if (siteEditId) {
        await apiJson(`/api/admin/sites/${siteEditId}`, s, { method: 'PUT', body: JSON.stringify(body) })
        setInfo(t('msg_saved'))
      } else {
        await apiJson('/api/admin/sites', s, { method: 'POST', body: JSON.stringify(body) })
        setInfo(t('msg_created'))
      }

      siteResetForm()
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  async function siteDelete(id: string) {
    setError(null)
    setInfo(null)
    const ok = confirm('Удалить объект? Это удалит связанные задачи и логи.')
    if (!ok) return

    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson(`/api/admin/sites/${id}`, s, { method: 'DELETE' })
      setInfo(t('msg_deleted'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  async function jobCreate() {
    setError(null)
    setInfo(null)

    if (!jobWorkerId || !jobSiteId || !jobDate) {
      setError(t('err_required'))
      return
    }

    const planned = jobPlan.trim() === '' ? null : Number(jobPlan)
    if (planned != null && (!Number.isFinite(planned) || planned <= 0)) {
      setError(t('err_bad_number'))
      return
    }

    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson('/api/admin/jobs', s, {
        method: 'POST',
        body: JSON.stringify({
          worker_id: jobWorkerId,
          site_id: jobSiteId,
          job_date: jobDate,
          scheduled_time: jobTime.trim() || null,
          planned_minutes: planned,
        }),
      })

      setJobTime('')
      setInfo(t('msg_created'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  async function jobDelete(id: string) {
    setError(null)
    setInfo(null)
    const ok = confirm('Удалить задачу? Это удалит и её логи.')
    if (!ok) return

    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      await apiJson(`/api/admin/jobs/${id}`, s, { method: 'DELETE' })
      setInfo(t('msg_deleted'))
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    }
  }

  async function runReports(from: string, to: string, workerId?: string) {
    setError(null)
    setInfo(null)
    setRepBusy(true)

    try {
      const s = session
      if (!s) throw new Error('Нет сессии')
      const qs = new URLSearchParams({ from, to })
      if (workerId) qs.set('worker_id', workerId)

      const out = await apiJson<ReportResponse>(`/api/admin/reports?${qs.toString()}`, s)
      setRep(out)
      setInfo(t('card_ok'))
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    } finally {
      setRepBusy(false)
    }
  }

  function applyPreset(days: number) {
    const to = todayIso
    const from = addDays(to, -(days - 1))
    setRepFrom(from)
    setRepTo(to)
    setRep(null)
  }

  async function loadSchedule() {
    setError(null)
    setInfo(null)
    setSchBusy(true)

    try {
      const s = session
      if (!s) throw new Error('Нет сессии')

      const from = schDate
      const to = schMode === 'day' ? schDate : addDays(schDate, 6)

      const out = await apiJson<{ jobs: JobRow[] }>(`/api/admin/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, s)
      setSchJobs(out.jobs)
    } catch (e: any) {
      setError(e?.message || 'Ошибка')
    } finally {
      setSchBusy(false)
    }
  }

  useEffect(() => {
    if (tab !== 'schedule') return
    loadSchedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, schMode, schDate, session?.access_token])

  const headerName = me?.full_name?.trim() || session?.user?.email || '—'
  const avatarSrc = me?.avatar_url || ''

  return (
    <div className="min-h-screen safe-pad">
      <div className="mx-auto w-full max-w-6xl px-4">
        <header className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-3 backdrop-blur-xl bg-black/30 border-b border-stroke">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-card border border-stroke shadow-lux overflow-hidden shrink-0">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Image src="/tanija-logo.png" alt="Tanija" width={80} height={80} className="h-full w-full object-contain p-1" priority />
                )}
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-base font-semibold truncate">
                  {t('title')} <span className="text-gold">Tanija</span>
                </div>
                <div className="text-xs text-muted truncate">{headerName}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <LangSwitch lang={lang} onChange={setLangPersist} label={t('lang_label')} labelRU={t('lang_ru')} labelUA={t('lang_uk')} />

              <Link className="btn-ghost" href="/">
                {t('btn_home')}
              </Link>

              <button className="btn-ghost" onClick={loadAll} disabled={loading}>
                {t('btn_refresh')}
              </button>
              <button className="btn" onClick={signOut}>
                {t('btn_logout')}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className={tab === 'workers' ? 'chip chip-gold' : 'chip'} onClick={() => setTab('workers')} type="button">
              {t('tab_workers')}
            </button>
            <button className={tab === 'sites' ? 'chip chip-gold' : 'chip'} onClick={() => setTab('sites')} type="button">
              {t('tab_sites')}
            </button>
            <button className={tab === 'jobs' ? 'chip chip-gold' : 'chip'} onClick={() => setTab('jobs')} type="button">
              {t('tab_jobs')}
            </button>
            <button className={tab === 'reports' ? 'chip chip-gold' : 'chip'} onClick={() => setTab('reports')} type="button">
              {t('tab_reports')}
            </button>
            <button className={tab === 'schedule' ? 'chip chip-gold' : 'chip'} onClick={() => setTab('schedule')} type="button">
              {t('tab_schedule')}
            </button>
            <span className="ml-auto text-xs text-muted">
              {loading ? t('state_loading') : t('state_ready')}
              {schBusy || repBusy || workerBusy ? ' • …' : ''}
            </span>
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
            {tab === 'workers' ? (
              <>
                <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                  <div className="section-title">{t('sec_workers_create')}</div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input className="input" placeholder={t('worker_email_ph')} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                    <input className="input" placeholder={t('worker_pass_ph')} type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                    <input className="input" placeholder={t('worker_name_ph')} value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <input className="input" placeholder={t('worker_phone_ph')} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                  </div>
                  <div className="mt-4">
                    <button className="btn w-full md:w-auto" onClick={workerCreate} disabled={workerBusy || loading || !newEmail.trim() || !newPass.trim()}>
                      {workerBusy ? t('btn_worker_creating') : t('btn_worker_create')}
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                  <div className="section-title">{t('sec_workers_list')}</div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {workers.map((w) => (
                      <div key={w.id} className="rounded-3xl border border-stroke bg-card2 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-12 w-12 rounded-2xl bg-card border border-stroke shadow-lux overflow-hidden shrink-0">
                              {w.avatar_url ? <img src={w.avatar_url} alt="" className="h-full w-full object-cover" /> : <Image src="/tanija-logo.png" alt="" width={80} height={80} className="h-full w-full object-contain p-2" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{w.full_name || '—'}</div>
                              <div className="text-xs text-muted truncate">{w.email || w.id}</div>
                              <div className="text-xs text-muted truncate">{w.phone || '—'}</div>
                            </div>
                          </div>
                          <span className={w.active ? 'chip chip-ok' : 'chip chip-bad'}>{w.active ? t('worker_active') : t('worker_disabled')}</span>
                        </div>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          {w.active ? (
                            <button className="btn-ghost w-full" onClick={() => workerToggleActive(w.id, false)} type="button">
                              {t('btn_worker_disable')}
                            </button>
                          ) : (
                            <button className="btn w-full" onClick={() => workerToggleActive(w.id, true)} type="button">
                              {t('btn_worker_enable')}
                            </button>
                          )}
                          <button className="btn-ghost w-full" onClick={() => workerResetPassword(w.id)} type="button">
                            {t('btn_worker_setpass')}
                          </button>
                          <button className="btn-ghost w-full" onClick={() => workerDelete(w.id)} type="button">
                            {t('btn_worker_delete')}
                          </button>
                        </div>
                      </div>
                    ))}

                    {!loading && workers.length === 0 ? (
                      <div className="rounded-3xl border border-stroke bg-card p-6 md:col-span-2">
                        <div className="section-title">{t('empty_title')}</div>
                        <div className="mt-2 text-sm text-muted">{t('empty_text')}</div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {tab === 'sites' ? (
              <>
                <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                  <div className="section-title">{t('sec_site_form')}</div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input className="input" placeholder={t('site_name_ph')} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                    <input className="input" placeholder={t('site_address_ph')} value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
                    <input className="input" inputMode="decimal" placeholder={t('site_lat_ph')} value={siteLat} onChange={(e) => setSiteLat(e.target.value)} />
                    <input className="input" inputMode="decimal" placeholder={t('site_lng_ph')} value={siteLng} onChange={(e) => setSiteLng(e.target.value)} />
                    <input className="input" inputMode="numeric" placeholder={t('site_radius_ph')} value={siteRadius} onChange={(e) => setSiteRadius(e.target.value)} />
                    <input className="input" placeholder={t('site_notes_ph')} value={siteNotes} onChange={(e) => setSiteNotes(e.target.value)} />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button className="btn w-full sm:w-auto" onClick={siteSave} disabled={loading}>
                      {siteEditId ? t('btn_site_save') : t('btn_site_create')}
                    </button>
                    <button className="btn-ghost w-full sm:w-auto" onClick={siteResetForm} type="button">
                      {t('btn_site_cancel')}
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                  <div className="section-title">{t('sec_sites_list')}</div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {sites.map((s) => (
                      <div key={s.id} className="rounded-3xl border border-stroke bg-card2 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{s.name}</div>
                            <div className="mt-1 text-xs text-muted">{s.address ?? '—'}</div>
                            {s.notes ? <div className="mt-2 text-xs text-muted">{s.notes}</div> : null}
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="chip chip-gold">radius {s.radius_m}m</span>
                              {s.lat == null || s.lng == null ? <span className="chip chip-bad">GPS: нет</span> : <span className="chip chip-ok">GPS: ok</span>}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <button className="btn-ghost w-full" onClick={() => siteFillForm(s)} type="button">
                            {t('btn_site_edit')}
                          </button>
                          <button className="btn-ghost w-full" onClick={() => siteDelete(s.id)} type="button">
                            {t('btn_site_delete')}
                          </button>
                        </div>
                      </div>
                    ))}

                    {!loading && sites.length === 0 ? (
                      <div className="rounded-3xl border border-stroke bg-card p-6 md:col-span-2">
                        <div className="section-title">{t('empty_title')}</div>
                        <div className="mt-2 text-sm text-muted">{t('empty_text')}</div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {tab === 'jobs' ? (
              <>
                <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                  <div className="section-title">{t('sec_job_create')}</div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <select className="input" value={jobWorkerId} onChange={(e) => setJobWorkerId(e.target.value)}>
                      <option value="">{t('job_worker_ph')}</option>
                      {workers.filter((w) => w.active).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.full_name || w.email || w.id}
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

                    <input className="input md:col-span-2" placeholder={t('job_plan_ph')} value={jobPlan} onChange={(e) => setJobPlan(e.target.value)} />
                  </div>

                  <div className="mt-4">
                    <button className="btn w-full md:w-auto" onClick={jobCreate} disabled={loading}>
                      {t('btn_job_create')}
                    </button>
                  </div>
                </section>

                <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="section-title">{t('sec_jobs_list')}</div>
                    <div className="flex flex-wrap gap-2">
                      <button className={filter === 'all' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('all')} type="button">
                        {t('filter_all')}
                      </button>
                      <button className={filter === 'planned' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('planned')} type="button">
                        {t('filter_planned')}
                      </button>
                      <button className={filter === 'in_progress' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('in_progress')} type="button">
                        {t('filter_in_progress')}
                      </button>
                      <button className={filter === 'done' ? 'chip chip-gold' : 'chip'} onClick={() => setFilter('done')} type="button">
                        {t('filter_done')}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {filteredJobs.map((j) => (
                      <div key={j.id} className="rounded-3xl border border-stroke bg-card2 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-10 w-10 rounded-2xl bg-card border border-stroke shadow-lux overflow-hidden shrink-0">
                              {j.profiles?.avatar_url ? (
                                <img src={j.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Image src="/tanija-logo.png" alt="" width={80} height={80} className="h-full w-full object-contain p-2" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{j.sites?.name ?? '—'}</div>
                              <div className="mt-1 text-xs text-muted truncate">{j.sites?.address ?? '—'}</div>
                              <div className="mt-2 text-xs">
                                <span className="text-muted">{t('field_worker')}:</span>{' '}
                                <span className="font-semibold">{j.profiles?.full_name ?? j.worker_id}</span>
                              </div>
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
                            <div className="text-muted">{t('field_plan')}</div>
                            <div className="mt-1 font-semibold">{j.planned_minutes ? `${j.planned_minutes} мин` : '—'}</div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <button className="btn-ghost w-full" onClick={() => jobDelete(j.id)} type="button">
                            {t('btn_job_delete')}
                          </button>
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
              </>
            ) : null}

            {tab === 'reports' ? (
              <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                <div className="section-title">{t('sec_reports')}</div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-stroke bg-card2 px-4 py-3">
                    <div className="text-xs text-muted">{t('rep_from')}</div>
                    <input className="mt-2 input" type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
                  </div>
                  <div className="rounded-2xl border border-stroke bg-card2 px-4 py-3">
                    <div className="text-xs text-muted">{t('rep_to')}</div>
                    <input className="mt-2 input" type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} />
                  </div>
                  <div className="rounded-2xl border border-stroke bg-card2 px-4 py-3">
                    <div className="text-xs text-muted">{t('rep_worker')}</div>
                    <select className="mt-2 input" value={repWorker} onChange={(e) => setRepWorker(e.target.value)}>
                      <option value="">{t('rep_worker_all')}</option>
                      {workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.full_name || w.email || w.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="chip" onClick={() => applyPreset(7)} type="button">
                    {t('preset_7')}
                  </button>
                  <button className="chip" onClick={() => applyPreset(14)} type="button">
                    {t('preset_14')}
                  </button>
                  <button className="chip" onClick={() => applyPreset(30)} type="button">
                    {t('preset_30')}
                  </button>
                  <button className="chip" onClick={() => applyPreset(60)} type="button">
                    {t('preset_60')}
                  </button>
                  <button className="chip" onClick={() => applyPreset(365)} type="button">
                    {t('preset_365')}
                  </button>

                  <button className="btn ml-auto" onClick={() => runReports(repFrom, repTo, repWorker)} disabled={repBusy}>
                    {t('btn_rep_run')}
                  </button>
                </div>

                {rep ? (
                  <div className="mt-6 space-y-6">
                    <div className="rounded-3xl border border-stroke bg-card2 p-5">
                      <div className="text-sm font-semibold">{t('rep_total')}</div>
                      <div className="mt-2 text-2xl font-extrabold">
                        {rep.total_hours} ч <span className="text-muted">({rep.total_minutes} мин)</span>
                      </div>
                      <div className="mt-2 text-xs text-muted">
                        {formatDateDMY(rep.from)} — {formatDateDMY(rep.to)}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-stroke bg-card2 p-5">
                      <div className="text-sm font-semibold">{t('rep_by_worker')}</div>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {rep.by_worker.map((w) => (
                          <div key={w.worker_id} className="rounded-2xl border border-stroke bg-card px-4 py-3 flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-card border border-stroke shadow-lux overflow-hidden shrink-0">
                              {w.avatar_url ? <img src={w.avatar_url} alt="" className="h-full w-full object-cover" /> : <Image src="/tanija-logo.png" alt="" width={80} height={80} className="h-full w-full object-contain p-2" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{w.worker_name || w.worker_id}</div>
                              <div className="text-xs text-muted">{w.hours} ч ({w.minutes} мин)</div>
                            </div>
                          </div>
                        ))}
                        {rep.by_worker.length === 0 ? <div className="text-sm text-muted">{t('empty_text')}</div> : null}
                      </div>
                    </div>

                    {rep.incomplete?.length ? (
                      <div className="rounded-3xl border border-stroke bg-card2 p-5">
                        <div className="text-sm font-semibold">{t('rep_incomplete')}</div>
                        <div className="mt-3 space-y-2 text-sm">
                          {rep.incomplete.map((r) => (
                            <div key={r.job_id} className="rounded-2xl border border-stroke bg-card px-4 py-3">
                              <div className="text-xs text-muted">job_id: {r.job_id}</div>
                              <div className="mt-1">worker_id: {r.worker_id}</div>
                              <div className="mt-1 text-xs text-muted">started: {formatDateTimeDMYHM(r.started_at)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-3xl border border-stroke bg-card2 p-5">
                      <div className="text-sm font-semibold">{t('rep_rows')}</div>
                      <div className="mt-4 grid grid-cols-1 gap-3">
                        {rep.rows.map((r) => (
                          <div key={`${r.job_id}-${r.started_at}`} className="rounded-2xl border border-stroke bg-card px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{r.site_name || '—'}</div>
                                <div className="text-xs text-muted truncate">{r.worker_name || r.worker_id}</div>
                              </div>
                              <span className={statusChipClass(r.status)}>{t(statusKey(r.status))}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted">{t('field_date')}:</span> <span className="font-semibold">{formatDateDMY(r.job_date)}</span>
                              </div>
                              <div>
                                <span className="text-muted">{t('field_time')}:</span> <span className="font-semibold">{r.scheduled_time ?? '—'}</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-muted">{t('field_fact')}:</span>{' '}
                                <span className="font-semibold">{r.minutes} мин</span>
                                {r.planned_minutes ? <span className="text-muted"> • план {r.planned_minutes} мин</span> : null}
                              </div>
                              <div className="col-span-2 text-muted">{formatDateTimeDMYHM(r.started_at)} → {formatDateTimeDMYHM(r.ended_at)}</div>
                            </div>
                          </div>
                        ))}
                        {rep.rows.length === 0 ? <div className="text-sm text-muted">{t('empty_text')}</div> : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === 'schedule' ? (
              <section className="rounded-3xl border border-stroke bg-card shadow-lux p-5">
                <div className="section-title">{t('sec_schedule')}</div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button className={schMode === 'day' ? 'chip chip-gold' : 'chip'} onClick={() => setSchMode('day')} type="button">
                      {t('sch_day')}
                    </button>
                    <button className={schMode === 'week' ? 'chip chip-gold' : 'chip'} onClick={() => setSchMode('week')} type="button">
                      {t('sch_week')}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-stroke bg-card2 px-4 py-3 w-full md:w-auto">
                    <div className="text-xs text-muted">{t('sch_date')}</div>
                    <input className="mt-2 input" type="date" value={schDate} onChange={(e) => setSchDate(e.target.value)} />
                  </div>

                  <button className="btn" onClick={loadSchedule} disabled={schBusy}>
                    {t('btn_refresh')}
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  {(() => {
                    const groups: Record<string, JobRow[]> = {}
                    for (const j of schJobs) {
                      if (!groups[j.job_date]) groups[j.job_date] = []
                      groups[j.job_date].push(j)
                    }
                    const dates = Object.keys(groups).sort()
                    return dates.map((d) => (
                      <div key={d} className="rounded-3xl border border-stroke bg-card2 p-5">
                        <div className="text-sm font-semibold">{formatDateDMY(d)}</div>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          {groups[d].map((j) => (
                            <div key={j.id} className="rounded-2xl border border-stroke bg-card px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="h-10 w-10 rounded-2xl bg-card border border-stroke shadow-lux overflow-hidden shrink-0">
                                    {j.profiles?.avatar_url ? (
                                      <img src={j.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <Image
                                        src="/tanija-logo.png"
                                        alt=""
                                        width={80}
                                        height={80}
                                        className="h-full w-full object-contain p-2"
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">{j.sites?.name ?? '—'}</div>
                                    <div className="text-xs text-muted truncate">{j.sites?.address ?? '—'}</div>
                                    <div className="mt-1 text-xs">
                                      <span className="text-muted">{t('field_worker')}:</span>{' '}
                                      <span className="font-semibold">{j.profiles?.full_name ?? j.worker_id}</span>
                                    </div>
                                    <div className="mt-2 text-xs">
                                      <span className="text-muted">{t('field_time')}:</span>{' '}
                                      <span className="font-semibold">{j.scheduled_time ?? '—'}</span>
                                      {j.planned_minutes ? <span className="text-muted"> • {t('field_plan')}: {j.planned_minutes}м</span> : null}
                                    </div>
                                  </div>
                                </div>
                                <span className={statusChipClass(j.status)}>{t(statusKey(j.status))}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}

                  {!schBusy && schJobs.length === 0 ? (
                    <div className="rounded-3xl border border-stroke bg-card p-6">
                      <div className="section-title">{t('empty_title')}</div>
                      <div className="mt-2 text-sm text-muted">{t('empty_text')}</div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </main>
        )}

        <footer className="mt-8 pb-6 text-center text-xs text-muted">
          <span className="text-gold">{UI_BUILD}</span>
        </footer>
      </div>
    </div>
  )
}
