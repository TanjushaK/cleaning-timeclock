// app/page.tsx
'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from '@/lib/auth-fetch';

type JobStatus = 'planned' | 'in_progress' | 'done' | 'cancelled' | string;

type SiteLite = {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
};

type JobRow = {
  id: string;
  title: string | null;
  job_date: string | null;
  scheduled_time: string | null;
  status: JobStatus;
  site: SiteLite | null;
};

type ProfileLite = {
  id: string;
  email?: string | null;
  role?: string | null;
  full_name?: string | null;
};

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
  const t = timeISO ? String(timeISO).slice(0, 5) : null;
  if (d === '—' && !t) return '—';
  if (d === '—' && t) return `— ${t}`;
  if (d !== '—' && !t) return `${d} —`;
  return `${d} ${t}`;
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
      return String(status || '—');
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

export default function WorkerPage() {
  const [me, setMe] = useState<ProfileLite | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'planned' | 'in_progress' | 'done'>('planned');

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const arr: JobRow[] = Array.isArray(jobs) ? jobs : [];
    return arr.filter((j) => (j?.status || 'planned') === tab);
  }, [jobs, tab]);

  async function loadMeAndJobs() {
    setLoading(true);
    setError(null);
    setInfo(null);

    const token = getAccessToken();
    if (!token) {
      setMe(null);
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      const prof = await authFetchJson('/api/me/profile');
      setMe((prof?.profile as ProfileLite) || (prof as ProfileLite) || null);
    } catch (e: any) {
      // если профиль не читается — всё равно попробуем jobs
      setMe(null);
    }

    try {
      const j = await authFetchJson('/api/me/jobs');
      // Ключевая страховка: jobs обязаны быть массивом
      const list = Array.isArray(j?.jobs) ? (j.jobs as JobRow[]) : [];
      setJobs(list);
    } catch (e: any) {
      setJobs([]);
      setError(e?.message || 'Ошибка загрузки смен.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // если токен уже есть (после перезагрузки) — грузим данные
    loadMeAndJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn() {
    setError(null);
    setInfo(null);

    const em = email.trim();
    if (!em || !password) {
      setError('Введите email и пароль.');
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, password }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(json?.error || 'Ошибка входа.');
        return;
      }

      const access = String(json?.access_token || '');
      const refresh = String(json?.refresh_token || '');
      if (!access) {
        setError('Логин прошёл, но токен не пришёл.');
        return;
      }

      setAuthTokens(access, refresh || null);
      setPassword('');
      await loadMeAndJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка входа.');
    }
  }

  function signOut() {
    clearAuthTokens();
    setMe(null);
    setJobs([]);
    setTab('planned');
    setEmail('');
    setPassword('');
    setInfo(null);
    setError(null);
  }

  const authed = !!getAccessToken();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-2 shadow-[0_0_30px_rgba(245,158,11,0.12)]">
            <Image src="/tanija-logo.png" alt="Tanija" width={48} height={48} className="h-full w-full object-contain" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold tracking-tight">Cleaning Timeclock</div>
            <div className="text-sm text-amber-200/70">Tanija • кабинет работника</div>
          </div>
          {authed ? (
            <button
              onClick={signOut}
              className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/10"
            >
              Выйти
            </button>
          ) : null}
        </header>

        <section className="mt-8 rounded-3xl border border-amber-500/20 bg-gradient-to-b from-white/[0.04] to-white/[0.02] p-6 shadow-[0_0_80px_rgba(245,158,11,0.10)]">
          <div className="text-xl font-semibold">{authed ? 'Смены' : 'Вход'}</div>
          <div className="mt-1 text-sm text-white/60">
            {authed ? 'Ваши смены, назначенные в системе.' : 'Введите email и пароль работника.'}
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
          ) : null}
          {info ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{info}</div>
          ) : null}

          {!authed ? (
            <div className="mt-6 space-y-3">
              <div>
                <div className="mb-1 text-xs text-white/60">Email</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-amber-500/40"
                  placeholder="you@domain.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-white/60">Пароль</div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-amber-500/40"
                  placeholder="••••••••"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
              <button
                onClick={signIn}
                className="mt-2 w-full rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-amber-500/5 px-4 py-3 font-medium text-amber-50 hover:from-amber-500/20 hover:to-amber-500/10"
              >
                Войти
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="mr-auto text-sm text-white/60">
                  {me?.email ? (
                    <>
                      Вы вошли как <span className="text-amber-100">{me.email}</span>
                    </>
                  ) : (
                    'Вы вошли.'
                  )}
                </div>
                <div className="flex gap-2">
                  {(['planned', 'in_progress', 'done'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={`rounded-full border px-4 py-2 text-xs ${
                        tab === k
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                          : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {statusLabel(k)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {loading ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/70">Загрузка…</div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/70">Смен нет.</div>
                ) : (
                  filtered.map((j) => (
                    <div
                      key={j.id}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 shadow-[0_0_40px_rgba(0,0,0,0.25)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-white">{j.title || 'Смена'}</div>
                          <div className="mt-1 text-xs text-white/60">
                            {formatDateTimeDDMMYYYYHHMM(j.job_date, j.scheduled_time)}
                            {j.site?.name ? ` • ${j.site.name}` : ''}
                          </div>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-xs ${statusPillClass(j.status)}`}>{statusLabel(j.status)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <footer className="mt-10 text-center text-xs text-white/40">© 2026 Tanija • dark &amp; gold, без лишней драмы</footer>
      </div>
    </main>
  );
}
