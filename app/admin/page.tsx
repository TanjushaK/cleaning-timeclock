'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { getSupabaseBrowser } from '@/lib/supabase';
import { ruDateTimeFromIso } from '@/lib/ru-format';

type WorkerMini = {
  id: string;
  full_name: string | null;
  email: string | null;
  active?: boolean | null;
  role?: string | null;
  extra_note?: string | null;
};

type SiteMini = {
  id: string;
  name: string | null;
  address: string | null;
  extra_note?: string | null;
};

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
  worker: (WorkerMini & { active?: boolean | null; role?: string | null }) | null;
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

function btnDanger() {
  return 'inline-flex items-center justify-center rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200 hover:bg-red-400/15 active:scale-[0.99] transition';
}

function card() {
  return 'rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm';
}

function inputBase() {
  return 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/40';
}

function textareaBase() {
  return 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400/40';
}

function selectBase() {
  return 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400/40';
}

function statusBadge(status: string) {
  const label =
    status === 'planned' ? 'Planned' : status === 'in_progress' ? 'In progress' : status === 'done' ? 'Done' : status;
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">{label}</span>;
}

function workerLabel(w: WorkerMini) {
  const name = w.full_name || 'Без имени';
  const email = w.email ? ` — ${w.email}` : '';
  const role = w.role === 'admin' ? ' (admin)' : '';
  return `${name}${email}${role}`;
}

function siteLabel(s: SiteMini) {
  return (s.name || 'Без названия') + (s.address ? ` — ${s.address}` : '');
}

function keyPair(siteId: string, workerId: string) {
  return `${siteId}|${workerId}`;
}

function AdminInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get('tab') || 'sites') as 'sites' | 'workers' | 'jobs';

  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [token, setToken] = useState<string>('');
  const [meId, setMeId] = useState<string>('');

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

  const [jobPatch, setJobPatch] = useState<Record<string, any>>({});

  // extra note editor: ключ = site|worker
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  // add site form
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [newSite, setNewSite] = useState<{ name: string; address: string; radius: string; lat: string; lng: string }>({
    name: '',
    address: '',
    radius: '150',
    lat: '',
    lng: '',
  });

  // invite worker form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<{ email: string; full_name: string }>({ email: '', full_name: '' });

  function setTab(next: 'sites' | 'workers' | 'jobs') {
    router.push(`/admin?tab=${next}`);
  }

  async function ensureSession(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token || '';
    const uid = data.session?.user?.id || '';
    setToken(t);
    setMeId(uid);
    return t;
  }

  async function apiFetch(path: string, init?: RequestInit) {
    const t = token || (await ensureSession());
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
      await ensureSession();

      const [sRes, wRes, jRes] = await Promise.all([
        apiFetch('/api/admin/sites/list'),
        apiFetch('/api/admin/workers/list'),
        apiFetch('/api/admin/jobs'),
      ]);

      const sJson = await sRes.json();
      const wJson = await wRes.json();
      const jJson = await jRes.json();

      if (!sRes.ok) throw new Error(sJson.error || 'Sites: ошибка');
      if (!wRes.ok) throw new Error(wJson.error || 'Workers: ошибка');
      if (!jRes.ok) throw new Error(jJson.error || 'Jobs: ошибка');

      setSites(sJson.sites || []);
      setWorkers(wJson.workers || []);
      setJobs(jJson.jobs || []);

      // подхватим noteDraft из текущих данных, если ещё пусто
      const nextDraft: Record<string, string> = {};
      for (const s of (sJson.sites || []) as Site[]) {
        for (const w of s.assigned_workers || []) {
          const k = keyPair(String(s.id), String(w.id));
          if (nextDraft[k] == null) nextDraft[k] = (w.extra_note ?? '') as string;
        }
      }
      setNoteDraft((prev) => ({ ...nextDraft, ...prev }));

      setOk('Данные обновлены');
      setTimeout(() => setOk(''), 1200);
    } catch (e: any) {
      setError(e?.message || 'Ошибка загрузки');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const sitesMini = useMemo(() => sites.map((s) => ({ id: s.id, name: s.name, address: s.address })), [sites]);

  const assignedWorkersBySiteId = useMemo(() => {
    const m = new Map<string, WorkerMini[]>();
    for (const s of sites) m.set(String(s.id), s.assigned_workers || []);
    return m;
  }, [sites]);

  const assignableWorkerOptions: WorkerMini[] = useMemo(() => {
    // назначаем обычных работников + себя (если admin)
    const list = (workers || [])
      .filter((w) => (w.active ?? true))
      .filter((w) => w.role !== 'admin' || w.id === meId)
      .map((w) => ({ id: w.id, full_name: w.full_name ?? null, email: w.email ?? null, active: w.active ?? null, role: w.role ?? null }));
    return list;
  }, [workers, meId]);

  const noteByPair = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sites) {
      const sid = String(s.id);
      for (const w of s.assigned_workers || []) {
        const wid = String(w.id);
        const k = keyPair(sid, wid);
        const val = (w.extra_note ?? '') as string;
        if (val) m.set(k, val);
      }
    }
    return m;
  }, [sites]);

  function getAllowedWorkersForSite(siteId: string): WorkerMini[] {
    if (!siteId) return [];
    return assignedWorkersBySiteId.get(String(siteId)) ?? [];
  }

  // Автокоррекция worker_id при создании смены
  useEffect(() => {
    if (!jobForm.site_id) return;
    const allowed = getAllowedWorkersForSite(jobForm.site_id);
    const allowedIds = new Set(allowed.map((w) => String(w.id)));

    if (allowed.length === 1) {
      setJobForm((p) => ({ ...p, worker_id: String(allowed[0].id) }));
      return;
    }

    if (jobForm.worker_id && !allowedIds.has(String(jobForm.worker_id))) {
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

  async function saveAssignmentNote(site_id: string, worker_id: string) {
    const k = keyPair(site_id, worker_id);
    const text = noteDraft[k] ?? '';
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({ site_id, worker_id, extra_note: text }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог сохранить заметку');
      setOk('Заметка сохранена');
      setTimeout(() => setOk(''), 1200);
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
      if (!res.ok) throw new Error(js.error || 'Не смог создать смену');
      setJobForm({ site_id: '', worker_id: '', job_date: '', scheduled_time: '' });
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function quickStatus(id: string, status: 'planned' | 'in_progress' | 'done') {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/jobs', { method: 'PATCH', body: JSON.stringify({ id, status }) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог обновить статус');
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function saveJobEdits(id: string) {
    setBusy(true);
    setError('');
    try {
      const patch = jobPatch[id] || {};
      const body: any = { id };
      if (patch.site_id != null) body.site_id = patch.site_id;
      if (patch.worker_id != null) body.worker_id = patch.worker_id;
      if (patch.job_date != null) body.job_date = patch.job_date;
      if (patch.scheduled_time != null) body.scheduled_time = patch.scheduled_time;

      const res = await apiFetch('/api/admin/jobs', { method: 'PATCH', body: JSON.stringify(body) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог сохранить');

      setJobPatch((p) => {
        const c = { ...p };
        delete c[id];
        return c;
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
      const res = await apiFetch('/api/admin/jobs', { method: 'DELETE', body: JSON.stringify({ id }) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог удалить');
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function geocodeAddress() {
    const q = (newSite.address || '').trim();
    if (!q) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог геокодировать');
      const best = (js.results && js.results[0]) ? js.results[0] : null;
      if (!best) throw new Error('Ничего не найдено');
      setNewSite((p) => ({ ...p, lat: String(best.lat), lng: String(best.lng) }));
      setOk('Координаты подставлены');
      setTimeout(() => setOk(''), 1200);
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function createSite() {
    setBusy(true);
    setError('');
    try {
      const payload: any = {
        name: (newSite.name || '').trim() || null,
        address: (newSite.address || '').trim() || null,
        radius: newSite.radius ? Number(newSite.radius) : null,
        lat: newSite.lat ? Number(newSite.lat) : null,
        lng: newSite.lng ? Number(newSite.lng) : null,
      };

      const res = await apiFetch('/api/admin/sites', { method: 'POST', body: JSON.stringify(payload) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог создать объект');

      setNewSite({ name: '', address: '', radius: '150', lat: '', lng: '' });
      setAddSiteOpen(false);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function inviteWorker() {
    setBusy(true);
    setError('');
    try {
      const payload: any = {
        email: (invite.email || '').trim(),
        full_name: (invite.full_name || '').trim() || null,
      };
      if (!payload.email) throw new Error('Нужен email');

      const res = await apiFetch('/api/admin/workers/invite', { method: 'POST', body: JSON.stringify(payload) });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || 'Не смог пригласить работника');

      setInvite({ email: '', full_name: '' });
      setInviteOpen(false);
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    location.href = '/';
  }

  const planned = useMemo(() => jobs.filter((j) => j.status === 'planned'), [jobs]);
  const inProgress = useMemo(() => jobs.filter((j) => j.status === 'in_progress'), [jobs]);
  const done = useMemo(() => jobs.filter((j) => j.status === 'done'), [jobs]);

  function jobTitle(j: Job) {
    return ruDateTimeFromIso(j.job_date, j.scheduled_time) || 'Без даты/времени';
  }

  function jobSiteText(j: Job) {
    return j.site ? siteLabel(j.site) : String(j.site_id);
  }

  function jobWorkerText(j: Job) {
    return j.worker ? workerLabel(j.worker) : String(j.worker_id);
  }

  function renderJobCard(j: Job) {
    const title = jobTitle(j);
    const s = jobSiteText(j);
    const w = jobWorkerText(j);
    const note = noteByPair.get(keyPair(String(j.site_id), String(j.worker_id))) || '';

    const patch = jobPatch[j.id] || {};
    const curSiteId = String(patch.site_id ?? j.site_id);
    const allowed = getAllowedWorkersForSite(curSiteId);

    return (
      <div key={j.id} className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="mt-1 truncate text-xs text-white/60">{s}</div>
            <div className="mt-1 truncate text-xs text-white/60">{w}</div>
            {note ? <div className="mt-2 line-clamp-2 text-xs text-amber-200/80">Экстра: {note}</div> : null}
          </div>
          <div className="shrink-0">{statusBadge(j.status)}</div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {j.status === 'planned' && (
            <button className={btnPrimary()} onClick={() => quickStatus(j.id, 'in_progress')} disabled={busy}>
              В работу
            </button>
          )}
          {j.status === 'in_progress' && (
            <>
              <button className={btnPrimary()} onClick={() => quickStatus(j.id, 'done')} disabled={busy}>
                Готово
              </button>
              <button className={btnBase()} onClick={() => quickStatus(j.id, 'planned')} disabled={busy}>
                ↩ Planned
              </button>
            </>
          )}
          {j.status === 'done' && (
            <button className={btnBase()} onClick={() => quickStatus(j.id, 'in_progress')} disabled={busy}>
              ↩ In progress
            </button>
          )}
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-amber-200/90 hover:text-amber-200">Редактировать</summary>
          <div className="mt-3 grid gap-2">
            <div>
              <div className="mb-1 text-[11px] text-white/60">Объект</div>
              <select
                className={selectBase()}
                value={curSiteId}
                onChange={(e) => {
                  const nextSiteId = e.target.value;
                  const nextAllowed = getAllowedWorkersForSite(nextSiteId);
                  const ids = new Set(nextAllowed.map((x) => String(x.id)));
                  setJobPatch((pp) => {
                    const prev = pp[j.id] || {};
                    const next: any = { ...prev, site_id: nextSiteId };
                    const prevWorker = String(prev.worker_id ?? j.worker_id);
                    if (prevWorker && !ids.has(prevWorker)) next.worker_id = '';
                    if (!prevWorker && nextAllowed.length === 1) next.worker_id = String(nextAllowed[0].id);
                    return { ...pp, [j.id]: next };
                  });
                }}
              >
                {sitesMini.map((ss) => (
                  <option key={ss.id} value={ss.id}>
                    {siteLabel(ss)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 text-[11px] text-white/60">Работник (по назначениям)</div>
              <select
                className={selectBase()}
                value={String(patch.worker_id ?? j.worker_id)}
                onChange={(e) => setJobPatch((pp) => ({ ...pp, [j.id]: { ...(pp[j.id] || {}), worker_id: e.target.value } }))}
                disabled={allowed.length === 0}
              >
                {allowed.length === 0 && <option value="">Нет назначенных работников</option>}
                {allowed.length > 0 && (
                  <>
                    <option value="">Выбери…</option>
                    {allowed.map((ww) => (
                      <option key={ww.id} value={ww.id}>
                        {workerLabel(ww)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[11px] text-white/60">Дата</div>
                <input
                  className={inputBase()}
                  type="date"
                  value={String(patch.job_date ?? j.job_date ?? '')}
                  onChange={(e) => setJobPatch((pp) => ({ ...pp, [j.id]: { ...(pp[j.id] || {}), job_date: e.target.value } }))}
                />
              </div>
              <div>
                <div className="mb-1 text-[11px] text-white/60">Время</div>
                <input
                  className={inputBase()}
                  type="time"
                  value={String(patch.scheduled_time ?? j.scheduled_time ?? '')}
                  onChange={(e) => setJobPatch((pp) => ({ ...pp, [j.id]: { ...(pp[j.id] || {}), scheduled_time: e.target.value } }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-[11px] text-white/60">{pill(`UUID: ${j.id}`)}</div>
              <div className="flex gap-2">
                <button className={btnDanger()} onClick={() => deleteJob(j.id)} disabled={busy}>
                  Удалить
                </button>
                <button className={btnPrimary()} onClick={() => saveJobEdits(j.id)} disabled={busy || !jobPatch[j.id]}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    );
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
            Смены (Kanban)
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
            <div className={card()}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-base font-semibold">Объекты</div>
                  <div className="text-xs text-white/50">Здесь можно и смотреть, и добавлять</div>
                </div>
                <button className={btnBase()} onClick={() => setAddSiteOpen((v) => !v)} disabled={busy}>
                  {addSiteOpen ? 'Скрыть' : 'Добавить объект'}
                </button>
              </div>

              {addSiteOpen && (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-white/60">Название</div>
                    <input className={inputBase()} value={newSite.name} onChange={(e) => setNewSite((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-white/60">Адрес</div>
                    <input className={inputBase()} value={newSite.address} onChange={(e) => setNewSite((p) => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-white/60">Радиус (м)</div>
                    <input className={inputBase()} value={newSite.radius} onChange={(e) => setNewSite((p) => ({ ...p, radius: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-white/60">lat</div>
                    <input className={inputBase()} value={newSite.lat} onChange={(e) => setNewSite((p) => ({ ...p, lat: e.target.value }))} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-white/60">lng</div>
                    <input className={inputBase()} value={newSite.lng} onChange={(e) => setNewSite((p) => ({ ...p, lng: e.target.value }))} />
                  </div>
                  <div className="flex items-end gap-2">
                    <button className={btnBase()} onClick={geocodeAddress} disabled={busy || !newSite.address.trim()}>
                      Геокодировать
                    </button>
                    <button className={btnPrimary()} onClick={createSite} disabled={busy || !newSite.name.trim()}>
                      Создать
                    </button>
                  </div>
                </div>
              )}
            </div>

            {sites.map((s) => (
              <div key={s.id} className={card()}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">{s.name || 'Без названия'}</div>
                    <div className="text-sm text-white/60">{s.address || 'Без адреса'}</div>

                    <div className="mt-3 grid gap-2">
                      {(s.assigned_workers || []).length === 0 ? (
                        <span className="text-sm text-white/40">Нет назначений</span>
                      ) : (
                        s.assigned_workers.map((w) => {
                          const k = keyPair(String(s.id), String(w.id));
                          const open = !!noteOpen[k];
                          const current = noteByPair.get(k) ?? (w.extra_note ?? '') ?? '';
                          const draft = noteDraft[k] ?? current;

                          return (
                            <div key={w.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm text-white/90">
                                    {w.full_name || 'Без имени'} <span className="text-xs text-white/45">{w.email || ''}</span>{' '}
                                    <span className="text-xs text-white/35">{w.role === 'admin' ? '(admin)' : ''}</span>
                                  </div>
                                  {current ? (
                                    <div className="mt-1 line-clamp-2 text-xs text-amber-200/80">Экстра: {current}</div>
                                  ) : (
                                    <div className="mt-1 text-xs text-white/35">Экстра: —</div>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button className={btnBase()} onClick={() => setNoteOpen((p) => ({ ...p, [k]: !open }))} disabled={busy}>
                                    {open ? 'Скрыть' : 'Редактировать'}
                                  </button>
                                  <button className={btnBase()} onClick={() => unassign(String(s.id), String(w.id))} disabled={busy}>
                                    Снять
                                  </button>
                                </div>
                              </div>

                              {open && (
                                <div className="mt-3 grid gap-2">
                                  <textarea
                                    className={`${textareaBase()} min-h-[84px]`}
                                    value={draft}
                                    onChange={(e) => setNoteDraft((p) => ({ ...p, [k]: e.target.value }))}
                                    placeholder="Экстра / заметка по объекту для этого работника…"
                                  />
                                  <div className="flex justify-end">
                                    <button className={btnPrimary()} onClick={() => saveAssignmentNote(String(s.id), String(w.id))} disabled={busy}>
                                      Сохранить заметку
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-amber-200/90 hover:text-amber-200">Техданные</summary>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/70">
                        {pill(`UUID: ${s.id}`)}
                        {pill(`Радиус: ${s.radius ?? '—'} м`)}
                        {pill(`lat: ${s.lat ?? '—'}`)}
                        {pill(`lng: ${s.lng ?? '—'}`)}
                      </div>
                    </details>
                  </div>

                  <div className="w-full sm:w-80">
                    <div className="text-sm text-white/60">Назначить работника (включая тебя)</div>
                    <div className="mt-2 flex gap-2">
                      <select
                        className={selectBase()}
                        value={assignWorkerBySite[s.id] || ''}
                        onChange={(e) => setAssignWorkerBySite((p) => ({ ...p, [s.id]: e.target.value }))}
                      >
                        <option value="">Выбери…</option>
                        {assignableWorkerOptions.map((w) => (
                          <option key={w.id} value={w.id}>
                            {workerLabel(w)}
                          </option>
                        ))}
                      </select>
                      <button
                        className={btnPrimary()}
                        onClick={() => assign(String(s.id), assignWorkerBySite[s.id] || '')}
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
            <div className={card()}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-base font-semibold">Работники</div>
                  <div className="text-xs text-white/50">Добавление через приглашение</div>
                </div>
                <button className={btnBase()} onClick={() => setInviteOpen((v) => !v)} disabled={busy}>
                  {inviteOpen ? 'Скрыть' : 'Пригласить работника'}
                </button>
              </div>

              {inviteOpen && (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-white/60">Email</div>
                    <input className={inputBase()} value={invite.email} onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <div className="mb-1 text-xs text-white/60">Имя (опционально)</div>
                    <input className={inputBase()} value={invite.full_name} onChange={(e) => setInvite((p) => ({ ...p, full_name: e.target.value }))} />
                  </div>
                  <div className="flex items-end">
                    <button className={btnPrimary()} onClick={inviteWorker} disabled={busy || !invite.email.trim()}>
                      Пригласить
                    </button>
                  </div>
                </div>
              )}
            </div>

            {workers.map((w) => (
              <div key={w.id} className={card()}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">
                      {w.full_name || 'Без имени'}{' '}
                      <span className="text-xs text-white/50">
                        {w.role === 'admin' ? '(admin)' : ''} {w.active === false ? '(выключен)' : ''}
                      </span>
                    </div>
                    <div className="text-sm text-white/60">{w.email || 'Без email'}</div>

                    <div className="mt-3 grid gap-2">
                      {(w.assigned_sites || []).length === 0 ? (
                        <span className="text-sm text-white/40">Нет назначений</span>
                      ) : (
                        w.assigned_sites.map((s) => {
                          const k = keyPair(String(s.id), String(w.id));
                          const note = noteByPair.get(k) ?? (s.extra_note ?? '') ?? '';
                          const open = !!noteOpen[k];
                          const draft = noteDraft[k] ?? note;

                          return (
                            <div key={s.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm text-white/90">{siteLabel(s)}</div>
                                  {note ? (
                                    <div className="mt-1 line-clamp-2 text-xs text-amber-200/80">Экстра: {note}</div>
                                  ) : (
                                    <div className="mt-1 text-xs text-white/35">Экстра: —</div>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button className={btnBase()} onClick={() => setNoteOpen((p) => ({ ...p, [k]: !open }))} disabled={busy}>
                                    {open ? 'Скрыть' : 'Редактировать'}
                                  </button>
                                  <button className={btnBase()} onClick={() => unassign(String(s.id), String(w.id))} disabled={busy}>
                                    Снять
                                  </button>
                                </div>
                              </div>

                              {open && (
                                <div className="mt-3 grid gap-2">
                                  <textarea
                                    className={`${textareaBase()} min-h-[84px]`}
                                    value={draft}
                                    onChange={(e) => setNoteDraft((p) => ({ ...p, [k]: e.target.value }))}
                                    placeholder="Экстра / заметка по объекту для этого работника…"
                                  />
                                  <div className="flex justify-end">
                                    <button className={btnPrimary()} onClick={() => saveAssignmentNote(String(s.id), String(w.id))} disabled={busy}>
                                      Сохранить заметку
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-amber-200/90 hover:text-amber-200">Техданные</summary>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/70">{pill(`UUID: ${w.id}`)}</div>
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
                            {siteLabel(s)}
                          </option>
                        ))}
                      </select>
                      <button
                        className={btnPrimary()}
                        onClick={() => assign(assignSiteByWorker[w.id] || '', String(w.id))}
                        disabled={busy || !assignSiteByWorker[w.id]}
                      >
                        Назначить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {workers.length === 0 && <div className="text-sm text-white/50">Пользователей нет</div>}
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
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div>
                  <div className="mb-1 text-xs text-white/60">Объект</div>
                  <select className={selectBase()} value={jobForm.site_id} onChange={(e) => setJobForm((p) => ({ ...p, site_id: e.target.value }))}>
                    <option value="">Выбери объект…</option>
                    {sitesMini.map((s) => (
                      <option key={s.id} value={s.id}>
                        {siteLabel(s)}
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
                    {jobForm.site_id && getAllowedWorkersForSite(jobForm.site_id).length === 0 && <option value="">Нет назначенных работников</option>}
                    {jobForm.site_id && getAllowedWorkersForSite(jobForm.site_id).length > 0 && (
                      <>
                        <option value="">Выбери…</option>
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
                  <input
                    className={inputBase()}
                    type="time"
                    value={jobForm.scheduled_time}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time: e.target.value }))}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button className={btnPrimary()} onClick={createJob} disabled={busy || !jobForm.site_id || !jobForm.worker_id || !jobForm.job_date || !jobForm.scheduled_time}>
                  Создать
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className={card()}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-base font-semibold">Planned</div>
                  <div className="text-xs text-white/50">{planned.length}</div>
                </div>
                <div className="grid gap-3">{planned.map(renderJobCard)}</div>
              </div>

              <div className={card()}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-base font-semibold">In progress</div>
                  <div className="text-xs text-white/50">{inProgress.length}</div>
                </div>
                <div className="grid gap-3">{inProgress.map(renderJobCard)}</div>
              </div>

              <div className={card()}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-base font-semibold">Done</div>
                  <div className="text-xs text-white/50">{done.length}</div>
                </div>
                <div className="grid gap-3">{done.map(renderJobCard)}</div>
              </div>
            </div>
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
