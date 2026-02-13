'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabase';
import { ruDateTimeFromIso } from '@/lib/ru-format';

type Job = {
  id: string;
  site_id: string;
  worker_id: string;
  job_date: string | null;
  scheduled_time: string | null;
  status: string;
  site: { id: string; name: string | null; address: string | null; lat?: number | null; lng?: number | null; radius?: number | null } | null;
};

function btnBase() {
  return 'inline-flex items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/15 active:scale-[0.99] transition';
}

function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-black hover:brightness-110 active:scale-[0.99] transition';
}

function card() {
  return 'rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm';
}

function inputBase() {
  return 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/40';
}

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [sessionReady, setSessionReady] = useState(false);
  const [token, setToken] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);

  async function ensureToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token || '';
    setToken(t);
    return t;
  }

  async function apiFetch(path: string, init?: RequestInit) {
    const t = token || (await ensureToken());
    const headers = new Headers(init?.headers || {});
    headers.set('Authorization', `Bearer ${t}`);
    headers.set('Content-Type', 'application/json');
    return fetch(path, { ...init, headers, cache: 'no-store' });
  }

  async function loadJobs() {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/me/jobs');
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог загрузить смены');
      setJobs(js.jobs || []);
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange(async () => {
      await ensureToken();
      setSessionReady(true);
    });
    (async () => {
      await ensureToken();
      setSessionReady(true);
    })();
    return () => {
      sub.data.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!token) return;
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, token]);

  async function login() {
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      setOk('Вошёл');
      setTimeout(() => setOk(''), 1200);
      await ensureToken();
      await loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setToken('');
    setJobs([]);
    setOk('Вышел');
    setTimeout(() => setOk(''), 1200);
  }

  async function geo(): Promise<{ lat: number; lng: number; accuracy: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Геолокация не поддерживается'));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        (err) => reject(new Error(err.message || 'Не смог получить GPS')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function startJob(id: string) {
    setBusy(true);
    setError('');
    try {
      const p = await geo();
      const res = await apiFetch('/api/me/jobs/start', { method: 'POST', body: JSON.stringify({ id, ...p }) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог START');
      setOk('START OK');
      setTimeout(() => setOk(''), 1200);
      await loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function stopJob(id: string) {
    setBusy(true);
    setError('');
    try {
      const p = await geo();
      const res = await apiFetch('/api/me/jobs/stop', { method: 'POST', body: JSON.stringify({ id, ...p }) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог STOP');
      setOk('STOP OK');
      setTimeout(() => setOk(''), 1200);
      await loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const isLoggedIn = !!token;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-amber-400/25 bg-white/5">
            <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-1" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-wide">Tanija — Timeclock</div>
            <div className="text-xs text-white/50">Рабочая смена · GPS контроль</div>
          </div>
        </div>

        {(error || ok) && (
          <div className="mt-4">
            {error && <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {ok && <div className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{ok}</div>}
          </div>
        )}

        {!isLoggedIn && (
          <div className={`mt-6 ${card()}`}>
            <div className="text-base font-semibold">Вход</div>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="mb-1 text-xs text-white/60">Email</div>
                <input className={inputBase()} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="worker@company.com" />
              </div>
              <div>
                <div className="mb-1 text-xs text-white/60">Пароль</div>
                <input className={inputBase()} value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
              </div>
              <div className="flex justify-end">
                <button className={btnPrimary()} onClick={login} disabled={busy || !email || !password}>
                  Войти
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoggedIn && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <button className={btnBase()} onClick={loadJobs} disabled={busy}>
              Обновить данные
            </button>
            <button className={btnBase()} onClick={logout}>
              Выйти
            </button>
          </div>
        )}

        {isLoggedIn && (
          <div className="mt-6 grid gap-4">
            {jobs.map((j) => {
              const dt = ruDateTimeFromIso(j.job_date, j.scheduled_time);
              const siteLabel = j.site ? `${j.site.name || 'Без названия'}${j.site.address ? ` — ${j.site.address}` : ''}` : j.site_id;

              return (
                <div key={j.id} className={card()}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold">{dt || '—'}</div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                          {j.status === 'planned' ? 'Planned' : j.status === 'in_progress' ? 'In progress' : j.status === 'done' ? 'Done' : j.status}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-white/60">{siteLabel}</div>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-amber-200/90 hover:text-amber-200">Техданные</summary>
                        <div className="mt-2 text-sm text-white/70">UUID: {j.id}</div>
                      </details>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-56">
                      <button className={btnPrimary()} onClick={() => startJob(j.id)} disabled={busy || j.status !== 'planned'}>
                        START
                      </button>
                      <button className={btnBase()} onClick={() => stopJob(j.id)} disabled={busy || j.status !== 'in_progress'}>
                        STOP
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {jobs.length === 0 && <div className="text-sm text-white/50">Смен нет</div>}
          </div>
        )}

        <div className="mt-10 text-center text-xs text-white/35">© Tanija · Luxury dark & gold</div>
      </div>
    </div>
  );
}
