'use client';

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
  site: { id: string; name: string | null; address: string | null; lat: number | null; lng: number | null; radius: number | null } | null;
  assignment_note: string | null;
};

function card() {
  return 'rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm';
}
function inputBase() {
  return 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/40';
}
function btnBase() {
  return 'inline-flex items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/15 active:scale-[0.99] transition';
}
function btnPrimary() {
  return 'inline-flex items-center justify-center rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-black hover:brightness-110 active:scale-[0.99] transition';
}

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [token, setToken] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [noteDraftBySite, setNoteDraftBySite] = useState<Record<string, string>>({});

  async function ensureToken() {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token || '';
    setToken(t);
    setSessionReady(true);
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
      await ensureToken();
      const res = await apiFetch('/api/me/jobs');
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог загрузить смены');

      const list = (js.jobs || []) as Job[];
      setJobs(list);

      const nextDraft: Record<string, string> = {};
      for (const j of list) {
        const sid = String(j.site_id);
        if (!sid) continue;
        if (nextDraft[sid] == null) nextDraft[sid] = j.assignment_note ?? '';
      }
      setNoteDraftBySite((prev) => ({ ...nextDraft, ...prev }));
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    ensureToken().then(() => loadJobs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login() {
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message || 'Не смог войти');
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
    setSessionReady(true);
  }

  function getGeo(): Promise<{ lat: number; lng: number; accuracy: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Геолокация не поддерживается'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => reject(new Error('Не смог получить GPS')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function start(jobId: string) {
    setBusy(true);
    setError('');
    try {
      const geo = await getGeo();
      const res = await apiFetch('/api/me/jobs/start', {
        method: 'POST',
        body: JSON.stringify({ id: jobId, ...geo }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'START не прошёл');
      setOk('START принят');
      setTimeout(() => setOk(''), 1200);
      await loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function stop(jobId: string) {
    setBusy(true);
    setError('');
    try {
      const geo = await getGeo();
      const res = await apiFetch('/api/me/jobs/stop', {
        method: 'POST',
        body: JSON.stringify({ id: jobId, ...geo }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'STOP не прошёл');
      setOk('STOP принят');
      setTimeout(() => setOk(''), 1200);
      await loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(siteId: string) {
    setBusy(true);
    setError('');
    try {
      const text = noteDraftBySite[siteId] ?? '';
      const res = await apiFetch('/api/me/assignments/note', {
        method: 'POST',
        body: JSON.stringify({ site_id: siteId, extra_note: text }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог сохранить заметку');
      setOk('Заметка сохранена');
      setTimeout(() => setOk(''), 1200);
      await loadJobs();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const authed = !!token;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-amber-400/25 bg-white/5">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-1" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">Tanija — Worker</div>
              <div className="text-xs text-white/50">Смены + заметки по объектам</div>
            </div>
          </div>

          {authed && (
            <button className={btnBase()} onClick={logout}>
              Выйти
            </button>
          )}
        </div>

        {(error || ok) && (
          <div className="mt-4">
            {error && <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {ok && <div className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{ok}</div>}
          </div>
        )}

        {!authed && sessionReady && (
          <div className={`mt-6 ${card()}`}>
            <div className="text-base font-semibold">Вход</div>
            <div className="mt-3 grid gap-2">
              <input className={inputBase()} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={inputBase()} placeholder="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className={btnPrimary()} onClick={login} disabled={busy || !email || !password}>
                Войти
              </button>
            </div>
          </div>
        )}

        {authed && (
          <div className="mt-6 grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-white/60">Мои смены</div>
              <button className={btnBase()} onClick={loadJobs} disabled={busy}>
                Обновить
              </button>
            </div>

            {jobs.map((j) => {
              const dt = ruDateTimeFromIso(j.job_date, j.scheduled_time) || 'Без даты/времени';
              const siteName = j.site?.name || 'Объект';
              const siteAddr = j.site?.address || '';
              const status = j.status;

              const canStart = status === 'planned';
              const canStop = status === 'in_progress';

              const sid = String(j.site_id);

              return (
                <div key={j.id} className={card()}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-base font-semibold">{dt}</div>
                      <div className="text-sm text-white/60">
                        {siteName}{siteAddr ? ` — ${siteAddr}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-white/50">Статус: {status}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className={btnPrimary()} onClick={() => start(j.id)} disabled={busy || !canStart}>
                        START
                      </button>
                      <button className={btnPrimary()} onClick={() => stop(j.id)} disabled={busy || !canStop}>
                        STOP
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-sm font-semibold">Экстра / заметки по объекту</div>
                    <div className="mt-2 text-xs text-white/50">
                      Это общий блокнот для тебя на этом объекте (видно и админу).
                    </div>
                    <textarea
                      className={`${inputBase()} mt-2 min-h-[96px]`}
                      value={noteDraftBySite[sid] ?? ''}
                      onChange={(e) => setNoteDraftBySite((p) => ({ ...p, [sid]: e.target.value }))}
                      placeholder="Например: код домофона, где ключ, что проверить, что купить…"
                    />
                    <div className="mt-2 flex justify-end">
                      <button className={btnBase()} onClick={() => saveNote(sid)} disabled={busy}>
                        Сохранить заметку
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {jobs.length === 0 && <div className="text-sm text-white/50">Смен нет</div>}
          </div>
        )}
      </div>
    </div>
  );
}
