"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from "@/lib/auth-fetch";

type Profile = {
  id: string;
  role?: string | null;
  active?: boolean | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_path?: string | null;
  onboarding_submitted_at?: string | null;
};

type MeProfileResponse = {
  user: { id: string; email?: string | null; phone?: string | null; email_confirmed_at?: string | null };
  profile: Profile;
};

type JobItem = {
  id: string;
  status: "planned" | "in_progress" | "done" | string;
  job_date: string | null;
  scheduled_time: string | null;
  scheduled_end_time?: string | null;
  site_id: string | null;
  site_name: string | null;
  worker_id: string | null;
  started_at: string | null;
  stopped_at: string | null;
  actual_minutes?: number | null;
  can_accept?: boolean | null;
};

type MeJobsResponse = { items: JobItem[] };
type Gps = { lat: number; lng: number; accuracy: number };

type MyPhotosResponse = {
  photos: Array<{ path: string; url?: string | null }>;
  avatar_path: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtD(iso?: string | null) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function timeHHMM(t?: string | null) {
  if (!t) return null;
  const x = String(t);
  return x.length >= 5 ? x.slice(0, 5) : x;
}

function minutesFromHHMM(t: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function fmtDur(mins: number) {
  const m = Math.max(0, Math.floor(mins || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r}м`;
  return `${h}ч ${pad2(r)}м`;
}

function plannedMinutes(from?: string | null, to?: string | null) {
  const f = timeHHMM(from);
  const t = timeHHMM(to);
  if (!f || !t) return null;
  const a = minutesFromHHMM(f);
  const b = minutesFromHHMM(t);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d < 0) d += 24 * 60;
  return d;
}

function statusRu(s: string) {
  if (s === "planned") return "Запланировано";
  if (s === "in_progress") return "В процессе";
  if (s === "done") return "Завершено";
  return s || "—";
}

function getGps(): Promise<Gps> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("GPS недоступен."));
    if (!("geolocation" in navigator)) return reject(new Error("GPS недоступен в браузере."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Доступ к геолокации запрещён. Разреши GPS для сайта."
            : err.code === err.POSITION_UNAVAILABLE
              ? "GPS недоступен. Попробуй выйти на улицу/включить геолокацию."
              : "Таймаут GPS. Повтори ещё раз.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function bearerHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const t = localStorage.getItem("ct_access_token");
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export default function AppPage() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const [loginMode, setLoginMode] = useState<"phone" | "email">("phone");

  const [email, setEmail] = useState("");
  const [emailLinkSent, setEmailLinkSent] = useState(false);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [me, setMe] = useState<MeProfileResponse | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // onboarding
  const [fullName, setFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [photos, setPhotos] = useState<Array<{ path: string; url?: string | null }>>([]);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const authed = !!token;

  const loadPhotos = useCallback(async () => {
    const r = await fetch("/api/me/photos", {
      headers: bearerHeaders(),
      cache: "no-store",
    });
    const data = (await r.json()) as MyPhotosResponse | any;
    if (!r.ok) throw new Error(String(data?.error || `HTTP ${r.status}`));
    setPhotos(Array.isArray(data.photos) ? data.photos : []);
    setAvatarPath(data.avatar_path || null);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setNotice(null);

    const profile = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
    setMe(profile);

    setFullName(String(profile?.profile?.full_name || ""));
    setProfileEmail(String(profile?.profile?.email || profile?.user?.email || ""));

    if (profile?.profile?.active !== true) {
      setJobs([]);
      await loadPhotos().catch(() => {});
      return;
    }

    const jobsRes = await authFetchJson<MeJobsResponse>("/api/me/jobs", { cache: "no-store" });
    setJobs(jobsRes.items || []);
  }, [loadPhotos]);

  useEffect(() => {
    (async () => {
      try {
        const t = getAccessToken();
        setToken(t);
        if (t) await loadAll();
      } catch (e: any) {
        const msg = String(e?.message || e || "Ошибка");
        if (msg.includes("401") || /токен|unauthorized/i.test(msg)) {
          clearAuthTokens();
          try { await supabase.auth.signOut(); } catch {}
          setToken(null);
          setMe(null);
          setJobs([]);
        } else {
          setError(msg);
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [loadAll]);

  const doPhoneSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = phone.trim();
      if (!p || !p.startsWith("+")) throw new Error("Телефон нужен в формате E.164, например +31612345678");
      const { error: e1 } = await supabase.auth.signInWithOtp({ phone: p, options: { channel: "sms" } });
      if (e1) throw new Error(e1.message);
      setOtpSent(true);
      setNotice("Код отправлен по SMS.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка отправки кода"));
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const doPhoneVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = phone.trim();
      const code = otp.trim();
      if (!p || !p.startsWith("+")) throw new Error("Телефон нужен в формате E.164, например +31612345678");
      if (!code) throw new Error("Введи код из SMS");

      const { data, error: e2 } = await supabase.auth.verifyOtp({ phone: p, token: code, type: "sms" });
      if (e2) throw new Error(e2.message);

      const session = data?.session;
      if (!session?.access_token) throw new Error("Не удалось получить сессию");

      setAuthTokens(session.access_token, session.refresh_token || null);
      const t = getAccessToken();
      setToken(t);

      await loadAll();
      setNotice("Вход выполнен.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка подтверждения кода"));
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }, [phone, otp, loadAll]);

  const doEmailSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      if (!em || !em.includes("@")) throw new Error("Введи корректный email");

      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error: e1 } = await supabase.auth.signInWithOtp({
        email: em,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      if (e1) throw new Error(e1.message);

      setEmailLinkSent(true);
      setNotice("Ссылка отправлена. Открой почту и нажми на magic link.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка отправки ссылки"));
    } finally {
      setBusy(false);
    }
  }, [email]);

  const doLogout = useCallback(() => {
    clearAuthTokens();
    try { supabase.auth.signOut(); } catch {}
    setToken(null);
    setMe(null);
    setJobs([]);
    setNotice("Вы вышли.");
  }, []);

  const saveProfile = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const name = fullName.trim();
      if (!name) throw new Error("Укажи имя");
      const em = profileEmail.trim();

      if (em) {
        try {
          const { error: uErr } = await supabase.auth.updateUser({ email: em });
          if (uErr) throw uErr;
        } catch {}
      }

      await authFetchJson("/api/me/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name, email: em || null }),
      });

      await loadAll();
      setNotice("Сохранено.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка"));
    } finally {
      setBusy(false);
    }
  }, [fullName, profileEmail, loadAll]);

  const uploadPhoto = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/me/photos", { method: "POST", headers: bearerHeaders(), body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(data?.error || `HTTP ${r.status}`));
      await loadPhotos();
      setNotice("Фото загружено.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка загрузки"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [loadPhotos]);

  const delPhoto = useCallback(async (path: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/me/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ path }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(data?.error || `HTTP ${r.status}`));
      await loadPhotos();
      setNotice("Удалено.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка удаления"));
    } finally {
      setBusy(false);
    }
  }, [loadPhotos]);

  const makeAvatar = useCallback(async (path: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch("/api/me/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...bearerHeaders() },
        body: JSON.stringify({ action: "make_primary", path }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(data?.error || `HTTP ${r.status}`));
      await loadPhotos();
      await loadAll();
      setNotice("Аватар установлен.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка"));
    } finally {
      setBusy(false);
    }
  }, [loadPhotos, loadAll]);

  const submitForApproval = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await authFetchJson("/api/me/profile/submit", { method: "POST" });
      await loadAll();
      setNotice("Отправлено на активацию.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка"));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

  const acceptJob = useCallback(async (jobId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await authFetchJson("/api/me/jobs/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      setNotice("Смена принята.");
      await loadAll();
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка принятия"));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

  const startJob = useCallback(async (jobId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const gps = await getGps();
      await authFetchJson("/api/me/jobs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, ...gps }),
      });
      setNotice("Старт зафиксирован.");
      await loadAll();
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка старта"));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

  const stopJob = useCallback(async (jobId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const gps = await getGps();
      await authFetchJson("/api/me/jobs/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, ...gps }),
      });
      setNotice("Стоп зафиксирован.");
      await loadAll();
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка стопа"));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

  const planned = useMemo(() => jobs.filter((j) => j.status === "planned"), [jobs]);
  const inprog = useMemo(() => jobs.filter((j) => j.status === "in_progress"), [jobs]);
  const done = useMemo(() => jobs.filter((j) => j.status === "done"), [jobs]);

  if (booting) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center">
        <div className="text-sm opacity-80">Загрузка…</div>
      </div>
    );
  }

  // LOGIN
  if (!authed || !me) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
          <div className="text-xl font-semibold">Tanija • Worker</div>
          <div className="text-sm opacity-80 mt-1">Вход / Регистрация</div>

          <div className="mt-4 flex gap-2">
            <button
              className={`flex-1 rounded-xl px-3 py-2 text-sm border ${
                loginMode === "phone" ? "bg-amber-500 text-zinc-950 border-amber-500" : "border-amber-500/30 hover:bg-amber-500/10"
              }`}
              onClick={() => {
                setLoginMode("phone");
                setOtpSent(false);
                setOtp("");
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Телефон
            </button>
            <button
              className={`flex-1 rounded-xl px-3 py-2 text-sm border ${
                loginMode === "email" ? "bg-amber-500 text-zinc-950 border-amber-500" : "border-amber-500/30 hover:bg-amber-500/10"
              }`}
              onClick={() => {
                setLoginMode("email");
                setEmailLinkSent(false);
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Email (magic link)
            </button>
          </div>

          {error ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div> : null}

          {loginMode === "phone" ? (
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Телефон, например +31612345678" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              {!otpSent ? (
                <button className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" onClick={doPhoneSend} disabled={busy || !phone.trim()}>
                  {busy ? "Отправляю…" : "Отправить код"}
                </button>
              ) : (
                <>
                  <input className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Код из SMS" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" />
                  <button className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" onClick={doPhoneVerify} disabled={busy || !otp.trim()}>
                    {busy ? "Проверяю…" : "Войти"}
                  </button>
                  <button className="w-full rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60" onClick={doPhoneSend} disabled={busy}>
                    Отправить ещё раз
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <button className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" onClick={doEmailSend} disabled={busy || !email.trim()}>
                {busy ? "Отправляю…" : (emailLinkSent ? "Отправить ещё раз" : "Отправить magic link")}
              </button>
              <div className="text-xs opacity-70">
                После клика по ссылке из письма ты вернёшься на сайт и войдёшь автоматически.
              </div>
            </div>
          )}

          <div className="mt-4 text-xs opacity-70">
            Для админа: <a className="underline" href="/admin/approvals">/admin/approvals</a>
          </div>
        </div>
      </div>
    );
  }

  // INACTIVE / ONBOARDING
  if (me.profile?.active !== true) {
    const submitted = !!me.profile?.onboarding_submitted_at;

    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-semibold">Профиль работника</div>
              <div className="text-sm opacity-80 mt-1">Заполни данные, поставь аватар и отправь на активацию</div>
            </div>
            <div className="flex gap-2">
              <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin/approvals">
                Админу: /admin/approvals
              </a>
              <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout}>
                Выйти
              </button>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5">
            <div className="text-lg font-semibold">Данные</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Имя и фамилия" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <input className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50" placeholder="Email (по желанию)" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
            </div>

            <div className="mt-3 text-xs opacity-70">
              Телефон: {me.user.phone || me.profile.phone || "—"} • Email подтверждён: {me.user.email ? (me.user.email_confirmed_at ? "да" : "нет") : "—"}
            </div>

            <div className="mt-4 flex gap-2">
              <button className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" disabled={busy} onClick={saveProfile}>
                {busy ? "Сохраняю…" : "Сохранить"}
              </button>
              <button
                className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  setNotice(null);
                  try { await loadAll(); setNotice("Обновлено."); }
                  catch (e: any) { setError(String(e?.message || e || "Ошибка")); }
                  finally { setBusy(false); }
                }}
              >
                {busy ? "…" : "Обновить"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold">Фото (до 5)</div>
              <div className="text-sm opacity-70">{photos.length}/5</div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto(f);
                }}
                disabled={busy}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
              {photos.map((p) => {
                const isAvatar = avatarPath && p.path === avatarPath;
                return (
                  <div key={p.path} className="rounded-xl border border-amber-500/15 bg-zinc-900/30 overflow-hidden">
                    <div className="aspect-square bg-black/30 flex items-center justify-center">
                      {p.url ? <img src={p.url} className="h-full w-full object-cover" /> : <div className="text-xs opacity-60">—</div>}
                    </div>
                    <div className="p-2 space-y-2">
                      <button className="w-full rounded-lg bg-amber-500 text-zinc-950 px-2 py-1 text-xs font-semibold hover:bg-amber-400 disabled:opacity-60" disabled={busy} onClick={() => makeAvatar(p.path)}>
                        {isAvatar ? "Аватар" : "Сделать аватаром"}
                      </button>
                      <button className="w-full rounded-lg border border-amber-500/30 px-2 py-1 text-xs hover:bg-amber-500/10 disabled:opacity-60" disabled={busy} onClick={() => delPhoto(p.path)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {photos.length === 0 ? <div className="mt-3 text-sm opacity-70">Загрузи фото и выбери аватар.</div> : null}
          </div>

          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">Активация</div>
                <div className="text-sm opacity-80 mt-1">
                  {submitted ? "Заявка отправлена. Ждём подтверждения админом." : "Когда всё готово — отправь на активацию."}
                </div>
              </div>

              <button className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" disabled={busy} onClick={submitForApproval}>
                {busy ? "Отправляю…" : "Отправить на активацию"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE WORKER SCREEN
  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Tanija • Worker</div>
            <div className="text-sm opacity-80 mt-1">
              {me.profile?.full_name || "—"} • {me.user?.email || me.profile?.email || "—"} • {me.profile?.role || "worker"}
            </div>
          </div>

          <div className="flex gap-2">
            {me.profile?.role === "admin" ? (
              <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
                Админка
              </a>
            ) : null}

            <a
  className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
  href="/me/profile"
>
  Профиль
</a>
            
            <button
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                setError(null);
                setNotice(null);
                try {
                  await loadAll();
                  setNotice("Обновлено.");
                } catch (e: any) {
                  setError(String(e?.message || e || "Ошибка обновления"));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? "Обновляю…" : "Обновить"}
            </button>
            <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout}>
              Выйти
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Запланировано" items={planned} busy={busy} meUserId={me.user.id} onAccept={() => {}} onStart={() => {}} onStop={() => {}} />
          <Section title="В процессе" items={inprog} busy={busy} meUserId={me.user.id} onAccept={() => {}} onStart={() => {}} onStop={() => {}} />
          <Section title="Завершено" items={done} busy={busy} meUserId={me.user.id} onAccept={() => {}} onStart={() => {}} onStop={() => {}} />
        </div>

        <div className="mt-6 text-xs opacity-70">Правило: старт/стоп только рядом с объектом, GPS точность ≤ 80м.</div>
      </div>
    </div>
  );

  function Section({
    title,
    items,
    busy,
    meUserId,
  }: {
    title: string;
    items: JobItem[];
    busy: boolean;
    meUserId: string;
    onAccept: (jobId: string) => void;
    onStart: (jobId: string) => void;
    onStop: (jobId: string) => void;
  }) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4 shadow-xl">
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-sm opacity-70">{items.length}</div>
        </div>

        <div className="mt-3 space-y-3">
          {items.length === 0 ? (
            <div className="text-sm opacity-70">—</div>
          ) : (
            items.map((j) => {
              const from = timeHHMM(j.scheduled_time);
              const to = timeHHMM(j.scheduled_end_time ?? null);
              const planM = plannedMinutes(from, to);

              const factM = Math.max(0, Math.floor(Number(j.actual_minutes || 0) || 0));
              const showFact = j.status === "done" && factM > 0;

              const line =
                j.status === "done"
                  ? `${fmtD(j.job_date)} • ${from && to ? `${from}–${to}` : from || "—"} • ${showFact ? `факт ${fmtDur(factM)}` : planM != null ? `${fmtDur(planM)}` : "—"} • ${statusRu(String(j.status || ""))}`
                  : `${fmtD(j.job_date)} • ${from && to ? `${from}–${to}` : from || "—"}${planM != null ? ` • ${fmtDur(planM)}` : ""} • ${statusRu(String(j.status || ""))}`;

              return (
                <div key={j.id} className="rounded-xl border border-amber-500/15 bg-zinc-900/30 p-3">
                  <div className="text-sm font-semibold">{j.site_name || "Объект"}</div>
                  <div className="mt-1 text-xs opacity-80">{line}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }
}
