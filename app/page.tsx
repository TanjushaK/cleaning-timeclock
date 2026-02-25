"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from "@/lib/auth-fetch";
import AppFooter from "@/app/_components/AppFooter";

type Profile = {
  id: string;
  role?: string | null;
  active?: boolean | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_path?: string | null;
  notes?: string | null;
  onboarding_submitted_at?: string | null;
};

type MeProfileResponse = {
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    email_confirmed_at?: string | null;
    temp_password?: boolean | null;
  };
  profile: Profile;
};

type MeJobsResponse = {
  jobs: Array<{
    id: string;
    job_date: string | null;
    scheduled_time: string | null;
    status: "planned" | "in_progress" | "done" | string;
    site_id: string | null;
    site_name?: string | null;
    site_address?: string | null;
    site_radius?: number | null;
    site_lat?: number | null;
    site_lng?: number | null;
    site_photo_url?: string | null;
    site_photos_count?: number | null;
    worker_id?: string | null;
    can_accept?: boolean | null;
    accepted_at?: string | null;
    started_at?: string | null;
    stopped_at?: string | null;
    distance_m?: number | null;
    accuracy_m?: number | null;
    worker_note?: string | null;
  }>;
};

type MyPhotosResponse = {
  photos: Array<{ path: string; url?: string | null }>;
  avatar_path?: string | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDateRu(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function formatTimeRu(time: string | null | undefined) {
  if (!time) return "—";
  const t = String(time);
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const hh = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDateTimeRu(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
}

function statusRu(s: string | null | undefined) {
  const v = String(s || "").toLowerCase();
  if (v === "planned") return "запланировано";
  if (v === "in_progress") return "в работе";
  if (v === "done") return "завершено";
  return s ? String(s) : "—";
}


function openNavToSite(lat: number | null | undefined, lng: number | null | undefined, address: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (lat != null && lng != null) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const q = String(address || "").trim();
    if (q) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    // ignore
  }
}

async function getGpsOnce(): Promise<{ lat: number; lng: number; accuracy: number }> {
  if (typeof window === "undefined") throw new Error("GPS недоступен.");
  if (!("geolocation" in navigator)) throw new Error("GPS недоступен на этом устройстве.");
  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
          reject(new Error("Не удалось получить корректный GPS."));
          return;
        }
        resolve({ lat, lng, accuracy });
      },
      (err) => {
        reject(new Error(`Не удалось получить GPS: ${err.message || err.code}`));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function isE164(phone: string) {
  return /^\+\d{8,15}$/.test(phone);
}

function digitsOnly(phone: string) {
  return String(phone || "").replace(/[^\d]/g, "");
}

function makeWorkerEmailFromPhone(phoneE164: string) {
  const digits = digitsOnly(phoneE164);
  return `${digits}@workers.tanjusha`;
}

type Tab = "login" | "sms" | "email";

export default function AppPage() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeProfileResponse | null>(null);
  const [jobs, setJobs] = useState<MeJobsResponse["jobs"]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("login");

  // login
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  // sms recovery
  const [smsPhone, setSmsPhone] = useState("");
  const [smsOtp, setSmsOtp] = useState("");
  const [smsNewPassword, setSmsNewPassword] = useState("");
  const [smsStep, setSmsStep] = useState<"enter_phone" | "enter_code" | "set_password">("enter_phone");

  // email recovery link
  const [emailRecover, setEmailRecover] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // onboarding + photos
  const [fullName, setFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [photos, setPhotos] = useState<Array<{ path: string; url?: string | null }>>([]);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const authed = !!token;

  const bearerHeaders = useCallback((): Record<string, string> => {
    const t = getAccessToken();
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, []);

  const loadPhotos = useCallback(async () => {
    const r = await fetch("/api/me/photos", {
      headers: bearerHeaders(),
      cache: "no-store",
    });
    const data = (await r.json()) as MyPhotosResponse | any;
    if (!r.ok) throw new Error(String(data?.error || `HTTP ${r.status}`));
    setPhotos(Array.isArray(data.photos) ? data.photos : []);
    setAvatarPath(data.avatar_path || null);
  }, [bearerHeaders]);

  const loadAll = useCallback(async () => {
    const profile = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
    setMe(profile);
    setFullName(profile?.profile?.full_name || "");
    setProfileEmail(profile?.profile?.email || "");

    await loadPhotos().catch(() => {});

    const jobsRes = await authFetchJson<any>("/api/me/jobs", { cache: "no-store" });
    const list = Array.isArray(jobsRes?.jobs)
      ? jobsRes.jobs
      : Array.isArray(jobsRes?.items)
        ? jobsRes.items
        : [];
    setJobs(Array.isArray(list) ? list : []);
  }, [loadPhotos]);

  useEffect(() => {
    const t = getAccessToken();
    setToken(t);
    (async () => {
      try {
        if (t) await loadAll();
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        if (/401|Нет токена|token/i.test(msg)) {
          clearAuthTokens();
          setToken(null);
          setMe(null);
          setJobs([]);
          try {
            await supabase.auth.signOut();
          } catch {}
        } else {
          setError(msg || "Ошибка загрузки");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  const doLogout = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      clearAuthTokens();
      setToken(null);
      setMe(null);
      setJobs([]);
      try {
        await supabase.auth.signOut();
      } catch {}
      setNotice("Вы вышли.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, []);

  const doEmailPasswordLogin = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      const pw = emailPassword;
      if (!em) throw new Error("Введи email или телефон");
      if (!em.includes("@") && !em.startsWith("+")) throw new Error("Телефон нужен в формате E.164, например +31612345678");
      if (!pw || !pw.trim()) throw new Error("Пароль обязателен");

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: em, password: pw }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      if (!payload?.access_token) throw new Error("Не удалось получить токен");

      setAuthTokens(String(payload.access_token), payload.refresh_token ? String(payload.refresh_token) : null);

      // Синхронизируем сессию Supabase-клиента, иначе supabase.auth.updateUser() не работает после /api/auth/login
      try {
        if (payload.refresh_token) {
          await supabase.auth.setSession({
            access_token: String(payload.access_token),
            refresh_token: String(payload.refresh_token),
          });
        }
      } catch {}

      const t = getAccessToken();
      setToken(t);
      await loadAll();
      setNotice("Вход выполнен.");

      try {
        const prof = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
        if (prof?.profile?.role === "admin") window.location.href = "/admin";
      } catch {}
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка входа"));
    } finally {
      setBusy(false);
    }
  }, [email, emailPassword, loadAll]);

  const doSmsSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = smsPhone.trim();
      if (!isE164(p)) throw new Error("Телефон нужен в формате E.164, например +31612345678");

      const { error: otpErr } = await supabase.auth.signInWithOtp({
        phone: p,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpErr) throw new Error(otpErr.message);

      setSmsStep("enter_code");
      setNotice("Код отправлен по SMS.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [smsPhone]);

  const doSmsVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = smsPhone.trim();
      const code = smsOtp.trim();
      if (!isE164(p)) throw new Error("Телефон нужен в формате E.164, например +31612345678");
      if (!code) throw new Error("Введи код из SMS");

      const { data, error: vErr } = await supabase.auth.verifyOtp({
        phone: p,
        token: code,
        type: "sms",
      });

      if (vErr) throw new Error(vErr.message);
      if (!data?.session) throw new Error("Не удалось создать сессию по SMS");

      setAuthTokens(String(data.session.access_token), data.session.refresh_token ? String(data.session.refresh_token) : null);
      setToken(getAccessToken());
      setSmsStep("set_password");
      setNotice("Номер подтверждён. Теперь задай новый пароль.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [smsPhone, smsOtp]);

  const doSmsSetPassword = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const pw = smsNewPassword;
      if (!pw || pw.trim().length < 6) throw new Error("Пароль должен быть минимум 6 символов");

      await authFetchJson('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw.trim() }),
      });

      await loadAll().catch(() => {});
      setNotice("Пароль обновлён. Можешь входить паролем.");
      setTab("login");
      setSmsStep("enter_phone");
      setSmsOtp("");
      setSmsNewPassword("");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [smsNewPassword, loadAll]);

  const doEmailRecovery = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = emailRecover.trim().toLowerCase();
      if (!em || !em.includes("@")) throw new Error("Введи корректный email");

      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : "https://timeclock.tanjusha.nl/reset-password";

      const { error: rErr } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo,
      });

      if (rErr) throw new Error(rErr.message);

      setNotice("Письмо для восстановления отправлено. Проверь почту.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [emailRecover]);

  const doUpdateProfile = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        full_name: fullName.trim() || null,
        email: profileEmail.trim() || null,
      };
      const res = await authFetchJson<any>("/api/me/profile/update", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res?.error) throw new Error(String(res.error));
      await loadAll();
      setNotice("Профиль обновлён.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [fullName, profileEmail, loadAll]);

  const doSubmitForApproval = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetchJson<any>("/api/me/profile/submit", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res?.error) throw new Error(String(res.error));
      await loadAll();
      setNotice("Заявка отправлена. Жди активации админом.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

  const doUploadPhoto = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input = fileRef.current;
      const file = input?.files?.[0];
      if (!file) throw new Error("Выбери файл");
      const fd = new FormData();
      fd.append("file", file);

      const r = await fetch("/api/me/photos", {
        method: "POST",
        headers: bearerHeaders(),
        body: fd,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      await loadPhotos();
      setNotice("Фото загружено.");
      if (input) input.value = "";
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [bearerHeaders, loadPhotos]);

  const doMakePrimary = useCallback(
    async (path: string) => {
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
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        await loadPhotos();
        setNotice("Аватар обновлён.");
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [bearerHeaders, loadPhotos]
  );

  const doDeletePhoto = useCallback(
    async (path: string) => {
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
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        await loadPhotos();
        setNotice("Фото удалено.");
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setBusy(false);
      }
    },
    [bearerHeaders, loadPhotos]
  );

  const doAccept = useCallback(async (jobId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetchJson<any>("/api/me/jobs/accept", {
        method: "POST",
        body: JSON.stringify({ id: jobId }),
      });
      if (res?.error) throw new Error(String(res.error));
      await loadAll();
      setNotice("Принято.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

    const doStart = useCallback(async (jobId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const gps = await getGpsOnce();
      const res = await authFetchJson<any>("/api/me/jobs/start", {
        method: "POST",
        body: JSON.stringify({ id: jobId, ...gps }),
      });
      if (res?.error) throw new Error(String(res.error));
      await loadAll();
      setNotice("Старт.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

    const doStop = useCallback(async (jobId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const gps = await getGpsOnce();
      const res = await authFetchJson<any>("/api/me/jobs/stop", {
        method: "POST",
        body: JSON.stringify({ id: jobId, ...gps }),
      });
      if (res?.error) throw new Error(String(res.error));
      await loadAll();
      setNotice("Стоп.");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [loadAll]);

  const workerIsActive = Boolean(me?.profile?.active);
  const isAdmin = me?.profile?.role === "admin";
  const tempPassword = Boolean(me?.user?.temp_password);

  const jobsSorted = useMemo(() => {
    const xs = [...jobs];
    xs.sort((a, b) => {
      const ad = a.job_date ? new Date(a.job_date).getTime() : 0;
      const bd = b.job_date ? new Date(b.job_date).getTime() : 0;
      if (ad !== bd) return ad - bd;
      const at = a.scheduled_time || "";
      const bt = b.scheduled_time || "";
      return at.localeCompare(bt);
    });
    return xs;
  }, [jobs]);

  const gold = "text-amber-200";
  const border = "border border-amber-500/25";
  const card = clsx("rounded-2xl bg-zinc-950/80", border, "shadow-[0_0_0_1px_rgba(245,158,11,0.08),0_20px_60px_rgba(0,0,0,0.45)]");
  const btn = clsx(
    "rounded-xl px-4 py-2 font-medium",
    "bg-amber-400/15 hover:bg-amber-400/25",
    "text-amber-100",
    border,
    "disabled:opacity-50 disabled:cursor-not-allowed"
  );
  const btnSolid = clsx(
    "rounded-xl px-4 py-2 font-semibold",
    "bg-amber-400 text-zinc-950 hover:bg-amber-300",
    "shadow-[0_10px_30px_rgba(245,158,11,0.25)]",
    "disabled:opacity-50 disabled:cursor-not-allowed"
  );
  const input = clsx(
    "w-full rounded-xl px-3 py-2 bg-zinc-950/60",
    border,
    "text-zinc-100 placeholder:text-zinc-500",
    "focus:outline-none focus:ring-2 focus:ring-amber-400/30"
  );

  if (loading) {
    return (
      <div className="appTheme min-h-screen flex flex-col">
        <main className="flex-1 bg-black text-zinc-100 flex items-center justify-center p-6">
          <div className={clsx(card, "p-6 w-full max-w-md")}>
            <div className="text-lg font-semibold">Загрузка…</div>
            <div className="mt-2 text-sm opacity-70">Поднимаю сессию и профиль.</div>
          </div>
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="appTheme min-h-screen flex flex-col">
      <main className="flex-1 bg-black text-zinc-100 p-6">
        <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className={clsx("text-2xl font-semibold", gold)}>Cleaning Timeclock</div>
            <div className="text-sm opacity-70">Van Tanija BV Cleaning</div>
          </div>

          <div className="flex items-center gap-2">
            {authed && (
              <>
                <a className={btn} href="/me/profile">Профиль</a>
                {isAdmin && <a className={btn} href="/admin">Админ</a>}
                <button className={btn} onClick={doLogout} disabled={busy}>Выйти</button>
              </>
            )}
          </div>
        </header>

        {(error || notice) && (
          <div className={clsx("mt-4", card, "p-4")}>
            {error && <div className="text-sm text-red-300">{error}</div>}
            {notice && <div className="text-sm text-emerald-200">{notice}</div>}
          </div>
        )}

        {!authed ? (
          <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={clsx(card, "p-6")}>
              <div className="flex items-center gap-2">
                <button
                  className={clsx(btn, tab === "login" && "bg-amber-400/30")}
                  onClick={() => setTab("login")}
                >
                  Вход
                </button>
                <button
                  className={clsx(btn, tab === "sms" && "bg-amber-400/30")}
                  onClick={() => setTab("sms")}
                >
                  По SMS
                </button>
                <button
                  className={clsx(btn, tab === "email" && "bg-amber-400/30")}
                  onClick={() => setTab("email")}
                >
                  По Email
                </button>
              </div>

              {tab === "login" && (
                <div className="mt-5 space-y-3">
                  <div className="text-sm opacity-80">Логин = email или телефон (+31…); вход по паролю.</div>

                  <input
                    className={input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email или телефон, например +31612345678"
                    autoComplete="username"
                  />

                  <input
                    className={input}
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="Пароль"
                    type="password"
                    autoComplete="current-password"
                  />

                  <div className="flex items-center gap-2">
                    <button className={btnSolid} onClick={doEmailPasswordLogin} disabled={busy}>
                      Войти
                    </button>
                    <a className="text-sm underline opacity-80 hover:opacity-100" href="/forgot-password">
                      Забыл пароль (email)
                    </a>
                  </div>

                  <div className="text-xs opacity-60">
                    Если у воркера нет email — логин будет вида <span className="font-mono">{makeWorkerEmailFromPhone("+31612345678")}</span>
                  </div>
                </div>
              )}

              {tab === "sms" && (
                <div className="mt-5 space-y-3">
                  <div className="text-sm opacity-80">Восстановление пароля через SMS (если телефон привязан к аккаунту).</div>

                  <input
                    className={input}
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    placeholder="Телефон, например +31612345678"
                    autoComplete="tel"
                  />

                  {smsStep === "enter_phone" && (
                    <button className={btnSolid} onClick={doSmsSend} disabled={busy}>
                      Отправить код
                    </button>
                  )}

                  {smsStep === "enter_code" && (
                    <>
                      <input
                        className={input}
                        value={smsOtp}
                        onChange={(e) => setSmsOtp(e.target.value)}
                        placeholder="Код из SMS"
                        autoComplete="one-time-code"
                      />
                      <div className="flex gap-2">
                        <button className={btnSolid} onClick={doSmsVerify} disabled={busy}>
                          Подтвердить
                        </button>
                        <button
                          className={btn}
                          onClick={() => {
                            setSmsStep("enter_phone");
                            setSmsOtp("");
                          }}
                          disabled={busy}
                        >
                          Назад
                        </button>
                      </div>
                    </>
                  )}

                  {smsStep === "set_password" && (
                    <>
                      <input
                        className={input}
                        value={smsNewPassword}
                        onChange={(e) => setSmsNewPassword(e.target.value)}
                        placeholder="Новый пароль (мин. 6 символов)"
                        type="password"
                        autoComplete="new-password"
                      />
                      <button className={btnSolid} onClick={doSmsSetPassword} disabled={busy}>
                        Сохранить пароль
                      </button>
                    </>
                  )}

                  <div className="text-xs opacity-70">
                    Если SMS “не находит” — значит телефон не привязан к аккаунту. Привязку делает админ в профиле воркера.
                  </div>
                </div>
              )}

              {tab === "email" && (
                <div className="mt-5 space-y-3">
                  <div className="text-sm opacity-80">Резервное восстановление через письмо.</div>
                  <input
                    className={input}
                    value={emailRecover}
                    onChange={(e) => setEmailRecover(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                  />
                  <button className={btnSolid} onClick={doEmailRecovery} disabled={busy}>
                    Отправить письмо
                  </button>
                  <div className="text-xs opacity-60">
                    Письмо ведёт на <span className="font-mono">/reset-password</span>.
                  </div>
                </div>
              )}
            </div>

            <div className={clsx(card, "p-6")}>
              <div className="text-lg font-semibold">Как это теперь работает</div>
              <ul className="mt-3 space-y-2 text-sm opacity-80 list-disc pl-5">
                <li>Админ создаёт воркера и выдаёт временный пароль.</li>
                <li>Воркер заходит логин+пароль (без magic link).</li>
                <li>Телефон — восстановление через SMS (если привязан к аккаунту).</li>
                <li>Email — второе восстановление (страница /forgot-password или вкладка “По Email”).</li>
              </ul>
              <div className="mt-4 text-xs opacity-60">
                Если ты админ — после входа тебя перекинет в /admin автоматически.
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className={clsx(card, "p-6 xl:col-span-2")}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Смены</div>
                <button className={btn} onClick={() => loadAll().catch((e) => setError(String((e as any)?.message || e)))} disabled={busy}>
                  Обновить
                </button>
              </div>

              {!workerIsActive && !isAdmin && (
                <div className={clsx("mt-4 p-3 rounded-xl", border, "bg-amber-400/10")}>
                  <div className="text-sm font-semibold text-amber-200">Ожидание активации</div>
                  <div className="text-xs opacity-80 mt-1">
                    Пока аккаунт не активирован админом, доступ к работам может быть ограничен.
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {jobsSorted.length === 0 ? (
                  <div className="text-sm opacity-70">Пока нет заданий.</div>
                ) : (
                  jobsSorted.map((j) => {
                    const planned = j.status === "planned";
                    const inProg = j.status === "in_progress";
                    const done = j.status === "done";

                    return (
                      <div key={j.id} className={clsx("rounded-2xl p-4", border, "bg-zinc-950/60")}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => openNavToSite(j.site_lat, j.site_lng, j.site_address)}
                              className={clsx("relative h-12 w-12 overflow-hidden rounded-2xl", border, "bg-zinc-900/30", (j.site_lat != null && j.site_lng != null) || j.site_address ? "hover:bg-zinc-900/40" : "")}
                              title="Навигация"
                            >
                              <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">
                                {(j.site_name || "—").trim().slice(0, 1).toUpperCase() || "•"}
                              </div>
                              {j.site_photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={j.site_photo_url}
                                  alt="site"
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    try {
                                      ;(e.currentTarget as HTMLImageElement).style.display = "none"
                                    } catch {}
                                  }}
                                />
                              ) : null}
                            </button>

                            <div>
                              <div className="text-sm font-semibold">
                                {formatDateRu(j.job_date)} • {formatTimeRu(j.scheduled_time)} • <span className={gold}>{statusRu(j.status)}</span>
                              </div>
                              <div className="text-xs opacity-70 mt-1">
                                {j.site_name || "Объект"} — {j.site_address || "—"}
                              </div>
                              <div className="mt-2">
                                <button
                                  type="button"
                                  className={clsx(btn, "text-xs px-3 py-1") }
                                  onClick={() => openNavToSite(j.site_lat, j.site_lng, j.site_address)}
                                >
                                  Навигация
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
                            {planned && Boolean(j.can_accept) && (
                              <button className={btnSolid} onClick={() => doAccept(j.id)} disabled={busy}>
                                Принять
                              </button>
                            )}
                            {inProg && (
                              <button className={btnSolid} onClick={() => doStop(j.id)} disabled={busy}>
                                Стоп
                              </button>
                            )}
                            {planned && !Boolean(j.can_accept) && (
                              <button className={btn} onClick={() => doStart(j.id)} disabled={busy}>
                                Старт
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs opacity-80 md:grid-cols-2">
                          <div>Старт: {formatDateTimeRu(j.started_at)}</div>
                          <div>Стоп: {formatDateTimeRu(j.stopped_at)}</div>
                        </div>

                        {(j.distance_m != null || j.accuracy_m != null) ? (
                          <div className="mt-2 text-xs opacity-70">
                            GPS: расстояние {j.distance_m ?? "—"} м • точность {j.accuracy_m ?? "—"} м
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className={clsx(card, "p-6 xl:col-span-1")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/tanija-logo.png" alt="Tanija" className="h-6 w-auto" />
                  <div className="text-lg font-semibold">Профиль</div>
                </div>
                <div className="text-xs opacity-70">
                  Роль: <span className={gold}>{me?.profile?.role || "—"}</span> • Активен:{" "}
                  <span className={gold}>{workerIsActive ? "да" : "нет"}</span>
                </div>
              </div>

              {tempPassword && (
                <div className={clsx("mt-4 p-3 rounded-xl", border, "bg-amber-400/10")}>
                  <div className="text-sm font-semibold text-amber-200">Временный пароль</div>
                  <div className="text-xs opacity-80 mt-1">
                    У тебя временный пароль от админа. Открой <span className="font-semibold">Профиль → Пароль</span> и задай свой.
                    Если доступа к email нет — восстановление через SMS / Email.
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-xs opacity-70">Имя</div>
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ФИО" />
                </div>
                <div>
                  <div className="text-xs opacity-70">Email (для контакта)</div>
                  <input className={input} value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} placeholder="Email" />
                </div>

                <button className={btnSolid} onClick={doUpdateProfile} disabled={busy}>
                  Сохранить профиль
                </button>

                <div className="text-xs opacity-70">
                  Телефон: {me?.user?.phone || me?.profile?.phone || "—"} • Email подтверждён:{" "}
                  {me?.user?.email ? (me?.user?.email_confirmed_at ? "да" : "нет") : "—"}
                </div>
              </div>

              <div className="mt-6 border-t border-amber-500/15 pt-5">
                <div className="text-lg font-semibold">Фото (до 5)</div>

                <div className="mt-3 flex gap-2 items-center">
                  <input ref={fileRef} className={clsx("text-xs", "w-full")} type="file" accept="image/png,image/jpeg,image/webp" />
                  <button className={btn} onClick={doUploadPhoto} disabled={busy}>
                    Загрузить
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {photos.map((p) => {
                    const isPrimary = avatarPath && p.path === avatarPath;
                    return (
                      <div key={p.path} className={clsx("rounded-xl overflow-hidden", border, "bg-zinc-950/60")}>
                        <div className="aspect-[4/3] bg-zinc-900/30 flex items-center justify-center">
                          {p.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.url} alt="photo" className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-xs opacity-60">нет превью</div>
                          )}
                        </div>
                        <div className="p-2 flex gap-2">
                          <button className={clsx(btn, "text-xs px-2 py-1")} onClick={() => doMakePrimary(p.path)} disabled={busy}>
                            {isPrimary ? "Аватар" : "Сделать аватаром"}
                          </button>
                          <button className={clsx(btn, "text-xs px-2 py-1")} onClick={() => doDeletePhoto(p.path)} disabled={busy}>
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!workerIsActive && !isAdmin ? (
                  <div className="mt-4">
                    <button className={btnSolid} onClick={doSubmitForApproval} disabled={busy}>
                      Отправить на активацию
                    </button>
                    <div className="text-xs opacity-60 mt-2">
                      После отправки админ активирует тебя в /admin/approvals.
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-xs opacity-70">Аккаунт активирован.</div>
                )}
              </div>
            </div>
          </section>
        )}

        </div>
      </main>
      <AppFooter />
    </div>
  );
}
