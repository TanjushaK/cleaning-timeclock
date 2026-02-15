'use client';

import Image from 'next/image';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authFetchJson } from '@/lib/auth-fetch';

export const dynamic = 'force-dynamic';

type SitePhoto = {
  path: string;
  url: string;
  created_at?: string;
};

type Site = {
  id: string;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  category: number | null;
  notes: string | null;
  photos: SitePhoto[] | null;
  archived_at?: string | null;
};

type Profile = {
  id: string;
  role: string | null;
  active: boolean | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  notes?: string | null;
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
  return `${dd}.${mm}.${yyyy}`;
}

function formatRuDateTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function initials(name?: string | null) {
  const s = String(name || '').trim();
  if (!s) return '??';
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return (a + b).toUpperCase();
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: any;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-yellow-400/20 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-yellow-400/10 bg-black/20 px-5 py-4">
          <div className="text-sm font-semibold text-yellow-100">{title}</div>
          <button
            onClick={onClose}
            className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/80 hover:border-yellow-300/40"
          >
            Закрыть
          </button>
        </div>
        <div className="max-h-[78vh] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Pill({ children }: { children: any }) {
  return (
    <span className="inline-flex items-center rounded-full border border-yellow-400/15 bg-yellow-400/5 px-2 py-0.5 text-[11px] text-yellow-100/70">
      {children}
    </span>
  );
}

type SiteCategory = { id: number; label: string; dotClass: string };

const SITE_CATEGORIES: SiteCategory[] = [
  { id: 1, label: 'Категория 1', dotClass: 'bg-emerald-400' },
  { id: 2, label: 'Категория 2', dotClass: 'bg-sky-400' },
  { id: 3, label: 'Категория 3', dotClass: 'bg-violet-400' },
  { id: 4, label: 'Категория 4', dotClass: 'bg-fuchsia-400' },
  { id: 5, label: 'Категория 5', dotClass: 'bg-rose-400' },
  { id: 6, label: 'Категория 6', dotClass: 'bg-amber-400' },
  { id: 7, label: 'Категория 7', dotClass: 'bg-lime-400' },
  { id: 8, label: 'Категория 8', dotClass: 'bg-cyan-400' },
  { id: 9, label: 'Категория 9', dotClass: 'bg-indigo-400' },
  { id: 10, label: 'Категория 10', dotClass: 'bg-orange-400' },
  { id: 11, label: 'Категория 11', dotClass: 'bg-teal-400' },
  { id: 12, label: 'Категория 12', dotClass: 'bg-pink-400' },
];

function siteCategoryMeta(category: number | null | undefined) {
  const c = SITE_CATEGORIES.find((x) => x.id === category);
  return c || ({ id: 0, label: 'Без категории', dotClass: 'bg-zinc-500' } as SiteCategory);
}

function googleNavUrl(lat: number, lng: number) {
  const dest = `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

function appleNavUrl(lat: number, lng: number) {
  const dest = `${lat},${lng}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
}

function osmStaticMapUrl(lat: number, lng: number, w = 320, h = 200, zoom = 16) {
  const center = `${lat},${lng}`;
  const markers = `${lat},${lng},red-pushpin`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
    center
  )}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik&markers=${encodeURIComponent(markers)}`;
}

function CategoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const meta = siteCategoryMeta(value);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      const el = ref.current;
      if (!el) return;
      if (e.target && el.contains(e.target as any)) return;
      setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex items-center gap-2 rounded-2xl border border-yellow-400/15 bg-zinc-950 px-3 py-2 text-xs text-yellow-100/80',
          disabled ? 'opacity-70' : 'hover:border-yellow-300/40'
        )}
      >
        <span className={cx('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', meta.dotClass)} />
        <span className="font-semibold">{value ? `#${value}` : '—'}</span>
        <span className="hidden sm:inline text-yellow-100/55">{meta.label}</span>
        <span className="ml-1 text-yellow-100/35">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-yellow-400/15 bg-zinc-950 shadow-2xl">
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-yellow-100/70 hover:bg-yellow-400/5"
          >
            <span className={cx('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', 'bg-zinc-500')} />
            <span className="font-semibold">—</span>
            <span>Без категории</span>
          </button>
          <div className="h-px bg-yellow-400/10" />
          {SITE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-yellow-100/80 hover:bg-yellow-400/5"
            >
              <span className={cx('h-3 w-3 rounded-full ring-2 ring-black/40 shadow', c.dotClass)} />
              <span className="font-semibold">#{c.id}</span>
              <span className="text-yellow-100/60">{c.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MapMini({
  lat,
  lng,
  onClick,
}: {
  lat: number | null;
  lng: number | null;
  onClick: () => void;
}) {
  if (lat == null || lng == null) {
    return (
      <div className="flex h-[92px] w-[150px] items-center justify-center rounded-2xl border border-yellow-400/10 bg-black/20 text-[11px] text-yellow-100/40">
        Нет координат
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20"
      title="Открыть навигацию"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={osmStaticMapUrl(lat, lng, 300, 184, 16)}
        alt="map"
        className="h-[92px] w-[150px] object-cover opacity-95 transition group-hover:opacity-100"
        loading="lazy"
      />
    </button>
  );
}

function AdminInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const tab = (sp.get('tab') || 'sites') as 'sites' | 'workers' | 'jobs';

  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [authLoading, setAuthLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [globalMsg, setGlobalMsg] = useState<{ kind: 'error' | 'info' | 'ok'; text: string } | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  const [workerCardOpen, setWorkerCardOpen] = useState(false);
  const [workerCardId, setWorkerCardId] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');

  const [siteCreateOpen, setSiteCreateOpen] = useState(false);
  const [siteEditOpen, setSiteEditOpen] = useState(false);

  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteAddress, setNewSiteAddress] = useState('');
  const [newSiteRadius, setNewSiteRadius] = useState('150');
  const [newSiteCategory, setNewSiteCategory] = useState<number | null>(null);
  const [newSiteNotes, setNewSiteNotes] = useState('');

  const [editSiteId, setEditSiteId] = useState<string | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteAddress, setEditSiteAddress] = useState('');
  const [editSiteRadius, setEditSiteRadius] = useState('150');
  const [editSiteLat, setEditSiteLat] = useState('');
  const [editSiteLng, setEditSiteLng] = useState('');
  const [editSiteCategory, setEditSiteCategory] = useState<number | null>(null);
  const [editSiteNotes, setEditSiteNotes] = useState('');
  const [editSitePhotos, setEditSitePhotos] = useState<SitePhoto[]>([]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');

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

  const workerCard = workerCardId ? workersById.get(workerCardId) ?? null : null;

  const workerCardAssignments = useMemo<Assignment[]>(() => {
    if (!workerCardId) return [];
    return assignments.filter((a) => a.worker_id === workerCardId);
  }, [assignments, workerCardId]);

  const workerCardJobs = useMemo<any[]>(() => {
    if (!workerCardId) return [];
    return (jobs || [])
      .filter((j: any) => String(j.worker_id || '') === workerCardId)
      .sort((a: any, b: any) => {
        const ad = String(a.job_date || '');
        const bd = String(b.job_date || '');
        if (ad !== bd) return ad < bd ? 1 : -1;
        const at = String(a.scheduled_time || '');
        const bt = String(b.scheduled_time || '');
        return at < bt ? 1 : -1;
      });
  }, [jobs, workerCardId]);

  async function refreshAll() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const [s, w, a, j] = await Promise.all([
        authFetchJson<{ sites: Site[] }>('/api/admin/sites/list'),
        authFetchJson<{ workers: Profile[] }>('/api/admin/workers/list'),
        authFetchJson<{ assignments: Assignment[] }>('/api/admin/assignments'),
        authFetchJson<{ jobs: any[] }>('/api/admin/jobs'),
      ]);

      setSites(Array.isArray(s?.sites) ? s.sites : []);
      setWorkers(Array.isArray(w?.workers) ? w.workers : []);
      setAssignments(Array.isArray(a?.assignments) ? a.assignments : []);
      setJobs(Array.isArray(j?.jobs) ? j.jobs : []);
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось загрузить данные' });
    } finally {
      setBusy(false);
    }
  }

  async function doLogin() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPass,
      });
      if (error) throw error;
      const email = data?.user?.email ?? null;
      setSessionEmail(email);
      setGlobalMsg({ kind: 'ok', text: 'Вход выполнен' });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось войти' });
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSessionEmail(null);
      setGlobalMsg({ kind: 'ok', text: 'Вы вышли' });
      router.replace('/admin');
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось выйти' });
    } finally {
      setBusy(false);
    }
  }

  async function inviteWorker() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson('/api/admin/workers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteFullName,
          password: invitePassword,
        }),
      });
      setInviteEmail('');
      setInviteFullName('');
      setInvitePassword('');
      setGlobalMsg({ kind: 'ok', text: 'Приглашение создано' });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось пригласить' });
    } finally {
      setBusy(false);
    }
  }

  async function createSite() {
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson('/api/admin/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSiteName,
          address: newSiteAddress,
          radius: Number(newSiteRadius || '150'),
          category: newSiteCategory,
          notes: newSiteNotes,
        }),
      });

      setNewSiteName('');
      setNewSiteAddress('');
      setNewSiteRadius('150');
      setNewSiteCategory(null);
      setNewSiteNotes('');
      setSiteCreateOpen(false);
      setGlobalMsg({ kind: 'ok', text: 'Объект создан' });
      await refreshAll();
      router.replace('/admin?tab=sites');
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось создать объект' });
    } finally {
      setBusy(false);
    }
  }

  function openEditSite(s: Site) {
    setEditSiteId(s.id);
    setEditSiteName(s.name || '');
    setEditSiteAddress(s.address || '');
    setEditSiteRadius(String(s.radius ?? 150));
    setEditSiteLat(s.lat == null ? '' : String(s.lat));
    setEditSiteLng(s.lng == null ? '' : String(s.lng));
    setEditSiteCategory(s.category ?? null);
    setEditSiteNotes(s.notes || '');
    setEditSitePhotos(Array.isArray(s.photos) ? s.photos : []);
    setSiteEditOpen(true);
  }

  async function saveEditSite() {
    if (!editSiteId) return;
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson(`/api/admin/sites/${editSiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editSiteName,
          address: editSiteAddress,
          radius: Number(editSiteRadius || '150'),
          lat: editSiteLat === '' ? null : Number(editSiteLat),
          lng: editSiteLng === '' ? null : Number(editSiteLng),
          category: editSiteCategory,
          notes: editSiteNotes,
        }),
      });
      setSiteEditOpen(false);
      setGlobalMsg({ kind: 'ok', text: 'Объект обновлён' });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось обновить объект' });
    } finally {
      setBusy(false);
    }
  }

  async function setSiteCategoryQuick(siteId: string, cat: number | null) {
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson(`/api/admin/sites/${siteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat }),
      });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось обновить категорию' });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSite(siteId: string) {
    const ok = window.confirm('Удалить объект? Он пропадёт из списка (можно восстановить через базу).');
    if (!ok) return;
    setBusy(true);
    setGlobalMsg(null);
    try {
      await authFetchJson(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
      setGlobalMsg({ kind: 'ok', text: 'Объект удалён' });
      await refreshAll();
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось удалить объект' });
    } finally {
      setBusy(false);
    }
  }

  async function uploadSitePhotos(siteId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoBusy(true);
    setGlobalMsg(null);
    try {
      let current = editSitePhotos;
      for (const f of Array.from(files)) {
        if (current.length >= 5) break;
        const fd = new FormData();
        fd.append('file', f);
        const r = await authFetchJson<{ site: Site }>(`/api/admin/sites/${siteId}/photos`, {
          method: 'POST',
          body: fd,
        });
        const next = Array.isArray(r?.site?.photos) ? (r.site.photos as SitePhoto[]) : [];
        current = next;
        setEditSitePhotos(next);
      }
      await refreshAll();
      setGlobalMsg({ kind: 'ok', text: 'Фото добавлены' });
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось загрузить фото' });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removeSitePhoto(siteId: string, path: string) {
    const ok = window.confirm('Удалить фото?');
    if (!ok) return;
    setPhotoBusy(true);
    setGlobalMsg(null);
    try {
      const r = await authFetchJson<{ site: Site }>(`/api/admin/sites/${siteId}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const next = Array.isArray(r?.site?.photos) ? (r.site.photos as SitePhoto[]) : [];
      setEditSitePhotos(next);
      await refreshAll();
      setGlobalMsg({ kind: 'ok', text: 'Фото удалено' });
    } catch (e: any) {
      setGlobalMsg({ kind: 'error', text: e?.message || 'Не удалось удалить фото' });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function openWorkerCard(id: string) {
    setWorkerCardId(id);
    setWorkerCardOpen(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const email = data?.session?.user?.email ?? null;
        setSessionEmail(email);
      } finally {
        setAuthLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
    });

    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authLoading && sessionEmail) {
      void refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, sessionEmail]);

  const headerRight = (
    <div className="flex items-center gap-2">
      {sessionEmail ? (
        <>
          <Pill>{sessionEmail}</Pill>
          <button
            onClick={doLogout}
            className="rounded-2xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/80 hover:border-yellow-300/40"
          >
            Выйти
          </button>
        </>
      ) : null}
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
        <div className="mx-auto max-w-xl px-6 py-12">
          <div className="flex items-center gap-3">
            <Image src="/tanija-logo.png" alt="Tanija" width={44} height={44} className="rounded-2xl" />
            <div>
              <div className="text-lg font-semibold text-yellow-100">Admin</div>
              <div className="text-xs text-yellow-100/50">Вход администратора</div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 rounded-3xl border border-yellow-400/15 bg-black/20 p-6">
            {globalMsg ? (
              <div
                className={cx(
                  'rounded-2xl border px-4 py-3 text-sm',
                  globalMsg.kind === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-100'
                    : globalMsg.kind === 'ok'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                      : 'border-yellow-400/20 bg-yellow-400/10 text-yellow-100'
                )}
              >
                {globalMsg.text}
              </div>
            ) : null}

            <div className="grid gap-1">
              <span className="text-[11px] text-yellow-100/60">Email</span>
              <input
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                placeholder="admin@example.com"
              />
            </div>

            <div className="grid gap-1">
              <span className="text-[11px] text-yellow-100/60">Пароль</span>
              <input
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                type="password"
                className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                placeholder="••••••••"
              />
            </div>

            <button
              onClick={doLogin}
              disabled={busy || !loginEmail || !loginPass}
              className={cx(
                'mt-2 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100',
                busy || !loginEmail || !loginPass ? 'opacity-70' : 'hover:border-yellow-200/70'
              )}
            >
              {busy ? 'Вхожу…' : 'Войти'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nav = (
    <div className="flex flex-wrap items-center gap-2">
      {(
        [
          ['sites', 'Объекты'],
          ['workers', 'Работники'],
          ['jobs', 'Смены'],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => router.replace(`/admin?tab=${k}`)}
          className={cx(
            'rounded-2xl border px-4 py-2 text-xs font-semibold',
            tab === k
              ? 'border-yellow-300/50 bg-yellow-400/10 text-yellow-100'
              : 'border-yellow-400/15 bg-black/20 text-yellow-100/60 hover:border-yellow-300/30'
          )}
        >
          {label}
        </button>
      ))}
      <button
        onClick={() => void refreshAll()}
        className="rounded-2xl border border-yellow-400/15 bg-black/20 px-4 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/30"
      >
        Обновить
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/tanija-logo.png" alt="Tanija" width={44} height={44} className="rounded-2xl" />
            <div>
              <div className="text-lg font-semibold text-yellow-100">Admin</div>
              <div className="text-xs text-yellow-100/50">Панель управления</div>
            </div>
          </div>
          {headerRight}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {nav}
          {globalMsg ? (
            <div
              className={cx(
                'rounded-2xl border px-4 py-2 text-xs',
                globalMsg.kind === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-100'
                  : globalMsg.kind === 'ok'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                    : 'border-yellow-400/20 bg-yellow-400/10 text-yellow-100'
              )}
            >
              {globalMsg.text}
            </div>
          ) : null}
        </div>

        {tab === 'sites' ? (
          <div className="mt-8 grid gap-6">
            <div className="rounded-3xl border border-yellow-400/15 bg-black/15 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-yellow-100">Объекты</div>
                  <div className="mt-1 text-xs text-yellow-100/50">Карта, навигация, категории, заметки, фото</div>
                </div>
                <button
                  onClick={() => setSiteCreateOpen(true)}
                  disabled={busy}
                  className={cx(
                    'rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100',
                    busy ? 'opacity-70' : 'hover:border-yellow-200/70'
                  )}
                >
                  Добавить объект
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-yellow-400/15 bg-black/15 p-6">
              <div className="text-sm font-semibold text-yellow-100">Список объектов</div>
              <div className="mt-4 grid gap-3">
                {sites.length === 0 ? (
                  <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-4 py-3 text-sm text-yellow-100/60">
                    Нет объектов
                  </div>
                ) : null}

                {sites.map((s) => {
                  const meta = siteCategoryMeta(s.category);
                  const photos = Array.isArray(s.photos) ? s.photos : [];
                  const primary = photos[0]?.url || null;

                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-yellow-400/10 bg-black/20 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                          {primary ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={primary} alt="photo" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] text-yellow-100/40">
                              фото
                            </div>
                          )}
                          <span className={cx('absolute left-1 top-1 h-3 w-3 rounded-full ring-2 ring-black/50', meta.dotClass)} />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-yellow-100">{s.name || '—'}</div>
                          </div>

                          <div className="mt-1 truncate text-xs text-yellow-100/50">{s.address || '—'}</div>

                          {s.notes ? (
                            <div className="mt-1 line-clamp-2 max-w-[520px] text-[11px] text-yellow-100/45">
                              {s.notes}
                            </div>
                          ) : null}

                          <div className="mt-2 flex flex-wrap gap-2">
                            <Pill>
                              {meta.label} {s.category ? `(#${s.category})` : ''}
                            </Pill>
                            <Pill>radius: {s.radius ?? '—'}м</Pill>
                            <Pill>
                              lat/lng: {s.lat ?? '—'}/{s.lng ?? '—'}
                            </Pill>
                            <Pill>фото: {photos.length}/5</Pill>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-start gap-3">
                        <div className="grid gap-2">
                          <MapMini
                            lat={s.lat}
                            lng={s.lng}
                            onClick={() => {
                              if (s.lat == null || s.lng == null) return;
                              window.open(googleNavUrl(s.lat, s.lng), '_blank', 'noopener,noreferrer');
                            }}
                          />
                          {s.lat != null && s.lng != null ? (
                            <div className="flex items-center gap-2 text-[11px] text-yellow-100/55">
                              <a
                                className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50"
                                href={googleNavUrl(s.lat, s.lng)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Google
                              </a>
                              <span className="text-yellow-100/25">•</span>
                              <a
                                className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50"
                                href={appleNavUrl(s.lat, s.lng)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Apple
                              </a>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid gap-2">
                          <CategoryPicker
                            value={s.category ?? null}
                            disabled={busy}
                            onChange={(v) => void setSiteCategoryQuick(s.id, v)}
                          />

                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => openEditSite(s)}
                              disabled={busy}
                              className={cx(
                                'rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70',
                                busy ? 'opacity-70' : 'hover:border-yellow-300/40'
                              )}
                            >
                              Карточка
                            </button>

                            <button
                              onClick={() => void deleteSite(s.id)}
                              disabled={busy}
                              className={cx(
                                'rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100/80',
                                busy ? 'opacity-70' : 'hover:border-red-400/40'
                              )}
                            >
                              Удалить
                            </button>

                            <button
                              onClick={() => {
                                navigator.clipboard?.writeText(s.id);
                                setGlobalMsg({ kind: 'info', text: 'ID скопирован' });
                              }}
                              className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40"
                            >
                              ID
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Modal open={siteCreateOpen} title="Добавить объект" onClose={() => setSiteCreateOpen(false)}>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <span className="text-[11px] text-yellow-100/60">Название</span>
                  <input
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                    placeholder="Например: Квартира 12"
                  />
                </div>

                <div className="grid gap-1">
                  <span className="text-[11px] text-yellow-100/60">Адрес</span>
                  <input
                    value={newSiteAddress}
                    onChange={(e) => setNewSiteAddress(e.target.value)}
                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                    placeholder="Улица, дом, город"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <span className="text-[11px] text-yellow-100/60">Радиус (м)</span>
                    <input
                      value={newSiteRadius}
                      onChange={(e) => setNewSiteRadius(e.target.value)}
                      className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                      placeholder="150"
                    />
                  </div>

                  <div className="grid gap-1">
                    <span className="text-[11px] text-yellow-100/60">Категория</span>
                    <CategoryPicker value={newSiteCategory} onChange={setNewSiteCategory} />
                  </div>
                </div>

                <div className="grid gap-1">
                  <span className="text-[11px] text-yellow-100/60">Заметки</span>
                  <textarea
                    value={newSiteNotes}
                    onChange={(e) => setNewSiteNotes(e.target.value)}
                    className="min-h-[110px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm text-yellow-100/90 outline-none focus:border-yellow-300/50"
                    placeholder="Тут можно хранить код домофона, инструкции, доступ, нюансы…"
                  />
                </div>

                <button
                  onClick={createSite}
                  disabled={busy || !newSiteName}
                  className={cx(
                    'mt-2 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100',
                    busy || !newSiteName ? 'opacity-70' : 'hover:border-yellow-200/70'
                  )}
                >
                  Создать
                </button>
              </div>
            </Modal>

            <Modal open={siteEditOpen} title="Карточка объекта" onClose={() => setSiteEditOpen(false)}>
              <div className="grid gap-5">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="grid gap-3">
                    <div className="grid gap-1">
                      <span className="text-[11px] text-yellow-100/60">Название</span>
                      <input
                        value={editSiteName}
                        onChange={(e) => setEditSiteName(e.target.value)}
                        className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                      />
                    </div>

                    <div className="grid gap-1">
                      <span className="text-[11px] text-yellow-100/60">Адрес</span>
                      <input
                        value={editSiteAddress}
                        onChange={(e) => setEditSiteAddress(e.target.value)}
                        className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <span className="text-[11px] text-yellow-100/60">Радиус (м)</span>
                        <input
                          value={editSiteRadius}
                          onChange={(e) => setEditSiteRadius(e.target.value)}
                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                        />
                      </div>

                      <div className="grid gap-1">
                        <span className="text-[11px] text-yellow-100/60">Категория</span>
                        <CategoryPicker value={editSiteCategory} onChange={setEditSiteCategory} disabled={busy} />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <span className="text-[11px] text-yellow-100/60">Широта (lat)</span>
                        <input
                          value={editSiteLat}
                          onChange={(e) => setEditSiteLat(e.target.value)}
                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                          placeholder="52.3702"
                        />
                      </div>

                      <div className="grid gap-1">
                        <span className="text-[11px] text-yellow-100/60">Долгота (lng)</span>
                        <input
                          value={editSiteLng}
                          onChange={(e) => setEditSiteLng(e.target.value)}
                          className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                          placeholder="4.8952"
                        />
                      </div>
                    </div>

                    <div className="grid gap-1">
                      <span className="text-[11px] text-yellow-100/60">Заметки (блокнот)</span>
                      <textarea
                        value={editSiteNotes}
                        onChange={(e) => setEditSiteNotes(e.target.value)}
                        className="min-h-[140px] rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm text-yellow-100/90 outline-none focus:border-yellow-300/50"
                        placeholder="Коды, инструкции, ключи, что важно…"
                      />
                    </div>

                    <button
                      onClick={() => void saveEditSite()}
                      disabled={busy || !editSiteId || !editSiteName}
                      className={cx(
                        'mt-1 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100',
                        busy || !editSiteId || !editSiteName ? 'opacity-70' : 'hover:border-yellow-200/70'
                      )}
                    >
                      Сохранить
                    </button>
                  </div>

                  <div className="grid gap-3 rounded-3xl border border-yellow-400/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold text-yellow-100">Мини-карта</div>

                    <div className="grid gap-2">
                      {(() => {
                        const lat = editSiteLat === '' ? null : Number(editSiteLat);
                        const lng = editSiteLng === '' ? null : Number(editSiteLng);
                        if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
                          return (
                            <div className="flex h-[180px] items-center justify-center rounded-2xl border border-yellow-400/10 bg-black/20 text-xs text-yellow-100/45">
                              Укажи lat/lng и сохрани
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={() => window.open(googleNavUrl(lat, lng), '_blank', 'noopener,noreferrer')}
                            className="group overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20"
                            title="Открыть навигацию"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={osmStaticMapUrl(lat, lng, 640, 400, 16)}
                              alt="map"
                              className="h-[180px] w-full object-cover opacity-95 transition group-hover:opacity-100"
                              loading="lazy"
                            />
                          </button>
                        );
                      })()}

                      {(() => {
                        const lat = editSiteLat === '' ? null : Number(editSiteLat);
                        const lng = editSiteLng === '' ? null : Number(editSiteLng);
                        if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
                        return (
                          <div className="flex items-center gap-3 text-xs text-yellow-100/70">
                            <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={googleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                              Google навигация
                            </a>
                            <a className="underline decoration-yellow-400/20 hover:decoration-yellow-300/50" href={appleNavUrl(lat, lng)} target="_blank" rel="noreferrer">
                              Apple навигация
                            </a>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="mt-2 text-sm font-semibold text-yellow-100">Фото (до 5)</div>

                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-yellow-100/55">Сейчас: {editSitePhotos.length}/5</div>
                        <label className={cx('rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40', (photoBusy || !editSiteId || editSitePhotos.length >= 5) ? 'opacity-70' : '')}>
                          Добавить фото
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={photoBusy || !editSiteId || editSitePhotos.length >= 5}
                            className="hidden"
                            onChange={async (e) => {
                              const files = e.target.files;
                              e.target.value = '';
                              if (!editSiteId) return;
                              await uploadSitePhotos(editSiteId, files);
                            }}
                          />
                        </label>
                      </div>

                      {editSitePhotos.length === 0 ? (
                        <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/55">
                          Фото нет
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {editSitePhotos.map((p) => (
                            <div key={p.path} className="relative overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt="site" className="h-36 w-full object-cover" loading="lazy" />
                              <button
                                onClick={() => {
                                  if (!editSiteId) return;
                                  void removeSitePhoto(editSiteId, p.path);
                                }}
                                disabled={photoBusy || !editSiteId}
                                className={cx(
                                  'absolute right-2 top-2 rounded-xl border border-red-500/25 bg-red-500/15 px-2 py-1 text-[11px] text-red-100/85',
                                  photoBusy ? 'opacity-70' : 'hover:border-red-400/45'
                                )}
                              >
                                Удалить
                              </button>
                              <div className="absolute left-2 top-2 rounded-xl border border-yellow-400/15 bg-black/40 px-2 py-1 text-[11px] text-yellow-100/70">
                                {editSitePhotos[0]?.path === p.path ? 'главное' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {photoBusy ? (
                        <div className="text-xs text-yellow-100/45">Обработка фото…</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </Modal>
          </div>
        ) : null}

        {tab === 'workers' ? (
          <div className="mt-8 grid gap-6">
            <div className="rounded-3xl border border-yellow-400/15 bg-black/15 p-6">
              <div className="text-sm font-semibold text-yellow-100">Пригласить работника</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <span className="text-[11px] text-yellow-100/60">Email</span>
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                    placeholder="worker@example.com"
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-[11px] text-yellow-100/60">ФИО</span>
                  <input
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                    placeholder="Иван Иванов"
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-1">
                <span className="text-[11px] text-yellow-100/60">Пароль (временный)</span>
                <input
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  type="password"
                  className="rounded-2xl border border-yellow-400/15 bg-black/30 px-4 py-3 text-sm outline-none focus:border-yellow-300/50"
                  placeholder="••••••••"
                />
              </div>
              <button
                onClick={inviteWorker}
                disabled={busy || !inviteEmail || !invitePassword}
                className={cx(
                  'mt-4 rounded-2xl border border-yellow-300/45 bg-yellow-400/10 px-5 py-3 text-sm font-semibold text-yellow-100',
                  busy || !inviteEmail || !invitePassword ? 'opacity-70' : 'hover:border-yellow-200/70'
                )}
              >
                Пригласить
              </button>
            </div>

            <div className="rounded-3xl border border-yellow-400/15 bg-black/15 p-6">
              <div className="text-sm font-semibold text-yellow-100">Список работников</div>
              <div className="mt-4 grid gap-3">
                {workers.length === 0 ? (
                  <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-4 py-3 text-sm text-yellow-100/60">
                    Нет работников
                  </div>
                ) : null}

                {workers.map((w) => (
                  <div
                    key={w.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-400/10 bg-black/20 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-yellow-400/10 bg-black/20">
                        {w.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={String(w.avatar_url)} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-yellow-100/70">
                            {initials(w.full_name || w.email || null)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-yellow-100">{w.full_name || w.email || '—'}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-yellow-100/50">
                          <Pill>role: {w.role || '—'}</Pill>
                          <Pill>active: {String(w.active ?? false)}</Pill>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openWorkerCard(w.id)}
                        className="rounded-xl border border-yellow-300/40 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-100 hover:border-yellow-200/70"
                      >
                        Карточка
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(w.id);
                          setGlobalMsg({ kind: 'info', text: 'ID скопирован' });
                        }}
                        className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40"
                      >
                        ID
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Modal open={workerCardOpen} title="Карточка работника" onClose={() => setWorkerCardOpen(false)}>
              <div className="grid gap-5">
                <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative h-14 w-14 overflow-hidden rounded-3xl border border-yellow-400/10 bg-black/20">
                        {workerCard?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={String(workerCard.avatar_url)} alt="avatar" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-yellow-100/70">
                            {initials(workerCard?.full_name || workerCard?.email || null)}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-lg font-semibold text-yellow-100">
                          {workerCard?.full_name || workerCard?.email || workerCardId || 'Работник'}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-yellow-100/55">
                          <Pill>role: {workerCard?.role || '—'}</Pill>
                          <Pill>active: {String(workerCard?.active ?? false)}</Pill>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-1 text-xs text-yellow-100/60">
                      {workerCard?.email ? <div>{workerCard.email}</div> : null}
                      {workerCard?.phone ? <div>{workerCard.phone}</div> : null}
                    </div>
                  </div>

                  {workerCard?.notes ? (
                    <div className="mt-4 rounded-2xl border border-yellow-400/10 bg-black/25 px-4 py-3">
                      <div className="text-[11px] font-semibold text-yellow-100/60">Заметки</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-yellow-100/80">{workerCard.notes}</div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
                  <div className="text-sm font-semibold text-yellow-100">Назначенные объекты</div>
                  <div className="mt-3 grid gap-2">
                    {workerCardAssignments.length === 0 ? (
                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-yellow-100/55">
                        Нет назначений
                      </div>
                    ) : (
                      workerCardAssignments.map((a) => {
                        const s = sitesById.get(a.site_id);
                        return (
                          <div
                            key={a.site_id}
                            className="rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3 text-xs text-yellow-100/70"
                          >
                            <div className="font-semibold text-yellow-100">{s?.name || '—'}</div>
                            <div className="mt-1 text-yellow-100/50">{s?.address || '—'}</div>
                            {a.extra_note ? (
                              <div className="mt-2 whitespace-pre-wrap text-[11px] text-yellow-100/60">{a.extra_note}</div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-yellow-400/15 bg-black/25 p-4">
                  <div className="text-sm font-semibold text-yellow-100">Смены</div>
                  <div className="mt-3 grid gap-2">
                    {workerCardJobs.length === 0 ? (
                      <div className="rounded-2xl border border-yellow-400/10 bg-black/25 px-3 py-3 text-xs text-yellow-100/55">
                        Смен нет
                      </div>
                    ) : (
                      workerCardJobs.slice(0, 30).map((j: any) => {
                        const s = sitesById.get(String(j.site_id || ''));
                        return (
                          <div
                            key={String(j.id)}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-yellow-400/10 bg-black/20 px-3 py-3"
                          >
                            <div className="text-xs text-yellow-100/70">
                              <div className="text-yellow-100">
                                {formatRuDate(String(j.job_date || ''))} • {String(j.scheduled_time || '—')} •{' '}
                                {s?.name || j.site_name || '—'}
                              </div>
                              <div className="mt-1 text-[11px] text-yellow-100/50">
                                Статус: {String(j.status || '—')}
                                {j.started_at ? ` • Начал: ${formatRuDateTime(String(j.started_at))}` : ''}
                                {j.stopped_at ? ` • Закончил: ${formatRuDateTime(String(j.stopped_at))}` : ''}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {workerCardJobs.length > 30 ? (
                      <div className="text-xs text-yellow-100/45">Показаны первые 30 (всего: {workerCardJobs.length})</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Modal>
          </div>
        ) : null}

        {tab === 'jobs' ? (
          <div className="mt-8 rounded-3xl border border-yellow-400/15 bg-black/15 p-6">
            <div className="text-sm font-semibold text-yellow-100">Смены</div>
            <div className="mt-4 grid gap-3">
              {jobs.length === 0 ? (
                <div className="rounded-2xl border border-yellow-400/10 bg-black/20 px-4 py-3 text-sm text-yellow-100/60">
                  Нет смен
                </div>
              ) : null}

              {jobs.slice(0, 200).map((j: any) => {
                const s = sitesById.get(String(j.site_id || ''));
                const w = workersById.get(String(j.worker_id || ''));
                return (
                  <div
                    key={String(j.id)}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-yellow-400/10 bg-black/20 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-yellow-100">
                        {formatRuDate(String(j.job_date || ''))} • {String(j.scheduled_time || '—')}
                      </div>
                      <div className="mt-1 text-xs text-yellow-100/50">
                        Объект: {s?.name || j.site_name || '—'} • Работник: {w?.full_name || w?.email || '—'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Pill>status: {String(j.status || '—')}</Pill>
                        <Pill>planned: {String(j.planned_minutes ?? '—')}m</Pill>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(String(j.id));
                        setGlobalMsg({ kind: 'info', text: 'ID смены скопирован' });
                      }}
                      className="rounded-xl border border-yellow-400/15 bg-black/30 px-3 py-2 text-xs text-yellow-100/70 hover:border-yellow-300/40"
                    >
                      ID
                    </button>
                  </div>
                );
              })}
              {jobs.length > 200 ? (
                <div className="text-xs text-yellow-100/45">Показаны первые 200 (всего: {jobs.length})</div>
              ) : null}
            </div>
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
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
          <div className="text-yellow-100/70">Загрузка…</div>
        </div>
      }
    >
      <AdminInner />
    </Suspense>
  );
}
