'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabase';
import { isoDateToRu, isoTimeToRu, ruDateTimeFromIso } from '@/lib/ru-format';

type WorkerMini = { id: string; full_name: string | null; email: string | null; active?: boolean | null };
type SiteMini = { id: string; name: string | null; address: string | null };

type Site = {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  assigned_workers: WorkerMini[];
};

type Worker = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
  avatar_url: string | null;
  assigned_sites: SiteMini[];
};

type Job = {
  id: string;
  site_id: string;
  worker_id: string;
  job_date: string | null;
  scheduled_time: string | null;
  status: string;
  site: (SiteMini & { lat?: number | null; lng?: number | null; radius?: number | null }) | null;
  worker: (WorkerMini & { active?: boolean | null }) | null;
};

function pill(text: string) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
      {text}
    </span>
  );
}

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

function selectBase() {
  return 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/40';
}

function AdminInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const tab = (sp.get('tab') || 'sites') as 'sites' | 'workers' | 'jobs';
  const jobsStatus = sp.get('status') || 'all';

  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [token, setToken] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [ok, setOk] = useState<string>('');

  const [sites, setSites] = useState<Site[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  const [assignWorkerBySite, setAssignWorkerBySite] = useState<Record<string, string>>({});
  const [assignSiteByWorker, setAssignSiteByWorker] = useState<Record<string, string>>({});

  const [jobForm, setJobForm] = useState<{ site_id: string; worker_id: string; job_date: string; scheduled_time: string }>(
    { site_id: '', worker_id: '', job_date: '', scheduled_time: '' }
  );

  const [jobPatch, setJobPatch] = useState<Record<string, Partial<Job> & { status?: string }>>({});

  function setTab(next: 'sites' | 'workers' | 'jobs') {
    const url = next === 'jobs' ? `/admin?tab=jobs` : `/admin?tab=${next}`;
    router.push(url);
  }

  function setJobsStatus(next: string) {
    const base = `/admin?tab=jobs`;
    router.push(next === 'all' ? base : `${base}&status=${encodeURIComponent(next)}`);
  }

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

  async function loadAll() {
    setBusy(true);
    setError('');
    setOk('');
    try {
      await ensureToken();

      const [sRes, wRes, jRes] = await Promise.all([
        apiFetch('/api/admin/sites/list'),
        apiFetch('/api/admin/workers/list'),
        tab === 'jobs'
          ? apiFetch(jobsStatus === 'all' ? '/api/admin/jobs' : `/api/admin/jobs?status=${encodeURIComponent(jobsStatus)}`)
          : Promise.resolve(null as any),
      ]);

      if (!sRes.ok) throw new Error((await sRes.json()).error || 'Sites: ошибка');
      if (!wRes.ok) throw new Error((await wRes.json()).error || 'Workers: ошибка');

      const sJson = await sRes.json();
      const wJson = await wRes.json();

      setSites(sJson.sites || []);
      setWorkers(wJson.workers || []);

      if (jRes) {
        if (!jRes.ok) throw new Error((await jRes.json()).error || 'Jobs: ошибка');
        const jJson = await jRes.json();
        setJobs(jJson.jobs || []);
      } else {
        setJobs([]);
      }

      setOk('Данные обновлены');
      setTimeout(() => setOk(''), 1500);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, jobsStatus]);

  const activeWorkers = useMemo(
    () => workers.filter((w) => (w.active ?? true) && (w.role ?? 'worker') !== 'admin'),
    [workers]
  );

  const activeWorkerOptions: WorkerMini[] = useMemo(
    () =>
      activeWorkers.map((w) => ({
        id: w.id,
        full_name: w.full_name ?? null,
        email: w.email ?? null,
        active: w.active ?? null,
      })),
    [activeWorkers]
  );

  const sitesMini = useMemo(() => sites.map((s) => ({ id: s.id, name: s.name, address: s.address })), [sites]);

  const assignedWorkersBySiteId = useMemo(() => {
    const m = new Map<string, WorkerMini[]>();
    for (const s of sites) m.set(s.id, s.assigned_workers || []);
    return m;
  }, [sites]);

  function workerLabel(w: WorkerMini) {
    return (w.full_name || 'Без имени') + (w.email ? ` — ${w.email}` : '');
  }

  function getAllowedWorkersForSite(siteId: string): WorkerMini[] {
    if (!siteId) return activeWorkerOptions;
    return assignedWorkersBySiteId.get(siteId) ?? [];
  }

  // Автокоррекция worker_id в форме создания: только назначенные на объект
  useEffect(() => {
    if (!jobForm.site_id) return;

    const allowed = getAllowedWorkersForSite(jobForm.site_id);
    const allowedIds = new Set(allowed.map((w) => w.id));

    if (allowed.length === 1) {
      setJobForm((p) => ({ ...p, worker_id: allowed[0].id }));
      return;
    }

    if (jobForm.worker_id && !allowedIds.has(jobForm.worker_id)) {
      setJobForm((p) => ({ ...p, worker_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobForm.site_id]);

  async function assign(site_id: string, worker_id: string) {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({ site_id, worker_id }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог назначить');
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function unassign(site_id: string, worker_id: string) {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/assignments', {
        method: 'DELETE',
        body: JSON.stringify({ site_id, worker_id }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог снять назначение');
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function createJob() {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/jobs', {
        method: 'POST',
        body: JSON.stringify(jobForm),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог создать job');
      setJobForm({ site_id: '', worker_id: '', job_date: '', scheduled_time: '' });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function patchJob(id: string) {
    setBusy(true);
    setError('');
    try {
      const patch = jobPatch[id] || {};
      const body: any = { id };
      if (patch.site_id) body.site_id = patch.site_id;
      if (patch.worker_id) body.worker_id = patch.worker_id;
      if (patch.job_date) body.job_date = patch.job_date;
      if (patch.scheduled_time) body.scheduled_time = patch.scheduled_time;
      if ((patch as any).status) body.status = (patch as any).status;

      const res = await apiFetch('/api/admin/jobs', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог обновить job');
      setJobPatch((p) => {
        const copy = { ...p };
        delete copy[id];
        return copy;
      });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(id: string) {
    if (!confirm('Удалить смену?')) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/jobs', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог удалить job');
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function copyCoords(lat: number | null, lng: number | null) {
    if (lat == null || lng == null) return;
    try {
      await navigator.clipboard.writeText(`${lat},${lng}`);
      setOk('Координаты скопированы');
      setTimeout(() => setOk(''), 1200);
    } catch {
      setError('Не смог скопировать координаты');
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    location.href = '/';
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-amber-400/25 bg-white/5">
              <Image src="/tanija-logo.png" alt="Tanija" fill className="object-contain p-1" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">Tanija — Админка</div>
              <div className="text-xs text-white/50">Объекты · Работники · Смены</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={btnBase()} onClick={loadAll} disabled={busy}>
              Обновить данные
            </button>
            <button className={btnBase()} onClick={logout}>
              Выйти
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className={`${btnBase()} ${tab === 'sites' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setTab('sites')}>
            Объекты
          </button>
          <button className={`${btnBase()} ${tab === 'workers' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setTab('workers')}>
            Работники
          </button>
          <button className={`${btnBase()} ${tab === 'jobs' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setTab('jobs')}>
            Смены (Jobs)
          </button>
        </div>

        {(error || ok) && (
          <div className="mt-4">
            {error && (
              <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
            {ok && (
              <div className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {ok}
              </div>
            )}
          </div>
        )}

        {tab === 'sites' && (
          <div className="mt-6 grid gap-4">
            {sites.map((s) => (
              <div key={s.id} className={card()}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">{s.name || 'Без названия'}</div>
                    <div className="text-sm text-white/60">{s.address || 'Без адреса'}</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(s.assigned_workers || []).length === 0 ? (
                        <span className="text-sm text-white/40">Нет назначений</span>
                      ) : (
                        s.assigned_workers.map((w) => (
                          <span
                            key={w.id}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs"
                          >
                            <span className="text-white/90">{w.full_name || 'Без имени'}</span>
                            <span className="text-white/40">{w.email || ''}</span>
                            <button
                              className="ml-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-400/15"
                              onClick={() => unassign(s.id, w.id)}
                              disabled={busy}
                            >
                              Снять
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-amber-200/90 hover:text-amber-200">Техданные</summary>
                      <div className="mt-2 grid gap-2 text-sm text-white/70">
                        <div className="flex flex-wrap items-center gap-2">
                          {pill(`UUID: ${s.id}`)}
                          {pill(`Радиус: ${s.radius ?? '—'} м`)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {pill(`lat: ${s.lat ?? '—'}`)}
                          {pill(`lng: ${s.lng ?? '—'}`)}
                          <button className={btnBase()} onClick={() => copyCoords(s.lat, s.lng)} disabled={s.lat == null || s.lng == null}>
                            Скопировать координаты
                          </button>
                        </div>
                      </div>
                    </details>
                  </div>

                  <div className="w-full sm:w-80">
                    <div className="text-sm text-white/60">Назначить работника</div>
                    <div className="mt-2 flex gap-2">
                      <select
                        className={selectBase()}
                        value={assignWorkerBySite[s.id] || ''}
                        onChange={(e) => setAssignWorkerBySite((p) => ({ ...p, [s.id]: e.target.value }))}
                      >
                        <option value="">Выбери работника…</option>
                        {activeWorkerOptions.map((w) => (
                          <option key={w.id} value={w.id}>
                            {workerLabel(w)}
                          </option>
                        ))}
                      </select>
                      <button
                        className={btnPrimary()}
                        onClick={() => assign(s.id, assignWorkerBySite[s.id] || '')}
                        disabled={busy || !assignWorkerBySite[s.id]}
                      >
                        Назначить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {sites.length === 0 && <div className="text-sm text-white/50">Объектов нет</div>}
          </div>
        )}

        {tab === 'workers' && (
          <div className="mt-6 grid gap-4">
            {workers.map((w) => (
              <div key={w.id} className={card()}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">
                      {w.full_name || 'Без имени'} <span className="text-xs text-white/50">{w.active === false ? '(выключен)' : ''}</span>
                    </div>
                    <div className="text-sm text-white/60">{w.email || 'Без email'}</div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(w.assigned_sites || []).length === 0 ? (
                        <span className="text-sm text-white/40">Нет назначений</span>
                      ) : (
                        w.assigned_sites.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs"
                          >
                            <span className="text-white/90">{s.name || 'Без названия'}</span>
                            <span className="text-white/40">{s.address || ''}</span>
                            <button
                              className="ml-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-400/15"
                              onClick={() => unassign(s.id, w.id)}
                              disabled={busy}
                            >
                              Снять
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-amber-200/90 hover:text-amber-200">Техданные</summary>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/70">
                        {pill(`UUID: ${w.id}`)}
                        {pill(`роль: ${w.role ?? '—'}`)}
                      </div>
                    </details>
                  </div>

                  <div className="w-full sm:w-80">
                    <div className="text-sm text-white/60">Назначить объект</div>
                    <div className="mt-2 flex gap-2">
                      <select
                        className={selectBase()}
                        value={assignSiteByWorker[w.id] || ''}
                        onChange={(e) => setAssignSiteByWorker((p) => ({ ...p, [w.id]: e.target.value }))}
                      >
                        <option value="">Выбери объект…</option>
                        {sitesMini.map((s) => (
                          <option key={s.id} value={s.id}>
                            {(s.name || 'Без названия') + (s.address ? ` — ${s.address}` : '')}
                          </option>
                        ))}
                      </select>
                      <button
                        className={btnPrimary()}
                        onClick={() => assign(assignSiteByWorker[w.id] || '', w.id)}
                        disabled={busy || !assignSiteByWorker[w.id]}
                      >
                        Назначить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {workers.length === 0 && <div className="text-sm text-white/50">Работников нет</div>}
          </div>
        )}

        {tab === 'jobs' && (
          <div className="mt-6 grid gap-4">
            <div className={card()}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-base font-semibold">Создать смену</div>
                  <div className="text-xs text-white/50">Работник выбирается только из назначенных на объект</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={`${btnBase()} ${jobsStatus === 'all' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setJobsStatus('all')}>
                    Все
                  </button>
                  <button className={`${btnBase()} ${jobsStatus === 'planned' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setJobsStatus('planned')}>
                    Planned
                  </button>
                  <button className={`${btnBase()} ${jobsStatus === 'in_progress' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setJobsStatus('in_progress')}>
                    In progress
                  </button>
                  <button className={`${btnBase()} ${jobsStatus === 'done' ? 'ring-2 ring-amber-400/40' : ''}`} onClick={() => setJobsStatus('done')}>
                    Done
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div>
                  <div className="mb-1 text-xs text-white/60">Объект</div>
                  <select className={selectBase()} value={jobForm.site_id} onChange={(e) => setJobForm((p) => ({ ...p, site_id: e.target.value }))}>
                    <option value="">Выбери объект…</option>
                    {sitesMini.map((s) => (
                      <option key={s.id} value={s.id}>
                        {(s.name || 'Без названия') + (s.address ? ` — ${s.address}` : '')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-white/60">Работник (по назначениям)</div>
                  <select
                    className={selectBase()}
                    value={jobForm.worker_id}
                    onChange={(e) => setJobForm((p) => ({ ...p, worker_id: e.target.value }))}
                    disabled={!jobForm.site_id || getAllowedWorkersForSite(jobForm.site_id).length === 0}
                  >
                    {!jobForm.site_id && <option value="">Сначала выбери объект…</option>}
                    {jobForm.site_id && getAllowedWorkersForSite(jobForm.site_id).length === 0 && (
                      <option value="">Нет назначенных работников</option>
                    )}
                    {jobForm.site_id &&
                      getAllowedWorkersForSite(jobForm.site_id).length > 0 && (
                        <>
                          <option value="">Выбери работника…</option>
                          {getAllowedWorkersForSite(jobForm.site_id).map((w) => (
                            <option key={w.id} value={w.id}>
                              {workerLabel(w)}
                            </option>
                          ))}
                        </>
                      )}
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-white/60">Дата</div>
                  <input className={inputBase()} type="date" value={jobForm.job_date} onChange={(e) => setJobForm((p) => ({ ...p, job_date: e.target.value }))} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-white/60">Время</div>
                  <input className={inputBase()} type="time" value={jobForm.scheduled_time} onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time: e.target.value }))} />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button
                  className={btnPrimary()}
                  onClick={createJob}
                  disabled={
                    busy ||
                    !jobForm.site_id ||
                    !jobForm.worker_id ||
                    !jobForm.job_date ||
                    !jobForm.scheduled_time
                  }
                >
                  Создать
                </button>
              </div>
            </div>

            {jobs.map((j) => {
              const dt = ruDateTimeFromIso(j.job_date, j.scheduled_time);
              const siteLabel = j.site ? `${j.site.name || 'Без названия'}${j.site.address ? ` — ${j.site.address}` : ''}` : j.site_id;
              const workerLabelText = j.worker ? `${j.worker.full_name || 'Без имени'}${j.worker.email ? ` — ${j.worker.email}` : ''}` : j.worker_id;

              const p = jobPatch[j.id] || {};
              const curStatus = (p as any).status ?? j.status;
              const curSiteId = (p.site_id ?? j.site_id) as string;
              const curWorkerId = (p.worker_id ?? j.worker_id) as string;

              const allowedWorkers = getAllowedWorkersForSite(curSiteId);
              const allowedIds = new Set(allowedWorkers.map((w) => w.id));
              const currentWorkerInAllowed = allowedIds.has(curWorkerId);

              return (
                <div key={j.id} className={card()}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold">{dt || `${isoDateToRu(j.job_date)} ${isoTimeToRu(j.scheduled_time)}`}</div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                          {curStatus === 'planned' ? 'Planned' : curStatus === 'in_progress' ? 'In progress' : curStatus === 'done' ? 'Done' : curStatus}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-white/60">{siteLabel}</div>
                      <div className="mt-1 text-sm text-white/60">{workerLabelText}</div>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-amber-200/90 hover:text-amber-200">Техданные</summary>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/70">{pill(`UUID: ${j.id}`)}</div>
                      </details>
                    </div>

                    <div className="w-full sm:w-[420px]">
                      <div className="grid gap-2">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div>
                            <div className="mb-1 text-xs text-white/60">Статус</div>
                            <select
                              className={selectBase()}
                              value={curStatus}
                              onChange={(e) =>
                                setJobPatch((pp) => ({
                                  ...pp,
                                  [j.id]: { ...(pp[j.id] || {}), status: e.target.value },
                                }))
                              }
                            >
                              <option value="planned">planned</option>
                              <option value="in_progress">in_progress</option>
                              <option value="done">done</option>
                            </select>
                          </div>

                          <div>
                            <div className="mb-1 text-xs text-white/60">Объект</div>
                            <select
                              className={selectBase()}
                              value={curSiteId}
                              onChange={(e) => {
                                const nextSiteId = e.target.value;
                                const allowed = getAllowedWorkersForSite(nextSiteId);
                                const ids = new Set(allowed.map((w) => w.id));

                                setJobPatch((pp) => {
                                  const prev = pp[j.id] || {};
                                  const next: any = { ...prev, site_id: nextSiteId };
                                  const nextWorker = (prev.worker_id ?? curWorkerId) as string;
                                  if (nextWorker && !ids.has(nextWorker)) next.worker_id = '';
                                  if (!nextWorker && allowed.length === 1) next.worker_id = allowed[0].id;
                                  return { ...pp, [j.id]: next };
                                });
                              }}
                            >
                              {sitesMini.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {(s.name || 'Без названия') + (s.address ? ` — ${s.address}` : '')}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="mb-1 text-xs text-white/60">Работник (по назначениям)</div>
                            <select
                              className={selectBase()}
                              value={curWorkerId}
                              onChange={(e) =>
                                setJobPatch((pp) => ({
                                  ...pp,
                                  [j.id]: { ...(pp[j.id] || {}), worker_id: e.target.value },
                                }))
                              }
                              disabled={allowedWorkers.length === 0}
                            >
                              {allowedWorkers.length === 0 && <option value="">Нет назначенных работников</option>}

                              {allowedWorkers.length > 0 && (
                                <>
                                  {!currentWorkerInAllowed && curWorkerId && <option value={curWorkerId}>Текущий (вне назначений)</option>}
                                  <option value="">Выбери работника…</option>
                                  {allowedWorkers.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {workerLabel(w)}
                                    </option>
                                  ))}
                                </>
                              )}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button className={btnBase()} onClick={() => deleteJob(j.id)} disabled={busy}>
                            Удалить
                          </button>
                          <button className={btnPrimary()} onClick={() => patchJob(j.id)} disabled={busy || !jobPatch[j.id]}>
                            Сохранить
                          </button>
                        </div>
                      </div>
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

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white">
          <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-white/60">Загрузка…</div>
        </div>
      }
    >
      <AdminInner />
    </Suspense>
  );
}
