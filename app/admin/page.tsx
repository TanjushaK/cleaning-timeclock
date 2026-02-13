'use client';

import Image from 'next/image';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authFetchJson } from '@/lib/auth-fetch';

export const dynamic = 'force-dynamic';

type Site = {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
  archived?: boolean | null;
};

type Profile = {
  id: string;
  role: string | null;
  active: boolean | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type Assignment = {
  site_id: string;
  worker_id: string;
  extra_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(' ');
}

function formatRuDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'px-5 py-3 rounded-2xl border text-base transition',
        'bg-black/40 backdrop-blur',
        active
          ? 'border-yellow-500/60 text-yellow-200 shadow-[0_0_0_1px_rgba(234,179,8,0.35)]'
          : 'border-yellow-500/20 text-yellow-100/80 hover:border-yellow-500/40'
      )}
    >
      {children}
    </button>
  );
}

function Banner({ kind, text }: { kind: 'error' | 'info' | 'ok'; text: string }) {
  const base =
    'w-full rounded-2xl border px-5 py-4 text-sm md:text-base backdrop-blur';
  const cls =
    kind === 'error'
      ? 'border-red-500/30 bg-red-950/30 text-red-100'
      : kind === 'ok'
        ? 'border-emerald-500/30 bg-emerald-950/25 text-emerald-100'
        : 'border-yellow-500/20 bg-yellow-950/15 text-yellow-100';
  return <div className={cx(base, cls)}>{text}</div>;
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full rounded-3xl border border-yellow-500/15 bg-black/35 backdrop-blur p-6 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-yellow-100">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-sm text-yellow-100/60">{subtitle}</div>
          ) : null}
        </div>
        {right}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function AdminInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const tab = (sp.get('tab') || 'sites') as 'sites' | 'workers' | 'jobs';
  const [busy, setBusy] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [globalMsg, setGlobalMsg] = useState<{ kind: 'error' | 'info' | 'ok'; text: string } | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');

  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [newSiteRadius, setNewSiteRadius] = useState('100');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Вариант B: показывать архив/неактивных только по флажку
  const [showArchivedSites, setShowArchivedSites] = useState(false);
  const [showInactiveWorkers, setShowInactiveWorkers] = useState(false);

  const sitesById = useMemo(() => {
    const m = new Map<string, Site>();
    for (const s of sites) m.set(s.id, s);
    return m;
  }, [sites]);

  const workersById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const w of workers) m.set(w.id, w);
    return m;
  }, [workers]);

  const visibleSites = useMemo(() => {
    if (showArchivedSites) return sites;
    return sites.filter((s) => !s.archived);
  }, [sites, showArchivedSites]);

  const visibleWorkers = useMemo(() => {
    if (showInactiveWorkers) return workers;
    return workers.filter((w) => Boolean(w.active));
  }, [workers, showInactiveWorkers]);

  const visibleAssignments = useMemo(() => {
    const siteAllowed = new Set(visibleSites.map((s) => s.id));
    const workerAllowed = new Set(visibleWorkers.map((w) => w.id));
    return assignments.filter((a) => siteAllowed.has(a.site_id) && workerAllowed.has(a.worker_id));
  }, [assignments, visibleSites, visibleWorkers]);

  async function refreshAll() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const sitesUrl = showArchivedSites
        ? '/api/admin/sites/list?include_archived=1'
        : '/api/admin/sites/list';

      const [s, w, a, j] = await Promise.all([
        authFetchJson<{ sites: Site[] }>(sitesUrl),
        authFetchJson<{ workers: Profile[] }>('/api/admin/workers/list'),
        authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments'),
        authFetchJson<{ jobs: any[] }>('/api/admin/jobs'),
      ]);

      setSites(s.sites || []);
      setWorkers(w.workers || []);
      setAssignments(a.assignments || []);
      setJobs(j.jobs || []);
      setGlobalMsg({ kind: 'ok', text: 'Данные обновлены' });
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSessionEmail(null);
    setAuthLoading(false);
    setGlobalMsg({ kind: 'info', text: 'Вышли. Зайди снова.' });
  }

  async function handleLogin() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPass,
      });
      if (error) throw error;
      setSessionEmail(data.user?.email ?? null);
      setGlobalMsg({ kind: 'ok', text: 'Вход выполнен' });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function createSite() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const payload = {
        name: newSiteName.trim(),
        address: newSiteAddress.trim(),
        radius_m: Number(String(newSiteRadius || '0').replace(',', '.')) || 100,
      };
      await authFetchJson('/api/admin/sites', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setNewSiteName('');
      setNewSiteAddress('');
      setNewSiteRadius('100');
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function inviteWorker() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const payload: any = {
        email: inviteEmail.trim(),
      };
      if (inviteFullName.trim()) payload.full_name = inviteFullName.trim();
      if (invitePassword.trim()) payload.password = invitePassword;
      await authFetchJson('/api/admin/workers/invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setInviteEmail('');
      setInviteFullName('');
      setInvitePassword('');
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function assign(siteId: string, workerId: string) {
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson('/api/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({ site_id: siteId, worker_id: workerId }),
      });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function unassign(siteId: string, workerId: string) {
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson('/api/admin/assignments', {
        method: 'DELETE',
        body: JSON.stringify({ site_id: siteId, worker_id: workerId }),
      });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function setSiteArchived(siteId: string, archived: boolean) {
    const ok = window.confirm(
      archived
        ? 'Архивировать объект? Он исчезнет из списка по умолчанию.'
        : 'Вернуть объект из архива? Он снова появится в списке.'
    );
    if (!ok) return;

    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson('/api/admin/sites/archive', {
        method: 'POST',
        body: JSON.stringify({ site_id: siteId, archived }),
      });
      await refreshAll();
      setGlobalMsg({
        kind: 'ok',
        text: archived ? 'Объект отправлен в архив' : 'Объект возвращён из архива',
      });
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  async function setWorkerActive(workerId: string, active: boolean) {
    const ok = window.confirm(
      active
        ? 'Активировать работника? Он сможет входить и работать.'
        : 'Деактивировать работника? Он не сможет входить (история сохранится).'
    );
    if (!ok) return;

    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson('/api/admin/workers/toggle-active', {
        method: 'POST',
        body: JSON.stringify({ worker_id: workerId, active }),
      });
      await refreshAll();
      setGlobalMsg({
        kind: 'ok',
        text: active ? 'Работник активирован' : 'Работник деактивирован',
      });
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        const email = data?.session?.user?.email ?? null;
        setSessionEmail(email);
      } finally {
        if (alive) setAuthLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authLoading && sessionEmail) {
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, sessionEmail]);

  useEffect(() => {
    if (!authLoading && sessionEmail) {
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedSites, showInactiveWorkers]);

  const headerRight = (
    <div className="flex items-center gap-3">
      <button
        onClick={refreshAll}
        disabled={busy || !sessionEmail}
        className={cx(
          'px-5 py-3 rounded-2xl border transition',
          'border-yellow-500/25 bg-yellow-950/20 text-yellow-100',
          busy || !sessionEmail ? 'opacity-60' : 'hover:border-yellow-500/45'
        )}
      >
        {busy ? 'Обновляю…' : 'Обновить данные'}
      </button>
      <button
        onClick={handleLogout}
        disabled={busy}
        className={cx(
          'px-5 py-3 rounded-2xl border transition',
          'border-yellow-500/25 bg-yellow-950/10 text-yellow-100/90',
          busy ? 'opacity-60' : 'hover:border-yellow-500/45'
        )}
      >
        Выйти
      </button>
    </div>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-yellow-100/70">Загрузка…</div>
      </div>
    );
  }

  if (!sessionEmail) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl border border-yellow-500/20 bg-black/40 flex items-center justify-center overflow-hidden">
              <Image src="/tanija-logo.png" alt="Tanija" width={36} height={36} />
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-100">Tanija — Админка</div>
              <div className="text-yellow-100/60">Объекты · Работники · Смены</div>
            </div>
          </div>

          <div className="mt-6">
            {globalMsg ? <Banner kind={globalMsg.kind} text={globalMsg.text} /> : null}
          </div>

          <div className="mt-6">
            <Card title="Вход" subtitle="Только для админа">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
                <input
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="Пароль"
                  type="password"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
                <button
                  onClick={handleLogin}
                  disabled={busy}
                  className={cx(
                    'w-full rounded-2xl px-5 py-3 font-semibold transition',
                    'bg-yellow-500 text-black',
                    busy ? 'opacity-70' : 'hover:brightness-110'
                  )}
                >
                  Войти
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl border border-yellow-500/20 bg-black/40 flex items-center justify-center overflow-hidden">
              <Image src="/tanija-logo.png" alt="Tanija" width={36} height={36} />
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-100">Tanija — Админка</div>
              <div className="text-yellow-100/60">Объекты · Работники · Смены</div>
              <div className="mt-1 text-xs text-yellow-100/40">Вы: {sessionEmail}</div>
            </div>
          </div>

          {headerRight}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <TabButton
            active={tab === 'sites'}
            onClick={() => router.push('/admin?tab=sites')}
          >
            Объекты
          </TabButton>
          <TabButton
            active={tab === 'workers'}
            onClick={() => router.push('/admin?tab=workers')}
          >
            Работники
          </TabButton>
          <TabButton
            active={tab === 'jobs'}
            onClick={() => router.push('/admin?tab=jobs')}
          >
            Смены (Kanban)
          </TabButton>

          <div className="flex items-center gap-3 ml-0 md:ml-4">
            <label className="flex items-center gap-2 text-sm text-yellow-100/70 select-none">
              <input
                type="checkbox"
                checked={showArchivedSites}
                onChange={(e) => setShowArchivedSites(e.target.checked)}
                className="accent-yellow-500"
              />
              Показать архив объектов
            </label>

            <label className="flex items-center gap-2 text-sm text-yellow-100/70 select-none">
              <input
                type="checkbox"
                checked={showInactiveWorkers}
                onChange={(e) => setShowInactiveWorkers(e.target.checked)}
                className="accent-yellow-500"
              />
              Показать неактивных работников
            </label>
          </div>
        </div>

        <div className="mt-6">
          {globalMsg ? <Banner kind={globalMsg.kind} text={globalMsg.text} /> : null}
        </div>

        {tab === 'sites' ? (
          <div className="mt-6 space-y-6">
            <Card
              title="Объекты"
              subtitle="Список объектов + создание + безопасный архив"
              right={
                <button
                  onClick={createSite}
                  disabled={busy || !newSiteName.trim()}
                  className={cx(
                    'rounded-2xl px-5 py-3 font-semibold transition',
                    'bg-yellow-500 text-black',
                    busy || !newSiteName.trim() ? 'opacity-70' : 'hover:brightness-110'
                  )}
                >
                  Добавить объект
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder="Название"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
                <input
                  value={newSiteAddress}
                  onChange={(e) => setNewSiteAddress(e.target.value)}
                  placeholder="Адрес"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
                <input
                  value={newSiteRadius}
                  onChange={(e) => setNewSiteRadius(e.target.value)}
                  placeholder="Радиус (м)"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
              </div>

              <div className="mt-5 text-sm text-yellow-100/60">
                Объектов: <span className="text-yellow-100">{visibleSites.length}</span>
                {showArchivedSites ? (
                  <span className="text-yellow-100/40"> (включая архив)</span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {visibleSites.length === 0 ? (
                  <div className="text-yellow-100/50">Объектов нет</div>
                ) : (
                  visibleSites.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-2xl border border-yellow-500/10 bg-black/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
                        <div>
                          <div className="text-lg text-yellow-100 font-semibold flex items-center gap-2">
                            <span>{s.name || 'Без названия'}</span>
                            {s.archived ? (
                              <span className="text-xs px-2 py-1 rounded-xl border border-yellow-500/20 bg-yellow-950/15 text-yellow-100/70">
                                Архив
                              </span>
                            ) : null}
                          </div>
                          <div className="text-yellow-100/60">
                            {s.address || 'Без адреса'}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right text-sm text-yellow-100/55 hidden md:block">
                            <div>Радиус: {s.radius_m ?? 100} м</div>
                            <div>lat/lng: {s.lat ?? '—'} / {s.lng ?? '—'}</div>
                          </div>

                          <button
                            onClick={() => setSiteArchived(s.id, !Boolean(s.archived))}
                            disabled={busy}
                            className={cx(
                              'rounded-2xl border px-4 py-2 transition text-sm',
                              'border-yellow-500/20 text-yellow-100/85 bg-yellow-950/10',
                              busy ? 'opacity-60' : 'hover:border-yellow-500/45'
                            )}
                          >
                            {s.archived ? 'Вернуть' : 'Архив'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-yellow-100/55 md:hidden">
                        <div>Радиус: {s.radius_m ?? 100} м</div>
                        <div>lat/lng: {s.lat ?? '—'} / {s.lng ?? '—'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card title="Назначения (Объект ↔ Работник)" subtitle="Кто где работает (показываем по фильтрам сверху)">
              <div className="space-y-3">
                {visibleAssignments.length === 0 ? (
                  <div className="text-yellow-100/50">Назначений нет</div>
                ) : (
                  visibleAssignments.map((a) => {
                    const site = sitesById.get(a.site_id);
                    const worker = workersById.get(a.worker_id);
                    return (
                      <div
                        key={`${a.site_id}:${a.worker_id}`}
                        className="rounded-2xl border border-yellow-500/10 bg-black/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-yellow-100">
                              <span className="font-semibold">{site?.name || 'Объект'}</span>
                              <span className="text-yellow-100/50"> — </span>
                              <span className="font-semibold">{worker?.full_name || worker?.id || 'Работник'}</span>
                            </div>
                            {a.extra_note ? (
                              <div className="mt-1 text-sm text-yellow-100/70">
                                Заметка: {a.extra_note}
                              </div>
                            ) : null}
                            <div className="mt-1 text-xs text-yellow-100/40">
                              {a.updated_at ? `Обновлено: ${formatRuDate(a.updated_at)}` : ''}
                            </div>
                          </div>
                          <button
                            onClick={() => unassign(a.site_id, a.worker_id)}
                            disabled={busy}
                            className={cx(
                              'rounded-2xl border px-4 py-2 transition',
                              'border-yellow-500/20 text-yellow-100/80 bg-yellow-950/10',
                              busy ? 'opacity-60' : 'hover:border-yellow-500/45'
                            )}
                          >
                            Снять
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-5 text-sm text-yellow-100/60">
                Быстрое назначение: выбери объект, потом работника — и в бой.
              </div>

              <QuickAssign
                disabled={busy}
                sites={visibleSites}
                workers={visibleWorkers}
                onAssign={assign}
              />
            </Card>
          </div>
        ) : null}

        {tab === 'workers' ? (
          <div className="mt-6 space-y-6">
            <Card
              title="Работники"
              subtitle="Список + приглашение + безопасная деактивация"
              right={
                <button
                  onClick={inviteWorker}
                  disabled={busy || !inviteEmail.trim()}
                  className={cx(
                    'rounded-2xl px-5 py-3 font-semibold transition',
                    'bg-yellow-500 text-black',
                    busy || !inviteEmail.trim() ? 'opacity-70' : 'hover:brightness-110'
                  )}
                >
                  Пригласить работника
                </button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email работника"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
                <input
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  placeholder="Имя (необязательно)"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
                <input
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Пароль (если нужно)"
                  className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
                />
              </div>

              <div className="mt-5 text-sm text-yellow-100/60">
                Пользователей: <span className="text-yellow-100">{visibleWorkers.length}</span>
                {showInactiveWorkers ? (
                  <span className="text-yellow-100/40"> (включая неактивных)</span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {visibleWorkers.length === 0 ? (
                  <div className="text-yellow-100/50">Пользователей нет</div>
                ) : (
                  visibleWorkers.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-2xl border border-yellow-500/10 bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between gap-4 flex-col md:flex-row">
                        <div>
                          <div className="text-yellow-100 font-semibold flex items-center gap-2">
                            <span>{w.full_name || w.id}</span>
                            {w.active ? null : (
                              <span className="text-xs px-2 py-1 rounded-xl border border-yellow-500/20 bg-yellow-950/15 text-yellow-100/70">
                                Неактивен
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-yellow-100/60">
                            role: {w.role || '—'} · active: {String(Boolean(w.active))}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setWorkerActive(w.id, !Boolean(w.active))}
                            disabled={busy}
                            className={cx(
                              'rounded-2xl border px-4 py-2 transition text-sm',
                              'border-yellow-500/20 text-yellow-100/85 bg-yellow-950/10',
                              busy ? 'opacity-60' : 'hover:border-yellow-500/45'
                            )}
                          >
                            {w.active ? 'Деактивировать' : 'Активировать'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card title="Назначения (Работник ↔ Объект)" subtitle="Показываем согласно фильтрам сверху">
              <div className="space-y-3">
                {visibleAssignments.length === 0 ? (
                  <div className="text-yellow-100/50">Назначений нет</div>
                ) : (
                  visibleAssignments.map((a) => {
                    const site = sitesById.get(a.site_id);
                    const worker = workersById.get(a.worker_id);
                    return (
                      <div
                        key={`${a.worker_id}:${a.site_id}`}
                        className="rounded-2xl border border-yellow-500/10 bg-black/30 p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-yellow-100">
                            <span className="font-semibold">{worker?.full_name || worker?.id || 'Работник'}</span>
                            <span className="text-yellow-100/50"> → </span>
                            <span className="font-semibold">{site?.name || 'Объект'}</span>
                          </div>
                          <button
                            onClick={() => unassign(a.site_id, a.worker_id)}
                            disabled={busy}
                            className={cx(
                              'rounded-2xl border px-4 py-2 transition',
                              'border-yellow-500/20 text-yellow-100/80 bg-yellow-950/10',
                              busy ? 'opacity-60' : 'hover:border-yellow-500/45'
                            )}
                          >
                            Снять
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-5">
                <QuickAssign
                  disabled={busy}
                  sites={visibleSites}
                  workers={visibleWorkers}
                  onAssign={assign}
                />
              </div>
            </Card>
          </div>
        ) : null}

        {tab === 'jobs' ? (
          <div className="mt-6 space-y-6">
            <Card title="Смены (Kanban)" subtitle="Пока базовый просмотр. Дальше докрутим кнопки статусов.">
              <div className="text-yellow-100/60 text-sm">
                Смен: <span className="text-yellow-100">{jobs.length}</span>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                <KanbanCol title="Planned" items={jobs.filter((j) => String(j.status || '') === 'planned')} />
                <KanbanCol title="In progress" items={jobs.filter((j) => String(j.status || '') === 'in_progress')} />
                <KanbanCol title="Done" items={jobs.filter((j) => String(j.status || '') === 'done')} />
              </div>
            </Card>
          </div>
        ) : null}

        <div className="mt-10 text-center text-xs text-yellow-100/35">
          © Tanija · Luxury dark & gold
        </div>
      </div>
    </div>
  );
}

function KanbanCol({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-3xl border border-yellow-500/12 bg-black/25 p-4">
      <div className="flex items-center justify-between">
        <div className="text-yellow-100 font-semibold">{title}</div>
        <div className="text-yellow-100/50 text-sm">{items.length}</div>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-yellow-100/40 text-sm">Пусто</div>
        ) : (
          items.map((j) => (
            <div key={j.id || JSON.stringify(j)} className="rounded-2xl border border-yellow-500/10 bg-black/35 p-3">
              <div className="text-yellow-100 text-sm font-semibold">
                {j.title || j.name || 'Смена'}
              </div>
              <div className="mt-1 text-xs text-yellow-100/50">
                {j.job_date ? String(j.job_date) : ''} {j.scheduled_time ? String(j.scheduled_time) : ''}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function QuickAssign({
  disabled,
  sites,
  workers,
  onAssign,
}: {
  disabled: boolean;
  sites: Site[];
  workers: Profile[];
  onAssign: (siteId: string, workerId: string) => Promise<void>;
}) {
  const [siteId, setSiteId] = useState('');
  const [workerId, setWorkerId] = useState('');

  return (
    <div className="rounded-3xl border border-yellow-500/12 bg-black/25 p-4">
      <div className="text-yellow-100 font-semibold">Быстрое назначение</div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
        >
          <option value="">Выбери объект…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || 'Без названия'}{s.archived ? ' (архив)' : ''}
            </option>
          ))}
        </select>

        <select
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          className="w-full rounded-2xl border border-yellow-500/15 bg-black/50 px-4 py-3 text-yellow-50 outline-none focus:border-yellow-500/35"
        >
          <option value="">Выбери работника…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {(w.full_name || w.id) + (w.active ? '' : ' (неактивен)')}
            </option>
          ))}
        </select>

        <button
          disabled={disabled || !siteId || !workerId}
          onClick={() => onAssign(siteId, workerId)}
          className={cx(
            'w-full rounded-2xl px-5 py-3 font-semibold transition',
            'bg-yellow-500 text-black',
            disabled || !siteId || !workerId ? 'opacity-70' : 'hover:brightness-110'
          )}
        >
          Назначить
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="text-yellow-100/70">Загрузка…</div>
        </div>
      }
    >
      <AdminInner />
    </Suspense>
  );
}
