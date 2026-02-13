// app/page.tsx
'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type JobStatus = 'planned' | 'in_progress' | 'done' | 'cancelled' | string;

type SiteRow = {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};

type JobRow = {
  id: string;
  title: string | null;
  job_date: string | null; // YYYY-MM-DD
  scheduled_time: string | null; // HH:MM[:SS]
  status: JobStatus;
  site?: SiteRow | null;
  site_id?: string | null;
};

type UserLite = {
  id: string;
  email?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatDateDDMMYYYY(isoDate: string | null) {
  if (!isoDate) return '—';
  const s = String(isoDate);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}

function formatDateTimeDDMMYYYYHHMM(dateISO: string | null, timeISO: string | null) {
  const d = formatDateDDMMYYYY(dateISO);
  if (!timeISO) return d === '—' ? '—' : `${d} —`;
  const t = String(timeISO).slice(0, 5);
  return d === '—' ? `— ${t}` : `${d} ${t}`;
}

function statusLabel(status: JobStatus) {
  switch (status) {
    case 'planned':
      return 'Запланировано';
    case 'in_progress':
      return 'В работе';
    case 'done':
      return 'Завершено';
    case 'cancelled':
      return 'Отменено';
    default:
      return '—';
  }
}

function statusPillClass(status: JobStatus) {
  switch (status) {
    case 'planned':
      return 'border-amber-500/30 text-amber-200/90 bg-amber-500/5';
    case 'in_progress':
      return 'border-amber-500/45 text-amber-100 bg-amber-500/10';
    case 'done':
      return 'border-emerald-500/25 text-emerald-200/90 bg-emerald-500/5';
    case 'cancelled':
      return 'border-red-500/25 text-red-200/90 bg-red-500/5';
    default:
      return 'border-white/10 text-white/70 bg-white/5';
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getGeoPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Геолокация недоступна на этом устройстве.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export default function Page() {
  const [user, setUser] = useState<UserLite | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const [filter, setFilter] = useState<'planned' | 'in_progress' | 'done'>('planned');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    const f = filter;
    return jobs.filter((j) => (j.status || 'planned') === f);
  }, [jobs, filter]);

  async function loadUser() {
    const { data, error: e } = await supabase.auth.getUser();
    if (e || !data?.user) {
      setUser(null);
      return;
    }
    setUser({ id: data.user.id, email: data.user.email });
  }

  async function loadJobs() {
    setLoading(true);
    setError(null);
    setInfo(null);

    const { data, error: e } = await supabase
      .from('jobs')
      .select('id,title,job_date,scheduled_time,status,site:sites(id,name,lat,lng,radius)')
      .order('job_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (e) {
      setJobs([]);
      setError(e.message || 'Ошибка загрузки смен.');
      setLoading(false);
      return;
    }

    setJobs((data as unknown as JobRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await loadUser();
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      await loadUser();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function signIn() {
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (e) {
      setError(e.message || 'Ошибка входа.');
      return;
    }
    setPassword('');
  }

  async function signOut() {
    setError(null);
    setInfo(null);
    await supabase.auth.signOut();
    setJobs([]);
    setFilter('planned');
  }

  async function tryInsertStart(jobId: string, workerId: string, pos?: GeolocationPosition) {
    const started_at = new Date().toISOString();

    const payloads: Record<string, any>[] = pos
      ? [
          {
            job_id: jobId,
            worker_id: workerId,
            started_at,
            start_lat: pos.coords.latitude,
            start_lng: pos.coords.longitude,
            start_accuracy: pos.coords.accuracy,
          },
          { job_id: jobId, worker_id: workerId, started_at },
          { job_id: jobId, started_at },
        ]
      : [{ job_id: jobId, worker_id: workerId, started_at }, { job_id: jobId, started_at }];

    let lastErr: any = null;
    for (const p of payloads) {
      const { error: e } = await supabase.from('time_logs').insert(p);
      if (!e) return;
      lastErr = e;
    }
    throw lastErr || new Error('Не удалось записать старт.');
  }

  async function tryUpdateStop(jobId: string, workerId: string, pos?: GeolocationPosition) {
    const stopped_at = new Date().toISOString();

    const stopPayloads: Record<string, any>[] = pos
      ? [
          {
            stopped_at,
            stop_lat: pos.coords.latitude,
            stop_lng: pos.coords.longitude,
            stop_accuracy: pos.coords.accuracy,
          },
          { stopped_at },
        ]
      : [{ stopped_at }];

    // Берём последнюю запись по job_id (а если есть worker_id — отлично)
    const { data: rowsA, error: eA } = await supabase
      .from('time_logs')
      .select('id,job_id,worker_id,started_at')
      .eq('job_id', jobId)
      .order('started_at', { ascending: false })
      .limit(5);

    if (eA || !rowsA || rowsA.length === 0) {
      throw new Error('Нет записи старта по этой смене (или схема БД ещё не приведена к контракту).');
    }

    const pick =
      (rowsA as any[]).find((r) => r.worker_id === workerId) || (rowsA as any[])[0];

    let lastErr: any = null;
    for (const upd of stopPayloads) {
      const { error: e } = await supabase.from('time_logs').update(upd).eq('id', pick.id);
      if (!e) return;
      lastErr = e;
    }
    throw lastErr || new Error('Не удалось записать стоп.');
  }

  async function startJob(job: JobRow) {
    setError(null);
    setInfo(null);

    if (!user?.id) {
      setError('Нужно войти.');
      return;
    }

    if (!job?.id) {
      setError('Не найден id смены.');
      return;
    }

    if (job.status !== 'planned') {
      setError('Старт доступен только для запланированных смен.');
      return;
    }

    const s = job.site || null;
    if (!s || s.lat == null || s.lng == null) {
      setError('У объекта нет координат. Старт запрещён.');
      return;
    }

    const radius = s.radius ?? 0;
    if (!radius || radius <= 0) {
      setError('У объекта не задан радиус. Старт запрещён.');
      return;
    }

    setBusyJobId(job.id);

    try {
      const pos = await getGeoPosition();

      if (pos.coords.accuracy > 80) {
        setError(`Точность GPS слишком низкая: ${Math.round(pos.coords.accuracy)} м (нужно ≤ 80 м).`);
        return;
      }

      const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng);
      if (dist > radius) {
        setError(`Вы далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).`);
        return;
      }

      await tryInsertStart(job.id, user.id, pos);

      const { error: eJ } = await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', job.id);
      if (eJ) throw eJ;

      await loadJobs();
      setInfo('Старт зафиксирован.');
    } catch (e: any) {
      setError(e?.message || 'Ошибка старта.');
    } finally {
      setBusyJobId(null);
    }
  }

  async function stopJob(job: JobRow) {
    setError(null);
    setInfo(null);

    if (!user?.id) {
      setError('Нужно войти.');
      return;
    }

    if (!job?.id) {
      setError('Не найден id смены.');
      return;
    }

    if (job.status !== 'in_progress') {
      setError('Стоп доступен только для смен в работе.');
      return;
    }

    const s = job.site || null;
    if (!s || s.lat == null || s.lng == null) {
      setError('У объекта нет координат. Стоп запрещён.');
      return;
    }

    const radius = s.radius ?? 0;
    if (!radius || radius <= 0) {
      setError('У объекта не задан радиус. Стоп запрещён.');
      return;
    }

    setBusyJobId(job.id);

    try {
      const pos = await getGeoPosition();

      if (pos.coords.accuracy > 80) {
        setError(`Точность GPS слишком низкая: ${Math.round(pos.coords.accuracy)} м (нужно ≤ 80 м).`);
        return;
      }

      const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng);
      if (dist > radius) {
        setError(`Вы далеко от объекта: ${Math.round(dist)} м (нужно ≤ ${Math.round(radius)} м).`);
        return;
      }

      await tryUpdateStop(job.id, user.id, pos);

      const { error: eJ } = await supabase.from('jobs').update({ status: 'done' }).eq('id', job.id);
      if (eJ) throw eJ;

      await loadJobs();
      setInfo('Стоп зафиксирован.');
    } catch (e: any) {
      setError(e?.message || 'Ошибка стопа.');
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,215,0,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(255,215,0,0.05),transparent_60%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-amber-500/20 bg-black/40 shadow-[0_0_0_1px_rgba(255,215,0,0.06)]">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-2" priority />
            </div>
            <div className="leading-tight">
              <div className="text-xl font-semibold tracking-wide">Cleaning Timeclock</div>
              <div className="text-sm text-amber-200/70">Tanija • кабинет работника</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadJobs()}
              className="rounded-full border border-amber-500/25 bg-black/30 px-5 py-2 text-sm text-amber-100 hover:border-amber-500/45 hover:bg-black/40 active:scale-[0.99]"
            >
              Обновить
            </button>
            {user ? (
              <button
                onClick={() => signOut()}
                className="rounded-full border border-amber-500/25 bg-black/30 px-5 py-2 text-sm text-amber-100 hover:border-amber-500/45 hover:bg-black/40 active:scale-[0.99]"
              >
                Выйти
              </button>
            ) : null}
          </div>
        </header>

        <main className="mt-8 rounded-[28px] border border-amber-500/15 bg-black/35 p-8 shadow-[0_0_0_1px_rgba(255,215,0,0.05),0_20px_60px_rgba(0,0,0,0.55)]">
          {!user ? (
            <div className="mx-auto max-w-md">
              <div className="text-2xl font-semibold">Вход</div>
              <div className="mt-2 text-sm text-white/70">Только для сотрудников.</div>

              {error ? (
                <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <div className="mt-6 space-y-3">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Почта"
                  className="w-full rounded-2xl border border-amber-500/15 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-amber-500/35"
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Пароль"
                  type="password"
                  className="w-full rounded-2xl border border-amber-500/15 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-amber-500/35"
                />
                <button
                  onClick={() => signIn()}
                  className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 hover:border-amber-500/45 hover:bg-amber-500/15 active:scale-[0.99]"
                >
                  Войти
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-3xl font-semibold">Мои смены</div>
                  <div className="mt-1 text-sm text-white/65">Формат времени: ДД-ММ-ГГГГ ЧЧ:ММ</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilter('planned')}
                    className={[
                      'rounded-full border px-5 py-2 text-sm',
                      filter === 'planned'
                        ? 'border-amber-500/45 bg-amber-500/12 text-amber-100'
                        : 'border-white/10 bg-white/5 text-white/75 hover:border-amber-500/25 hover:text-amber-100',
                    ].join(' ')}
                  >
                    Запланировано
                  </button>
                  <button
                    onClick={() => setFilter('in_progress')}
                    className={[
                      'rounded-full border px-5 py-2 text-sm',
                      filter === 'in_progress'
                        ? 'border-amber-500/45 bg-amber-500/12 text-amber-100'
                        : 'border-white/10 bg-white/5 text-white/75 hover:border-amber-500/25 hover:text-amber-100',
                    ].join(' ')}
                  >
                    В работе
                  </button>
                  <button
                    onClick={() => setFilter('done')}
                    className={[
                      'rounded-full border px-5 py-2 text-sm',
                      filter === 'done'
                        ? 'border-amber-500/45 bg-amber-500/12 text-amber-100'
                        : 'border-white/10 bg-white/5 text-white/75 hover:border-amber-500/25 hover:text-amber-100',
                    ].join(' ')}
                  >
                    Завершено
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              {info ? (
                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-5 py-4 text-sm text-amber-100">
                  {info}
                </div>
              ) : null}

              <div className="mt-6 space-y-4">
                {loading ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-sm text-white/70">
                    Загружаю смены…
                  </div>
                ) : filteredJobs.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-6 text-sm text-white/70">
                    Нет смен в этом разделе.
                  </div>
                ) : (
                  filteredJobs.map((j) => {
                    const title = (j.title && String(j.title).trim()) || 'Смена';
                    const when = formatDateTimeDDMMYYYYHHMM(j.job_date, j.scheduled_time);
                    const pill = statusLabel(j.status);
                    const pillCls = statusPillClass(j.status);

                    const canStart = j.status === 'planned';
                    const canStop = j.status === 'in_progress';
                    const busy = busyJobId === j.id;

                    return (
                      <div
                        key={j.id}
                        className="rounded-[22px] border border-amber-500/15 bg-black/25 px-6 py-5 shadow-[0_0_0_1px_rgba(255,215,0,0.04)]"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-lg font-semibold">{title}</div>
                            <div className="mt-1 text-sm text-white/70">
                              План: <span className="text-white/85">{when}</span>
                            </div>
                            {j.site?.name ? (
                              <div className="mt-1 text-xs text-white/55">
                                Объект: <span className="text-white/70">{j.site.name}</span>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-3">
                            {canStart ? (
                              <button
                                onClick={() => startJob(j)}
                                disabled={busy}
                                className={[
                                  'rounded-full border px-6 py-2 text-sm font-semibold',
                                  busy
                                    ? 'cursor-not-allowed border-amber-500/15 bg-amber-500/6 text-amber-100/40'
                                    : 'border-amber-500/35 bg-amber-500/12 text-amber-100 hover:border-amber-500/55 hover:bg-amber-500/16 active:scale-[0.99]',
                                ].join(' ')}
                              >
                                {busy ? 'СТАРТ…' : 'СТАРТ'}
                              </button>
                            ) : null}

                            {canStop ? (
                              <button
                                onClick={() => stopJob(j)}
                                disabled={busy}
                                className={[
                                  'rounded-full border px-6 py-2 text-sm font-semibold',
                                  busy
                                    ? 'cursor-not-allowed border-amber-500/15 bg-amber-500/6 text-amber-100/40'
                                    : 'border-amber-500/35 bg-amber-500/12 text-amber-100 hover:border-amber-500/55 hover:bg-amber-500/16 active:scale-[0.99]',
                                ].join(' ')}
                              >
                                {busy ? 'СТОП…' : 'СТОП'}
                              </button>
                            ) : null}

                            <span className={`rounded-full border px-4 py-2 text-xs ${pillCls}`}>{pill}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </main>

        <footer className="relative mt-10 text-center text-xs text-white/45">
          © 2026 Tanija • dark & gold, без лишней драмы
        </footer>
      </div>
    </div>
  );
}
