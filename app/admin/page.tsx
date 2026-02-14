'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
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
  archived_at?: string | null;
};

type Worker = {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  active?: boolean | null;
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
  if (!token) {
    throw new Error('Нет входа (нет токена).');
  }

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
    // ignore
  }

  if (!res.ok) {
    const msg =
      payload?.error ||
      payload?.message ||
      `Ошибка запроса (${res.status})`;
    throw new Error(msg);
  }

  return payload as T;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#6b5a1a] bg-black/40 px-2 py-0.5 text-xs text-[#e7d38c]">
      {children}
    </span>
  );
}

function GoldButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const { className, variant = 'primary', ...rest } = props;
  return (
    <button
      {...rest}
      className={clsx(
        'rounded-full px-4 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'border border-[#7a6420] bg-gradient-to-b from-[#1a1606] to-[#0e0c06] text-[#e7d38c] hover:border-[#9b7f2a]'
          : 'border border-[#3b3212] bg-black/20 text-[#d9c37a] hover:border-[#7a6420]',
        className
      )}
    />
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={clsx(
        'w-full rounded-xl border border-[#3b3212] bg-black/30 px-3 py-2 text-sm text-[#f2e6b8] placeholder:text-[#7d6b2a] outline-none focus:border-[#7a6420]',
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
        'w-full rounded-xl border border-[#3b3212] bg-black/30 px-3 py-2 text-sm text-[#f2e6b8] placeholder:text-[#7d6b2a] outline-none focus:border-[#7a6420]',
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
      <div
        className="absolute inset-0 bg-black/70"
        onClick={props.onClose}
      />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-lg font-semibold text-[#f2e6b8]">
            {props.title}
          </div>
          <GoldButton variant="ghost" onClick={props.onClose}>
            Закрыть
          </GoldButton>
        </div>
        <div className="space-y-4">{props.children}</div>
        {props.footer ? (
          <div className="mt-5 flex items-center justify-end gap-2">
            {props.footer}
          </div>
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

  // Добавить объект (modal)
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

  const filteredSites = useMemo(() => {
    if (showArchive) return sites;
    return sites.filter((s) => !s.archived_at);
  }, [sites, showArchive]);

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
      await authFetchJson('/api/admin/assignments', {
        method: 'POST',
        body: { site_id, worker_id },
      });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Ошибка назначения.' });
    }
  }

  async function unassign(site_id: string, worker_id: string) {
    setBanner(null);
    try {
      await authFetchJson('/api/admin/assignments', {
        method: 'DELETE',
        body: { site_id, worker_id },
      });
      await loadAll();
    } catch (e: any) {
      setBanner({ kind: 'err', text: e?.message || 'Ошибка снятия.' });
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

    if (!name) {
      setBanner({ kind: 'err', text: 'Укажи название объекта.' });
      return;
    }
    if (!address) {
      setBanner({ kind: 'err', text: 'Укажи адрес объекта.' });
      return;
    }

    const radius_m = Number(newSite.radius_m);
    if (!Number.isFinite(radius_m) || radius_m <= 0) {
      setBanner({ kind: 'err', text: 'Радиус должен быть числом больше 0.' });
      return;
    }

    const lat = parseNumOrNull(newSite.lat);
    const lng = parseNumOrNull(newSite.lng);

    setCreatingSite(true);
    setBanner(null);

    try {
      await authFetchJson('/api/admin/sites', {
        method: 'POST',
        body: {
          name,
          address,
          radius_m,
          notes: newSite.notes.trim() || null,
          lat,
          lng,
        },
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

  useEffect(() => {
    ensureSession();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      ensureSession();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!checking && sessionOk) {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, sessionOk]);

  const counts = useMemo(() => {
    return {
      sites: filteredSites.length,
      workers: workers.length,
      jobs: 0,
    };
  }, [filteredSites.length, workers.length]);

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
            <div className="mt-2 text-sm text-[#d9c37a]">
              Сначала войди на главной странице, затем открой /admin.
            </div>
            <div className="mt-4">
              <a
                className="text-sm text-[#e7d38c] underline decoration-[#7a6420] underline-offset-4"
                href="/"
              >
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
        {/* Header */}
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

        {/* Tabs row + counters */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GoldButton
              variant={tab === 'sites' ? 'primary' : 'ghost'}
              onClick={() => setTab('sites')}
            >
              Объекты
            </GoldButton>
            <GoldButton
              variant={tab === 'workers' ? 'primary' : 'ghost'}
              onClick={() => setTab('workers')}
            >
              Работники
            </GoldButton>
            <GoldButton
              variant={tab === 'jobs' ? 'primary' : 'ghost'}
              onClick={() => setTab('jobs')}
            >
              Смены
            </GoldButton>
            <GoldButton
              variant={tab === 'schedule' ? 'primary' : 'ghost'}
              onClick={() => setTab('schedule')}
            >
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

        {/* Content */}
        {tab === 'sites' ? (
          <div className="space-y-4">
            {/* NEW: Add site button */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-[#d9c37a]">
                Создай объект, затем назначь работников.
              </div>
              <GoldButton onClick={() => setAddSiteOpen(true)}>
                Добавить объект
              </GoldButton>
            </div>

            {/* Quick assign */}
            <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5">
              <div className="text-base font-semibold">Быстрое назначение</div>
              <div className="mt-1 text-sm text-[#d9c37a]">
                Назначение = доступ к объекту. Расписание делается в “Смены” и “График”.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
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
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {titleWorker(w)}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex items-end">
                  <GoldButton
                    onClick={() => assign(quickSiteId, quickWorkerId)}
                    disabled={!quickSiteId || !quickWorkerId}
                  >
                    Назначить
                  </GoldButton>
                </div>
              </div>
            </div>

            {/* Sites list */}
            {filteredSites.map((s) => {
              const as = assignmentsBySite.get(s.id) || [];
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-semibold">{s.name}</div>
                        <Badge>{s.archived_at ? 'архив' : 'активен'}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-[#d9c37a]">
                        {s.address ? s.address : 'Адрес не задан'}
                      </div>
                      <div className="mt-1 text-xs text-[#d9c37a]">
                        GPS:{' '}
                        {s.lat != null && s.lng != null
                          ? `${s.lat}, ${s.lng}`
                          : 'нет lat/lng'}{' '}
                        • радиус: {s.radius_m ?? 150}
                      </div>

                      <div className="mt-3 text-sm text-[#d9c37a]">Назначены:</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {as.length === 0 ? (
                          <span className="text-sm text-[#7d6b2a]">Пока никого нет.</span>
                        ) : (
                          as.map((a) => {
                            const w = workerById.get(a.worker_id);
                            const label = w ? titleWorker(w) : a.worker_id;
                            return (
                              <span
                                key={`${a.site_id}:${a.worker_id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-[#3b3212] bg-black/25 px-3 py-1 text-sm text-[#f2e6b8]"
                              >
                                {label}
                                <button
                                  className="rounded-full border border-[#3b3212] bg-black/20 px-2 py-0.5 text-xs text-[#d9c37a] hover:border-[#7a6420]"
                                  onClick={() => unassign(a.site_id, a.worker_id)}
                                >
                                  снять
                                </button>
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="min-w-[280px]">
                      <div className="flex justify-end">
                        <GoldButton variant="ghost" disabled title="Архивирование будет отдельно">
                          В архив
                        </GoldButton>
                      </div>

                      <div className="mt-6">
                        <div className="mb-1 text-xs text-[#d9c37a]">Добавить работника</div>
                        <div className="flex gap-2">
                          <Select
                            value={quickWorkerId}
                            onChange={(e) => setQuickWorkerId(e.target.value)}
                          >
                            <option value="">Выбери работника…</option>
                            {workers.map((w) => (
                              <option key={w.id} value={w.id}>
                                {titleWorker(w)}
                              </option>
                            ))}
                          </Select>
                          <GoldButton
                            onClick={() => assign(s.id, quickWorkerId)}
                            disabled={!quickWorkerId}
                          >
                            Назначить
                          </GoldButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : tab === 'workers' ? (
          <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5">
            <div className="text-base font-semibold">Работники</div>
            <div className="mt-2 text-sm text-[#d9c37a]">
              Сейчас задача: кнопка “Добавить объект”. Раздел работники оставила как есть (список).
            </div>

            <div className="mt-4 space-y-2">
              {workers.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#3b3212] bg-black/20 p-3"
                >
                  <div className="text-sm">{titleWorker(w)}</div>
                  <Badge>{w.active === false ? 'неактивен' : 'активен'}</Badge>
                </div>
              ))}
            </div>
          </div>
        ) : tab === 'jobs' ? (
          <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5">
            <div className="text-base font-semibold">Смены</div>
            <div className="mt-2 text-sm text-[#d9c37a]">Раздел без изменений (дальше доделаем отдельно).</div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#3b3212] bg-gradient-to-b from-[#0f0f0f] to-[#070707] p-5">
            <div className="text-base font-semibold">График</div>
            <div className="mt-2 text-sm text-[#d9c37a]">Раздел без изменений (дальше доделаем отдельно).</div>
          </div>
        )}

        {/* Add site modal */}
        <Modal
          open={addSiteOpen}
          title="Добавить объект"
          onClose={() => {
            if (!creatingSite) setAddSiteOpen(false);
          }}
          footer={
            <>
              <GoldButton
                variant="ghost"
                onClick={() => setAddSiteOpen(false)}
                disabled={creatingSite}
              >
                Отмена
              </GoldButton>
              <GoldButton onClick={createSite} disabled={creatingSite}>
                {creatingSite ? 'Сохраняю…' : 'Сохранить'}
              </GoldButton>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-[#d9c37a]">Название</div>
              <Input
                value={newSite.name}
                onChange={(e) => setNewSite((p) => ({ ...p, name: e.target.value }))}
                placeholder="Например: Дом, Офис, Склад…"
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-[#d9c37a]">Адрес</div>
              <Input
                value={newSite.address}
                onChange={(e) => setNewSite((p) => ({ ...p, address: e.target.value }))}
                placeholder="Улица, дом, город…"
              />
              <div className="mt-1 text-xs text-[#7d6b2a]">
                Если не указать lat/lng — у работника START будет запрещён.
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-[#d9c37a]">Радиус (метры)</div>
              <Input
                value={newSite.radius_m}
                onChange={(e) => setNewSite((p) => ({ ...p, radius_m: e.target.value }))}
                inputMode="numeric"
                placeholder="150"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-[#d9c37a]">Заметки</div>
              <Input
                value={newSite.notes}
                onChange={(e) => setNewSite((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Код домофона, нюансы…"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-[#d9c37a]">Широта (lat)</div>
              <Input
                value={newSite.lat}
                onChange={(e) => setNewSite((p) => ({ ...p, lat: e.target.value }))}
                placeholder="52.07532"
              />
            </div>

            <div>
              <div className="mb-1 text-xs text-[#d9c37a]">Долгота (lng)</div>
              <Input
                value={newSite.lng}
                onChange={(e) => setNewSite((p) => ({ ...p, lng: e.target.value }))}
                placeholder="4.66988"
              />
            </div>

            <div className="md:col-span-2">
              <div className="mb-1 text-xs text-[#d9c37a]">Комментарий (длинный)</div>
              <Textarea
                value={newSite.notes}
                onChange={(e) => setNewSite((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                placeholder="Можно оставить пустым…"
              />
            </div>
          </div>
        </Modal>
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
