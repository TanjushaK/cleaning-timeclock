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
  notes?: string | null;
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
  scheduled_end_time: string | null;
  site_id: string | null;
  site_name: string | null;
  worker_id: string | null;
  started_at: string | null;
  stopped_at: string | null;
  actual_minutes?: number | null;
  can_accept?: boolean | null;
};

type MeJobsResponse = { items: JobItem[] };

type MyPhotosResponse = {
  photos: Array<{ path: string; url?: string | null }>;
  avatar_path: string | null;
};

type Gps = { lat: number; lng: number; accuracy: number };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function fmtDT(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

function fmtDur(mins: number) {
  const m = Math.max(0, Math.floor(Number(mins || 0)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h <= 0) return `${r}м`;
  return `${h}ч ${pad2(r)}м`;
}

function statusRu(s: string) {
  if (s === "planned") return "Запланировано";
  if (s === "in_progress") return "В процессе";
  if (s === "done") return "Завершено";
  return s || "—";
}

function bearerHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  try {
    const t = getAccessToken();
    if (t) h["Authorization"] = `Bearer ${t}`;
  } catch {}
  return h;
}

function isE164(s: string) {
  return /^\+[1-9]\d{6,14}$/.test(s);
}

async function getGps(): Promise<Gps> {
  if (typeof window === "undefined") throw new Error("GPS недоступен.");
  if (!("geolocation" in navigator)) throw new Error("GPS недоступен в браузере.");
  return await new Promise<Gps>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Доступ к геолокации запрещён. Разреши GPS для сайта."
            : err.code === err.POSITION_UNAVAILABLE
              ? "GPS недоступен. Включи геолокацию и попробуй ещё раз."
              : "Таймаут GPS. Повтори ещё раз.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function Page() {
  // Theme (dark chocolate + gold)
  const BG = "bg-[#0b0604]";
  const CARD =
    "border border-amber-500/20 bg-[#120806]/70 shadow-[0_0_0_1px_rgba(245,158,11,0.06),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur";
  const SOFT = "border border-amber-500/15 bg-black/20";
  const BTN = "rounded-2xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60";
  const BTN_PRI =
    "rounded-2xl bg-amber-500 text-[#120806] px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60";

  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const [me, setMe] = useState<MeProfileResponse | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [photos, setPhotos] = useState<Array<{ path: string; url?: string | null }>>([]);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Login UI
  const [loginTab, setLoginTab] = useState<"email" | "phone">("email");
  const [emailMode, setEmailMode] = useState<"code" | "link">("code");

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");

  const [phone, setPhone] = useState("");
  const [smsSent, setSmsSent] = useState(false);
  const [smsCode, setSmsCode] = useState("");

  // Photos upload
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const authed = !!token && !!me;

  const loadPhotos = useCallback(async () => {
    const r = await fetch("/api/me/photos", { headers: bearerHeaders(), cache: "no-store" });
    const data = (await r.json().catch(() => ({}))) as MyPhotosResponse | any;
    if (!r.ok) throw new Error(String(data?.error || `HTTP ${r.status}`));
    setPhotos(Array.isArray(data.photos) ? data.photos : []);
    setAvatarPath(data.avatar_path || null);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setNotice(null);

    const prof = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
    setMe(prof);

    await loadPhotos().catch(() => null);

    if (prof?.profile?.active === true) {
      const jr = await authFetchJson<MeJobsResponse>("/api/me/jobs", { cache: "no-store" });
      setJobs(Array.isArray(jr?.items) ? jr.items : []);
    } else {
      setJobs([]);
    }
  }, [loadPhotos]);

  useEffect(() => {
    (async () => {
      try {
        setBooting(true);

        // 1) If Supabase session exists — sync it into our LS tokens
        try {
          const { data } = await supabase.auth.getSession();
          const s = data?.session;
          if (s?.access_token) {
            setAuthTokens(s.access_token, s.refresh_token || null);
          }
        } catch {}

        // 2) Read token from localStorage (source of truth for our API)
        const t = getAccessToken();
        setToken(t);

        if (t) await loadAll();
      } catch (e: any) {
        const msg = String(e?.message || e || "Ошибка");
        if (msg.includes("401") || /токен|unauthorized/i.test(msg)) {
          clearAuthTokens();
          try {
            await supabase.auth.signOut();
          } catch {}
          setToken(null);
          setMe(null);
          setJobs([]);
          setPhotos([]);
          setAvatarPath(null);
        } else {
          setError(msg);
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [loadAll]);

  const doLogout = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      clearAuthTokens();
      try {
        await supabase.auth.signOut();
      } catch {}
      setToken(null);
      setMe(null);
      setJobs([]);
      setPhotos([]);
      setAvatarPath(null);
      setEmail("");
      setEmailCode("");
      setEmailSent(false);
      setPhone("");
      setSmsCode("");
      setSmsSent(false);
      setNotice("Вы вышли.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка выхода"));
    } finally {
      setBusy(false);
    }
  }, []);

  // EMAIL: Code (recommended)
  const sendEmailCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      if (!em || !em.includes("@")) throw new Error("Введи корректный email.");
      const { error: e1 } = await supabase.auth.signInWithOtp({
        email: em,
        options: { shouldCreateUser: true },
      });
      if (e1) throw new Error(e1.message);
      setEmailSent(true);
      setNotice("Код отправлен на email.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка отправки email"));
    } finally {
      setBusy(false);
    }
  }, [email]);

  const verifyEmailCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      const code = emailCode.trim();
      if (!em || !em.includes("@")) throw new Error("Введи корректный email.");
      if (!code) throw new Error("Введи код из письма.");
      const { data, error: e2 } = await supabase.auth.verifyOtp({ email: em, token: code, type: "email" });
      if (e2) throw new Error(e2.message);

      const s = data?.session;
      if (!s?.access_token) throw new Error("Не удалось получить сессию.");
      setAuthTokens(s.access_token, s.refresh_token || null);

      const t = getAccessToken();
      setToken(t);
      await loadAll();
      setNotice("Вход выполнен.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка входа"));
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }, [email, emailCode, loadAll]);

  // EMAIL: Magic link (keep as fallback)
  const sendMagicLink = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      if (!em || !em.includes("@")) throw new Error("Введи корректный email.");
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error: e1 } = await supabase.auth.signInWithOtp({
        email: em,
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
      });
      if (e1) throw new Error(e1.message);

      setEmailSent(true);
      setNotice("Ссылка отправлена. Открой письмо и нажми magic link.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка отправки ссылки"));
    } finally {
      setBusy(false);
    }
  }, [email]);

  // PHONE: SMS (keep, but de-emphasize)
  const sendSms = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = phone.trim();
      if (!isE164(p)) throw new Error("Телефон нужен в формате E.164, например +31612345678");
      const { error: e1 } = await supabase.auth.signInWithOtp({ phone: p, options: { channel: "sms" } });
      if (e1) throw new Error(e1.message);
      setSmsSent(true);
      setNotice("SMS-код отправлен.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка отправки SMS"));
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const verifySms = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = phone.trim();
      const code = smsCode.trim();
      if (!isE164(p)) throw new Error("Телефон нужен в формате E.164, например +31612345678");
      if (!code) throw new Error("Введи код из SMS.");
      const { data, error: e2 } = await supabase.auth.verifyOtp({ phone: p, token: code, type: "sms" });
      if (e2) throw new Error(e2.message);

      const s = data?.session;
      if (!s?.access_token) throw new Error("Не удалось получить сессию.");
      setAuthTokens(s.access_token, s.refresh_token || null);

      const t = getAccessToken();
      setToken(t);
      await loadAll();
      setNotice("Вход выполнен.");
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка входа"));
    } finally {
      setBusy(false);
      setBooting(false);
    }
  }, [phone, smsCode, loadAll]);

  const refreshClick = useCallback(async () => {
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
  }, [loadAll]);

  // Worker actions
  const acceptJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await authFetchJson("/api/me/jobs/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        await loadAll();
        setNotice("Смена принята.");
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка принятия"));
      } finally {
        setBusy(false);
      }
    },
    [loadAll]
  );

  const startJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const gps = await getGps();
        await authFetchJson("/api/me/jobs/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy }),
        });
        await loadAll();
        setNotice("Старт зафиксирован.");
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка старта"));
      } finally {
        setBusy(false);
      }
    },
    [loadAll]
  );

  const stopJob = useCallback(
    async (jobId: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const gps = await getGps();
        await authFetchJson("/api/me/jobs/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy }),
        });
        await loadAll();
        setNotice("Стоп зафиксирован.");
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка стопа"));
      } finally {
        setBusy(false);
      }
    },
    [loadAll]
  );

  // Photos actions
  const uploadPhoto = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/me/photos", { method: "POST", headers: bearerHeaders(), body: fd });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(String((data as any)?.error || `HTTP ${r.status}`));
        await loadPhotos();
        setNotice("Фото загружено.");
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка загрузки"));
      } finally {
        setBusy(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    },
    [loadPhotos]
  );

  const delPhoto = useCallback(
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
        if (!r.ok) throw new Error(String((data as any)?.error || `HTTP ${r.status}`));
        await loadPhotos();
        setNotice("Удалено.");
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка удаления"));
      } finally {
        setBusy(false);
      }
    },
    [loadPhotos]
  );

  const makeAvatar = useCallback(
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
        if (!r.ok) throw new Error(String((data as any)?.error || `HTTP ${r.status}`));
        await loadPhotos();
        await loadAll();
        setNotice("Аватар установлен.");
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка"));
      } finally {
        setBusy(false);
      }
    },
    [loadPhotos, loadAll]
  );

  const planned = useMemo(() => jobs.filter((j) => j.status === "planned"), [jobs]);
  const inprog = useMemo(() => jobs.filter((j) => j.status === "in_progress"), [jobs]);
  const done = useMemo(() => jobs.filter((j) => j.status === "done"), [jobs]);

  if (booting) {
    return (
      <div className={`min-h-screen ${BG} text-amber-100 flex items-center justify-center`}>
        <div className="text-sm opacity-80">Загрузка…</div>
      </div>
    );
  }

  // LOGIN
  if (!authed) {
    return (
      <div className={`min-h-screen ${BG} text-amber-100 flex items-center justify-center p-4`}>
        <div className={`w-full max-w-md rounded-3xl ${CARD} p-6`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold tracking-wide">Cleaning Timeclock</div>
              <div className="mt-1 text-xs text-amber-200/70">Премиум-режим: тёмный шоколад, золото и дисциплина.</div>
            </div>
            <img src="/tanija-logo.png" alt="Tanija" className="h-10 w-10 rounded-2xl border border-amber-500/20" />
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button
              className={`flex-1 rounded-2xl px-3 py-2 text-sm border ${
                loginTab === "email" ? "bg-amber-500 text-[#120806] border-amber-500" : "border-amber-500/30 hover:bg-amber-500/10"
              }`}
              onClick={() => {
                setLoginTab("email");
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Email
            </button>
            <button
              className={`flex-1 rounded-2xl px-3 py-2 text-sm border ${
                loginTab === "phone" ? "bg-amber-500 text-[#120806] border-amber-500" : "border-amber-500/30 hover:bg-amber-500/10"
              }`}
              onClick={() => {
                setLoginTab("phone");
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Телефон
            </button>
          </div>

          {loginTab === "email" ? (
            <div className="mt-4">
              <div className="flex gap-2">
                <button
                  className={`flex-1 rounded-2xl px-3 py-2 text-xs border ${
                    emailMode === "code" ? "bg-amber-500/15 border-amber-500/40" : "border-amber-500/20 hover:bg-amber-500/10"
                  }`}
                  onClick={() => setEmailMode("code")}
                  disabled={busy}
                >
                  Код (рекоменд.)
                </button>
                <button
                  className={`flex-1 rounded-2xl px-3 py-2 text-xs border ${
                    emailMode === "link" ? "bg-amber-500/15 border-amber-500/40" : "border-amber-500/20 hover:bg-amber-500/10"
                  }`}
                  onClick={() => setEmailMode("link")}
                  disabled={busy}
                >
                  Magic link
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                <input
                  className="w-full rounded-2xl border border-amber-500/20 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-amber-200/40 focus:border-amber-500/50"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />

                {emailMode === "code" ? (
                  <>
                    <button className={BTN_PRI} onClick={sendEmailCode} disabled={busy || !email.trim()}>
                      {busy ? "Отправляю…" : (emailSent ? "Отправить ещё раз" : "Отправить код")}
                    </button>

                    <div className={`rounded-2xl ${SOFT} p-3`}>
                      <div className="text-xs text-amber-200/70">Введи код из письма (без переходов по ссылкам).</div>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="w-full rounded-2xl border border-amber-500/20 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-amber-200/40 focus:border-amber-500/50"
                          placeholder="Код"
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value)}
                          inputMode="numeric"
                        />
                        <button className={BTN} onClick={verifyEmailCode} disabled={busy || !email.trim() || !emailCode.trim()}>
                          Войти
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-amber-200/60">
                      Этот вариант бесплатнее и спокойнее, чем SMS. (Твоя бухгалтерия скажет “спасибо”.)
                    </div>
                  </>
                ) : (
                  <>
                    <button className={BTN_PRI} onClick={sendMagicLink} disabled={busy || !email.trim()}>
                      {busy ? "Отправляю…" : (emailSent ? "Отправить ещё раз" : "Отправить ссылку")}
                    </button>
                    <div className="mt-2 text-[11px] text-amber-200/60">
                      Откроешь письмо → нажмёшь ссылку → попадёшь на <span className="text-amber-200">/auth/callback</span> и войдёшь.
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <div className={`rounded-2xl ${SOFT} p-3`}>
                <div className="text-xs text-amber-200/70">
                  SMS OTP — рабочая опция, но это платная дорожка. Лучше email-код, если есть выбор.
                </div>
              </div>

              <input
                className="w-full rounded-2xl border border-amber-500/20 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-amber-200/40 focus:border-amber-500/50"
                placeholder="+31612345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />

              {!smsSent ? (
                <button className={BTN_PRI} onClick={sendSms} disabled={busy || !phone.trim()}>
                  {busy ? "Отправляю…" : "Отправить SMS-код"}
                </button>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      className="w-full rounded-2xl border border-amber-500/20 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-amber-200/40 focus:border-amber-500/50"
                      placeholder="Код из SMS"
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value)}
                      inputMode="numeric"
                    />
                    <button className={BTN} onClick={verifySms} disabled={busy || !smsCode.trim()}>
                      Войти
                    </button>
                  </div>
                  <button className={BTN} onClick={sendSms} disabled={busy}>
                    Отправить ещё раз
                  </button>
                </>
              )}
            </div>
          )}

          <div className="mt-6 text-center text-[11px] text-amber-200/55">
            Чисто. Чётко. По времени. <span className="opacity-80">© 2026</span>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = me?.profile?.role === "admin";
  const isWorker = me?.profile?.role === "worker";
  const active = me?.profile?.active === true;

  return (
    <div className={`min-h-screen ${BG} text-amber-100 p-4 sm:p-6`}>
      <div className="mx-auto max-w-6xl">
        <div className={`rounded-3xl ${CARD} p-5 sm:p-6`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <img src="/tanija-logo.png" alt="Tanija" className="h-10 w-10 rounded-2xl border border-amber-500/20" />
              <div>
                <div className="text-lg sm:text-xl font-semibold tracking-wide">Cleaning Timeclock</div>
                <div className="mt-1 text-xs text-amber-200/70">
                  {me.profile?.full_name || "—"} • {me.user?.email || me.profile?.email || "—"} • {me.profile?.role || "worker"} •{" "}
                  {active ? "доступ активен" : "ожидает активации"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {isAdmin ? (
                <a className={BTN} href="/admin">
                  Админка
                </a>
              ) : null}

              <a className={BTN} href="/me/profile">
                Профиль
              </a>

              <button className={BTN} onClick={refreshClick} disabled={busy}>
                {busy ? "Обновляю…" : "Обновить"}
              </button>

              <button className={BTN} onClick={doLogout} disabled={busy}>
                Выйти
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}

          {isWorker ? (
            <div className="mt-6 grid gap-4">
              {!active ? (
                <div className={`rounded-2xl ${SOFT} p-4`}>
                  <div className="text-sm font-semibold">Ожидание активации</div>
                  <div className="mt-2 text-sm text-amber-200/70">
                    Заполни профиль и отправь на активацию:{" "}
                    <a className="underline decoration-amber-500/40 hover:decoration-amber-500/80" href="/me/profile">
                      /me/profile
                    </a>
                  </div>
                </div>
              ) : null}

              {/* Photos card */}
              <div className={`rounded-2xl ${SOFT} p-4`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-semibold">Фото (до 5)</div>
                  <div className="text-xs text-amber-200/60">{photos.length}/5</div>
                </div>

                <div className="mt-3">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="block w-full text-sm"
                    disabled={busy || photos.length >= 5}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadPhoto(f);
                    }}
                  />
                </div>

                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {photos.map((p) => {
                    const isAvatar = avatarPath && p.path === avatarPath;
                    return (
                      <div
                        key={p.path}
                        className="min-w-[150px] max-w-[150px] rounded-2xl border border-amber-500/15 bg-black/20 overflow-hidden"
                      >
                        <div className="aspect-square bg-black/30 flex items-center justify-center">
                          {p.url ? <img src={p.url} className="h-full w-full object-cover" /> : <div className="text-xs opacity-60">—</div>}
                        </div>
                        <div className="p-2 space-y-2">
                          <button className={BTN_PRI} onClick={() => makeAvatar(p.path)} disabled={busy}>
                            {isAvatar ? "Аватар" : "Сделать аватаром"}
                          </button>
                          <button className={BTN} onClick={() => delPhoto(p.path)} disabled={busy}>
                            Удалить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {photos.length === 0 ? <div className="mt-3 text-xs text-amber-200/60">Загрузи фото и выбери аватар.</div> : null}
              </div>

              {/* Jobs */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <JobsSection title="Запланировано" items={planned} meUserId={me.user.id} busy={busy} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
                <JobsSection title="В процессе" items={inprog} meUserId={me.user.id} busy={busy} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
                <JobsSection title="Завершено" items={done} meUserId={me.user.id} busy={busy} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
              </div>

              <div className="text-[11px] text-amber-200/55 text-center pt-2">
                Чисто. Чётко. По времени. <span className="opacity-80">© 2026</span>
              </div>
            </div>
          ) : (
            <div className={`mt-6 rounded-2xl ${SOFT} p-4`}>
              <div className="text-sm font-semibold">Роль: admin</div>
              <div className="mt-2 text-sm text-amber-200/70">
                Используй админку для объектов/смен/заявок. С рабочего телефона лучше открывать <span className="text-amber-200">/admin/approvals</span> отдельно.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function JobsSection({
    title,
    items,
    meUserId,
    busy,
    onAccept,
    onStart,
    onStop,
  }: {
    title: string;
    items: JobItem[];
    meUserId: string;
    busy: boolean;
    onAccept: (jobId: string) => void;
    onStart: (jobId: string) => void;
    onStop: (jobId: string) => void;
  }) {
    return (
      <div className={`rounded-2xl ${SOFT} p-4`}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-amber-200/60">{items.length}</div>
        </div>

        <div className="mt-3 space-y-3">
          {items.length === 0 ? (
            <div className="text-sm text-amber-200/60">—</div>
          ) : (
            items.map((j) => {
              const from = timeHHMM(j.scheduled_time);
              const to = timeHHMM(j.scheduled_end_time);
              const planM = plannedMinutes(from, to);
              const factM = Math.max(0, Math.floor(Number(j.actual_minutes || 0) || 0));
              const showFact = j.status === "done" && factM > 0;

              const assignedToMe = j.worker_id === meUserId;
              const canAccept = j.can_accept === true;
              const canStart = j.status === "planned" && assignedToMe;
              const canStop = j.status === "in_progress" && assignedToMe;

              return (
                <div key={j.id} className="rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{j.site_name || "Объект"}</div>
                      <div className="mt-1 text-xs text-amber-200/70">
                        {fmtDate(j.job_date)} • {from && to ? `${from}–${to}` : from || "—"}{" "}
                        {planM != null ? `• план ${fmtDur(planM)}` : ""} • {statusRu(String(j.status || ""))}
                      </div>

                      {j.started_at ? <div className="mt-1 text-[11px] text-amber-200/60">Старт: {fmtDT(j.started_at)}</div> : null}
                      {j.stopped_at ? <div className="mt-1 text-[11px] text-amber-200/60">Стоп: {fmtDT(j.stopped_at)}</div> : null}
                      {showFact ? <div className="mt-1 text-[11px] text-amber-200/70">Факт: {fmtDur(factM)}</div> : null}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[112px]">
                      {canAccept ? (
                        <button className={BTN_PRI} disabled={busy} onClick={() => onAccept(j.id)}>
                          Принять
                        </button>
                      ) : null}

                      {canStart ? (
                        <button className={BTN_PRI} disabled={busy} onClick={() => onStart(j.id)}>
                          START
                        </button>
                      ) : null}

                      {canStop ? (
                        <button
                          className="rounded-2xl border border-red-500/30 px-4 py-2 text-sm hover:bg-red-500/10 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => onStop(j.id)}
                        >
                          STOP
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {!canAccept && j.status === "planned" && !assignedToMe ? (
                    <div className="mt-2 text-[11px] text-amber-200/55">Ещё не назначено на тебя.</div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }
}
