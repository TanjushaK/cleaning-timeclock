'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Site = {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_m?: number | null;
  notes?: string | null;
  photo_url?: string | null;
  archived_at?: string | null;
};

type Worker = {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  avatar_url?: string | null;
  active?: boolean | null;
  role?: string | null;
};

type Assignment = {
  site_id: string;
  worker_id: string;
  extra_note?: string | null;
};

function clsx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

function titleWorker(w: Worker) {
  const a = [w.first_name, w.last_name].filter(Boolean).join(' ').trim();
  const b = (w.full_name ?? '').trim();
  const name = a || b || 'Без имени';
  return w.email ? `${name} (${w.email})` : name;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authFetchJson<T>(
  url: string,
  opts?: { method?: string; body?: any; signal?: AbortSignal }
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Нет входа (нет токена).');

  const res = await fetch(url, {
    method: opts?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts?.signal,
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg = payload?.error || payload?.message || `Ошибка запроса (${res.status})`;
    throw new Error(msg);
  }

  return payload as T;
}

async function authFetchForm<T>(url: string, form: FormData): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Нет входа (нет токена).');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg = payload?.error || payload?.message || `Ошибка запроса (${res.status})`;
    throw new Error(msg);
  }

  return payload as T;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[#3b3212] bg-black/30 px-2.5 py-1 text-xs text-[#d9c37a]">
      {children}
    </span>
  );
}

function GoldButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }
) {
  const { className, variant = 'primary', ...rest } = props;
  const base =
    'rounded-full px-4 py-2 text-sm transition border disabled:opacity-50 disabled:cursor-not-allowed';
  const primary =
    'border-[#6b5a1c] bg-gradient-to-b from-[#1a1606] to-[#0b0902] text-[#f2e6b8] hover:from-[#221c08] hover:to-[#0b0902]';
  const ghost = 'border-[#3b3212] bg-black/20 text-[#d9c37a] hover:bg-black/30';
  return (
    <button {...rest} className={clsx(base, variant === 'primary' ? primary : ghost, className)} />
  );
}

function SmallActionButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'gold' | 'danger' }
) {
  const { className, tone = 'gold', ...rest } = props;
  const base =
    'rounded-full px-3 py-1.5 text-xs transition border disabled:opacity-50 disabled:cursor-not-allowed';
  const gold = 'border-[#3b3212] bg-black/20 text-[#d9c37a] hover:bg-black/30';
  const danger = 'border-[#3b1212] bg-black/20 text-[#f0b6b6] hover:bg-black/30';
  return <button {...rest} className={clsx(base, tone === 'danger' ? danger : gold, className)} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={clsx(
        'w-full rounded-xl border border-[#3b3212] bg-black/30 px-3 py-2 text-sm text-[#f2e6b8] outline-none focus:border-[#7a6420]',
        className
      )}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={clsx(
        'w-full rounded-xl border border-[#3b3212] bg-black/30 px-3 py-2 text-sm text-[#f2e6b8] outline-none focus:border-[#7a6420]',
        className
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      className={clsx(
        'w-full appearance-none rounded-xl border border-[#3b3212] bg-black/30 px-3 py-2 text-sm text-[#f2e6b8] outline-none focus:border-[#7a6420]',
        className
      )}
    />
  );
}

function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-lg font-semibold text-[#f2e6b8]">{props.title}</div>
          <GoldButton variant="ghost" onClick={props.onClose}>
            Закрыть
          </GoldButton>
        </div>
        <div className="space-y-4">{props.children}</div>
        {props.footer ? (
          <div className="mt-5 flex items-center justify-end gap-2">{props.footer}</div>
        ) : null}
      </div>
    </div>
  );
}

function AdminInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const tab = (sp.get('tab') || 'sites') as 'sites' | 'workers' | 'jobs' | 'schedule';

  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);

  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [showArchive, setShowArchive] = useState(false);

  const [sites, setSites] = useState<Site[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [quickSiteId, setQuickSiteId] = useState('');
  const [quickWorkerId, setQuickWorkerId] = useState('');

  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [newSite, setNewSite] = useState({
    name: '',
    address: '',
    radius_m: '150',
    lat: '',
    lng: '',
    notes: '',
  });
  const [creatingSite, setCreatingSite] = useState(false);

  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ invite_link: string | null } | null>(null);
  const [newWorker, setNewWorker] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    notes: '',
    active: true,
  });

  const [workerOpen, setWorkerOpen] = useState(false);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [workerSaving, setWorkerSaving] = useState(false);
  const [workerDetail, setWorkerDetail] = useState<Worker | null>(null);
  const [workerDraft, setWorkerDraft] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    notes: '',
  });
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filteredSites = useMemo(() => {
    if (showArchive) return sites;
    return sites.filter((s) => !s.archived_at);
  }, [sites, showArchive]);

  const activeWorkers = useMemo(() => workers.filter((w) => w.active !== false), [workers]);
  const visibleWorkers = useMemo(() => (showArchive ? workers : activeWorkers), [showArchive, workers, activeWorkers]);

  const assignmentsBySite = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const arr = map.get(a.site_id) || [];
      arr.push(a);
      map.set(a.site_id, arr);
    }
    return map;
  }, [assignments]);

  const workerById = useMemo(() => {
    const map = new Map<string, Worker>();
    for (const w of workers) map.set(w.id, w);
    return map;
  }, [workers]);

  const counts = useMemo(() => {
    return {
      sites: filteredSites.length,
      workers: visibleWorkers.length,
      jobs: 0,
    };
  }, [filteredSites.length, visibleWorkers.length]);

  function setTab(next: typeof tab) {
    const qp = new URLSearchParams(sp.toString());
    qp.set('tab', next);
    router.replace(`/admin?${qp.toString()}`);
  }

  async function ensureSession() {
    const token = await getAccessToken();
    setSessionOk(Boolean(token));
    setChecking(false);
  }

  async function loadAll() {
    setLoading(true);
    setBanner(null);
    const ac = new AbortController();

    try {
      const [s, w, a] = await Promise.all([
        authFetchJson<{ sites: Site[] }>('/api/admin/sites/list', { signal: ac.signal }),
        authFetchJson<{ workers: Worker[] }>('/api/admin/workers/list', { signal: ac.signal }),
        authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments', { signal: ac.signal }),
      ]);
      setSites(s.sites || []);
      setWorkers(w.workers || []);
      setAssignments(a.assignments || []);
      setBanner({ kind: 'ok', text: 'Данные обновлены.' });
    } catch (e: any) {
      const msg = e?.message || 'Ошибка загрузки.';
      setBanner({ kind: 'err', text: msg });
      if (msg.toLowerCase().includes('нет входа') || msg.toLowerCase().includes('токен')) {
        await supabase.auth.signOut();
        setSessionOk(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function doLogout() {
    await supabase.auth.signOut();
    setSessionOk(false);
  }

  async function assign(site_id: string, worker_id: string) {
    if (!site_id || !worker_id) return;
    setBanner(null);
    try {
      await authFetchJson('/api/admin/assignments', { method: 'POST', body: { site_id, worker_id } });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Ошибка назначения.' });
    }
  }

  async function unassign(site_id: string, worker_id: string) {
    setBanner(null);
    try {
      await authFetchJson('/api/admin/assignments', { method: 'DELETE', body: { site_id, worker_id } });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Ошибка снятия.' });
    }
  }

  async function deleteSite(site_id: string) {
    const ok = window.confirm('Удалить объект? Это действие нельзя отменить.');
    if (!ok) return;

    setBanner(null);
    try {
      await authFetchJson('/api/admin/sites/delete', { method: 'POST', body: { site_id } });
      setBanner({ kind: 'ok', text: 'Объект удалён.' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось удалить объект.' });
    }
  }

  async function makeAdmin(worker_id: string) {
    setBanner(null);
    try {
      await authFetchJson('/api/admin/workers/set-role', { method: 'POST', body: { worker_id, role: 'admin' } });
      setBanner({ kind: 'ok', text: 'Роль обновлена: админ.' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось назначить админа.' });
    }
  }

  async function deleteWorker(worker_id: string) {
    const ok = window.confirm('Удалить работника? Это действие нельзя отменить.');
    if (!ok) return;

    setBanner(null);
    try {
      await authFetchJson('/api/admin/workers/delete', { method: 'POST', body: { worker_id } });
      setBanner({ kind: 'ok', text: 'Работник удалён.' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось удалить работника.' });
    }
  }

  function parseNumOrNull(v: string): number | null {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  async function createSite() {
    const name = newSite.name.trim();
    const address = newSite.address.trim();
    if (!name) return setBanner({ kind: 'err', text: 'Укажи название объекта.' });
    if (!address) return setBanner({ kind: 'err', text: 'Укажи адрес объекта.' });

    const radius_m = Number(newSite.radius_m);
    if (!Number.isFinite(radius_m) || radius_m <= 0) {
      return setBanner({ kind: 'err', text: 'Радиус должен быть числом больше 0.' });
    }

    const lat = parseNumOrNull(newSite.lat);
    const lng = parseNumOrNull(newSite.lng);

    setCreatingSite(true);
    setBanner(null);

    try {
      await authFetchJson('/api/admin/sites', {
        method: 'POST',
        body: { name, address, radius_m, notes: newSite.notes.trim() || null, lat, lng },
      });

      setAddSiteOpen(false);
      setNewSite({ name: '', address: '', radius_m: '150', lat: '', lng: '', notes: '' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось создать объект.' });
    } finally {
      setCreatingSite(false);
    }
  }

  async function openWorkerCard(workerId: string) {
    setWorkerOpen(true);
    setWorkerLoading(true);
    setWorkerDetail(null);
    setBanner(null);

    try {
      const data = await authFetchJson<{ worker: Worker }>(`/api/admin/workers/${workerId}`);
      const w = data.worker;
      setWorkerDetail(w);
      setWorkerDraft({
        first_name: (w.first_name ?? '').toString(),
        last_name: (w.last_name ?? '').toString(),
        phone: (w.phone ?? '').toString(),
        address: (w.address ?? '').toString(),
        notes: (w.notes ?? '').toString(),
      });
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось открыть карточку работника.' });
      setWorkerOpen(false);
    } finally {
      setWorkerLoading(false);
    }
  }

  async function saveWorkerCard() {
    if (!workerDetail?.id) return;

    setWorkerSaving(true);
    setBanner(null);

    try {
      const body = {
        first_name: workerDraft.first_name.trim() || null,
        last_name: workerDraft.last_name.trim() || null,
        phone: workerDraft.phone.trim() || null,
        address: workerDraft.address.trim() || null,
        notes: workerDraft.notes.trim() || null,
      };

      const res = await authFetchJson<{ ok: boolean; worker: Worker }>(`/api/admin/workers/${workerDetail.id}`, {
        method: 'PATCH',
        body,
      });

      setWorkerDetail(res.worker);
      setBanner({ kind: 'ok', text: 'Карточка работника сохранена.' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось сохранить.' });
    } finally {
      setWorkerSaving(false);
    }
  }

  async function uploadWorkerAvatar(file: File) {
    if (!workerDetail?.id) return;

    setBanner(null);
    try {
      const form = new FormData();
      form.append('worker_id', workerDetail.id);
      form.append('file', file);

      const res = await authFetchForm<{ ok: boolean; url: string }>('/api/admin/upload/avatar', form);

      const next = { ...(workerDetail || {}), avatar_url: res.url };
      setWorkerDetail(next);
      setBanner({ kind: 'ok', text: 'Фото обновлено.' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось загрузить фото.' });
    }
  }

  async function createWorkerInvite() {
    const email = newWorker.email.trim();
    if (!email) return setBanner({ kind: 'err', text: 'Email обязателен.' });

    setCreatingWorker(true);
    setBanner(null);
    setInviteResult(null);

    try {
      const payload = await authFetchJson<{ ok: boolean; user_id: string; invite_link: string | null }>(
        '/api/admin/workers/invite',
        {
          method: 'POST',
          body: {
            email,
            role: 'worker',
            active: Boolean(newWorker.active),
            first_name: newWorker.first_name.trim() || null,
            last_name: newWorker.last_name.trim() || null,
            phone: newWorker.phone.trim() || null,
            address: newWorker.address.trim() || null,
            notes: newWorker.notes.trim() || null,
          },
        }
      );

      setInviteResult({ invite_link: payload.invite_link ?? null });
      setBanner({ kind: 'ok', text: 'Работник добавлен. Приглашение отправлено.' });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Не удалось добавить работника.' });
    } finally {
      setCreatingWorker(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setBanner({ kind: 'ok', text: 'Ссылка скопирована.' });
    } catch {
      setBanner({ kind: 'err', text: 'Не удалось скопировать. Скопируй вручную.' });
    }
  }

  useEffect(() => {
    ensureSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => ensureSession());
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!checking && sessionOk) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, sessionOk]);

  if (checking) {
    return (
      <div className="min-h-screen bg-black text-[#f2e6b8]">
        <div className="mx-auto max-w-6xl p-6">Проверяю вход…</div>
      </div>
    );
  }

  if (!sessionOk) {
    return (
      <div className="min-h-screen bg-black text-[#f2e6b8]">
        <div className="mx-auto max-w-6xl p-6">
          <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-6">
            <div className="text-xl font-semibold">Админ-панель</div>
            <div className="mt-2 text-sm text-[#d9c37a]">Сначала войди на главной странице, затем открой /admin.</div>
            <div className="mt-4">
              <a className="text-sm text-[#e7d38c] underline decoration-[#7a6420] underline-offset-4" href="/">
                Перейти на вход
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#f2e6b8]">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">Админ-панель</div>
            <div className="text-sm text-[#d9c37a]">Tanija • объекты • работники • смены</div>
          </div>
          <div className="flex items-center gap-2">
            <GoldButton onClick={loadAll} disabled={loading}>
              {loading ? 'Обновляю…' : 'Обновить'}
            </GoldButton>
            <GoldButton onClick={doLogout} variant="ghost">
              Выйти
            </GoldButton>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GoldButton variant={tab === 'sites' ? 'primary' : 'ghost'} onClick={() => setTab('sites')}>
              Объекты
            </GoldButton>
            <GoldButton variant={tab === 'workers' ? 'primary' : 'ghost'} onClick={() => setTab('workers')}>
              Работники
            </GoldButton>
            <GoldButton variant={tab === 'jobs' ? 'primary' : 'ghost'} onClick={() => setTab('jobs')}>
              Смены
            </GoldButton>
            <GoldButton variant={tab === 'schedule' ? 'primary' : 'ghost'} onClick={() => setTab('schedule')}>
              График
            </GoldButton>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[#d9c37a]">
              <input
                type="checkbox"
                checked={showArchive}
                onChange={(e) => setShowArchive(e.target.checked)}
                className="h-4 w-4 accent-[#7a6420]"
              />
              Показать архив
            </label>
            <div className="rounded-full border border-[#3b3212] bg-black/20 px-3 py-2 text-sm text-[#d9c37a]">
              Объекты: {counts.sites} • Работники: {counts.workers} • Смены: {counts.jobs}
            </div>
          </div>
        </div>

        {banner ? (
          <div
            className={clsx(
              'mb-4 rounded-2xl border p-3 text-sm',
              banner.kind === 'ok'
                ? 'border-[#2f3b12] bg-[#0c1206] text-[#cfe3a0]'
                : 'border-[#3b1212] bg-[#120606] text-[#f0b6b6]'
            )}
          >
            {banner.text}
          </div>
        ) : null}

        {tab === 'sites' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-[#d9c37a]">Создай объект, затем назначь работников.</div>
              <GoldButton onClick={() => setAddSiteOpen(true)}>Добавить объект</GoldButton>
            </div>

            <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5">
              <div className="text-base font-semibold">Быстрое назначение</div>
              <div className="mt-1 text-sm text-[#d9c37a]">
                Назначение = доступ к объекту. Расписание делается в “Смены” и “График”.
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Объект</div>
                  <Select value={quickSiteId} onChange={(e) => setQuickSiteId(e.target.value)}>
                    <option value="">Выбери объект…</option>
                    {filteredSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Работник</div>
                  <Select value={quickWorkerId} onChange={(e) => setQuickWorkerId(e.target.value)}>
                    <option value="">Выбери работника…</option>
                    {activeWorkers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {titleWorker(w)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-end">
                  <GoldButton onClick={() => assign(quickSiteId, quickWorkerId)} disabled={!quickSiteId || !quickWorkerId}>
                    Назначить
                  </GoldButton>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {filteredSites.length === 0 ? (
                <div className="rounded-2xl border border-[#3b3212] bg-black/20 p-5 text-sm text-[#d9c37a]">
                  Пока нет объектов.
                </div>
              ) : null}

              {filteredSites.map((s) => {
                const assigned = assignmentsBySite.get(s.id) || [];
                return (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-semibold">{s.name}</div>
                          {s.archived_at ? <Badge>архив</Badge> : null}
                        </div>
                        <div className="mt-1 text-sm text-[#d9c37a]">{s.address || 'Адрес не указан'}</div>
                        <div className="mt-1 text-xs text-[#d9c37a]">
                          GPS: {s.lat ?? 'нет'} , {s.lng ?? 'нет'} • радиус: {s.radius_m ?? 150}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <SmallActionButton
                          tone="danger"
                          onClick={() => deleteSite(s.id)}
                          title="Удалить объект"
                        >
                          Удалить объект
                        </SmallActionButton>
                      </div>

                      <div className="min-w-[260px]">
                        <div className="mb-1 text-xs text-[#d9c37a]">Добавить работника</div>
                        <div className="flex items-center gap-2">
                          <Select
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v) assign(s.id, v);
                              e.currentTarget.value = '';
                            }}
                            defaultValue=""
                          >
                            <option value="">Выбери работника…</option>
                            {activeWorkers.map((w) => (
                              <option key={w.id} value={w.id}>
                                {titleWorker(w)}
                              </option>
                            ))}
                          </Select>
                          <GoldButton variant="ghost" onClick={() => loadAll()}>
                            Обновить
                          </GoldButton>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 text-xs text-[#d9c37a]">Назначены:</div>
                      <div className="flex flex-wrap gap-2">
                        {assigned.length === 0 ? (
                          <div className="text-sm text-[#d9c37a]">Никого нет.</div>
                        ) : (
                          assigned.map((a) => {
                            const w = workerById.get(a.worker_id);
                            const label = w ? titleWorker(w) : a.worker_id;
                            return (
                              <div
                                key={`${a.site_id}-${a.worker_id}`}
                                className="flex items-center gap-2 rounded-full border border-[#3b3212] bg-black/30 px-3 py-1.5 text-sm"
                              >
                                <span>{label}</span>
                                <button
                                  className="rounded-full border border-[#3b3212] px-2 py-0.5 text-xs text-[#d9c37a] hover:bg-black/30"
                                  onClick={() => unassign(a.site_id, a.worker_id)}
                                >
                                  снять
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Modal
              open={addSiteOpen}
              title="Добавить объект"
              onClose={() => !creatingSite && setAddSiteOpen(false)}
              footer={
                <>
                  <GoldButton variant="ghost" onClick={() => setAddSiteOpen(false)} disabled={creatingSite}>
                    Отмена
                  </GoldButton>
                  <GoldButton onClick={createSite} disabled={creatingSite}>
                    {creatingSite ? 'Создаю…' : 'Создать'}
                  </GoldButton>
                </>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-[#d9c37a]">Название</div>
                  <Input value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-[#d9c37a]">Адрес</div>
                  <Input value={newSite.address} onChange={(e) => setNewSite({ ...newSite, address: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Радиус (м)</div>
                  <Input value={newSite.radius_m} onChange={(e) => setNewSite({ ...newSite, radius_m: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Заметка</div>
                  <Input value={newSite.notes} onChange={(e) => setNewSite({ ...newSite, notes: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">lat (необязательно)</div>
                  <Input value={newSite.lat} onChange={(e) => setNewSite({ ...newSite, lat: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">lng (необязательно)</div>
                  <Input value={newSite.lng} onChange={(e) => setNewSite({ ...newSite, lng: e.target.value })} />
                </div>
              </div>
            </Modal>
          </div>
        ) : null}

        {tab === 'workers' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-[#d9c37a]">Добавляй работников и открывай их карточки.</div>
              <GoldButton
                onClick={() => {
                  setInviteResult(null);
                  setAddWorkerOpen(true);
                }}
              >
                Добавить работника
              </GoldButton>
            </div>

            <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5">
              <div className="text-base font-semibold">Работники</div>

              <div className="mt-3 space-y-2">
                {visibleWorkers.length === 0 ? (
                  <div className="text-sm text-[#d9c37a]">Пока нет работников.</div>
                ) : null}

                {visibleWorkers.map((w) => {
                  const label = titleWorker(w);
                  const active = w.active !== false;
                  const isAdmin = (w.role || '').toLowerCase() === 'admin';

                  return (
                    <div
                      key={w.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openWorkerCard(w.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') openWorkerCard(w.id);
                      }}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#3b3212] bg-black/20 px-4 py-3 text-left hover:bg-black/30"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-[#3b3212] bg-black/30">
                          {w.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={w.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-[#d9c37a]">
                              фото
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-sm">{label}</div>
                          <div className="mt-0.5 truncate text-xs text-[#d9c37a]">{w.phone || w.address || ''}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge>{active ? 'активен' : 'неактивен'}</Badge>
                        {isAdmin ? <Badge>админ</Badge> : null}

                        <SmallActionButton
                          disabled={isAdmin}
                          onClick={(e) => {
                            e.stopPropagation();
                            makeAdmin(w.id);
                          }}
                          title={isAdmin ? 'Уже админ' : 'Сделать админом'}
                        >
                          Сделать админом
                        </SmallActionButton>

                        <SmallActionButton
                          tone="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteWorker(w.id);
                          }}
                          title="Удалить работника"
                        >
                          Удалить
                        </SmallActionButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Modal
              open={addWorkerOpen}
              title="Добавить работника"
              onClose={() => !creatingWorker && setAddWorkerOpen(false)}
              footer={
                <>
                  <GoldButton variant="ghost" onClick={() => setAddWorkerOpen(false)} disabled={creatingWorker}>
                    Закрыть
                  </GoldButton>
                  <GoldButton onClick={createWorkerInvite} disabled={creatingWorker}>
                    {creatingWorker ? 'Добавляю…' : 'Добавить'}
                  </GoldButton>
                </>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-[#d9c37a]">Email (обязательно)</div>
                  <Input value={newWorker.email} onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Имя</div>
                  <Input value={newWorker.first_name} onChange={(e) => setNewWorker({ ...newWorker, first_name: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Фамилия</div>
                  <Input value={newWorker.last_name} onChange={(e) => setNewWorker({ ...newWorker, last_name: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Телефон</div>
                  <Input value={newWorker.phone} onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })} />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[#d9c37a]">Адрес</div>
                  <Input value={newWorker.address} onChange={(e) => setNewWorker({ ...newWorker, address: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-[#d9c37a]">Заметки</div>
                  <Textarea rows={4} value={newWorker.notes} onChange={(e) => setNewWorker({ ...newWorker, notes: e.target.value })} />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-[#d9c37a]">
                    <input
                      type="checkbox"
                      checked={newWorker.active}
                      onChange={(e) => setNewWorker({ ...newWorker, active: e.target.checked })}
                      className="h-4 w-4 accent-[#7a6420]"
                    />
                    Активен
                  </label>
                </div>
              </div>

              {inviteResult?.invite_link ? (
                <div className="rounded-2xl border border-[#3b3212] bg-black/20 p-4">
                  <div className="text-sm font-semibold">Ссылка-приглашение</div>
                  <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
                    <Input value={inviteResult.invite_link} readOnly />
                    <GoldButton variant="ghost" onClick={() => copyToClipboard(inviteResult.invite_link || '')}>
                      Копировать
                    </GoldButton>
                  </div>
                </div>
              ) : null}
            </Modal>

            <Modal
              open={workerOpen}
              title={workerDetail ? `Карточка работника: ${titleWorker(workerDetail)}` : 'Карточка работника'}
              onClose={() => !workerSaving && setWorkerOpen(false)}
              footer={
                <>
                  <GoldButton variant="ghost" onClick={() => setWorkerOpen(false)} disabled={workerSaving}>
                    Закрыть
                  </GoldButton>
                  <GoldButton onClick={saveWorkerCard} disabled={workerSaving || workerLoading || !workerDetail}>
                    {workerSaving ? 'Сохраняю…' : 'Сохранить'}
                  </GoldButton>
                </>
              }
            >
              {workerLoading ? (
                <div className="text-sm text-[#d9c37a]">Загружаю…</div>
              ) : workerDetail ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex w-full items-start gap-4 md:w-auto">
                      <div className="h-20 w-20 overflow-hidden rounded-2xl border border-[#3b3212] bg-black/30">
                        {workerDetail.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={workerDetail.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-[#d9c37a]">
                            нет фото
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{titleWorker(workerDetail)}</div>
                        <div className="mt-1 text-xs text-[#d9c37a]">
                          ID: <span className="select-all">{workerDetail.id}</span>
                        </div>
                        <div className="mt-1 text-xs text-[#d9c37a]">
                          Статус: {workerDetail.active === false ? 'неактивен' : 'активен'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadWorkerAvatar(f);
                          if (fileRef.current) fileRef.current.value = '';
                        }}
                      />
                      <GoldButton variant="ghost" onClick={() => fileRef.current?.click()} disabled={!workerDetail}>
                        Загрузить фото
                      </GoldButton>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-[#d9c37a]">Имя</div>
                      <Input value={workerDraft.first_name} onChange={(e) => setWorkerDraft({ ...workerDraft, first_name: e.target.value })} />
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-[#d9c37a]">Фамилия</div>
                      <Input value={workerDraft.last_name} onChange={(e) => setWorkerDraft({ ...workerDraft, last_name: e.target.value })} />
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-[#d9c37a]">Телефон</div>
                      <Input value={workerDraft.phone} onChange={(e) => setWorkerDraft({ ...workerDraft, phone: e.target.value })} />
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-[#d9c37a]">Адрес</div>
                      <Input value={workerDraft.address} onChange={(e) => setWorkerDraft({ ...workerDraft, address: e.target.value })} />
                    </div>

                    <div className="md:col-span-2">
                      <div className="mb-1 text-xs text-[#d9c37a]">Заметки</div>
                      <Textarea rows={5} value={workerDraft.notes} onChange={(e) => setWorkerDraft({ ...workerDraft, notes: e.target.value })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[#d9c37a]">Нет данных.</div>
              )}
            </Modal>
          </div>
        ) : null}

        {tab === 'jobs' ? (
          <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-6">
            <div className="text-base font-semibold">Смены</div>
            <div className="mt-2 text-sm text-[#d9c37a]">Раздел в разработке.</div>
          </div>
        ) : null}

        {tab === 'schedule' ? (
          <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-6">
            <div className="text-base font-semibold">График</div>
            <div className="mt-2 text-sm text-[#d9c37a]">Раздел в разработке.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-[#f2e6b8]">
          <div className="mx-auto max-w-6xl p-6">Загружаю…</div>
        </div>
      }
    >
      <AdminInner />
    </Suspense>
  );
}
