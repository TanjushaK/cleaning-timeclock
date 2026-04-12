"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HomeLanguageSwitcher from "@/components/home-language-switcher";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import { useHomeI18n } from "@/lib/i18n/home-provider";
import { formatDateShort, formatWallTime } from "@/lib/locale-format";
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
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    email_confirmed_at?: string | null;
    temp_password?: boolean | null;
  };
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

function bearerHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const t = typeof window !== "undefined" ? window.localStorage.getItem("ct_access_token") : null;
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export default function AppPage() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const [loginMode, setLoginMode] = useState<"phone" | "email">("email");
  
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [recoverNewPassword, setRecoverNewPassword] = useState("");
  const [forceNewPassword, setForceNewPassword] = useState("");
  const [forceNewPassword2, setForceNewPassword2] = useState("");

  const [me, setMe] = useState<MeProfileResponse | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
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

  const { t, locale } = useHomeI18n();

  const fmtDate = useCallback((iso?: string | null) => formatDateShort(locale, iso), [locale]);

  const fmtWall = useCallback((raw?: string | null) => formatWallTime(locale, raw), [locale]);

  const fmtDurLoc = useCallback(
    (mins: number) => {
      const m = Math.max(0, Math.floor(mins || 0));
      const h = Math.floor(m / 60);
      const r = m % 60;
      const mm = pad2(r);
      if (h <= 0) return t("duration.minutesOnly", { n: r });
      return t("duration.hoursMinutes", { h, mm });
    },
    [t]
  );

  const jobStatusLabel = useCallback(
    (s: string) => {
      if (s === "planned") return t("job.statusPlanned");
      if (s === "in_progress") return t("job.statusInProgress");
      if (s === "done") return t("job.statusDone");
      return s || t("job.lineDash");
    },
    [t]
  );

  const getGps = useCallback((): Promise<Gps> => {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") return reject(new Error(t("gps.unavailableShort")));
      if (!("geolocation" in navigator)) return reject(new Error(t("gps.unavailableShort")));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => {
          const msg =
            err.code === err.PERMISSION_DENIED
              ? t("gps.denied")
              : err.code === err.POSITION_UNAVAILABLE
                ? t("gps.unavailable")
                : t("gps.timeout");
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [t]);

  const loadPhotos = useCallback(async () => {
    const data = await authFetchJson<MyPhotosResponse>("/api/me/photos", {
      headers: bearerHeaders(),
      cache: "no-store",
    });
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

    // Photos (avatar/gallery) are loaded for inactive onboarding and active workers.
    await loadPhotos().catch(() => {});

    if (profile?.profile?.active !== true) {
      setJobs([]);
      return;
    }

    const jobsRes = await authFetchJson<MeJobsResponse>("/api/me/jobs", { cache: "no-store" });
    setJobs(jobsRes.items || []);
  }, [loadPhotos]);

  useEffect(() => {
    (async () => {
      try {
        const accessToken = getAccessToken();
        setToken(accessToken);
        if (accessToken) await loadAll();
      } catch (e: unknown) {
        const msg = String((e as Error)?.message || e || t("error.generic"));
        if (msg.includes("401") || /token|unauthorized|invalid or expired/i.test(msg)) {
          clearAuthTokens();
          try {
            await supabase.auth.signOut();
          } catch {}
          setToken(null);
          setMe(null);
          setJobs([]);
        } else {
          setError(clientWorkerErrorMessage(t, e));
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [loadAll, t]);

  const doPhoneSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const ph = phone.trim();
      if (!ph) throw new Error(t("errors.phoneRequired"));
      if (!ph.startsWith("+")) throw new Error(t("errors.phoneE164"));

      const { error } = await supabase.auth.signInWithOtp({
        phone: ph,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;

      setOtpSent(true);
      setOtp("");
      setNotice(t("notify.smsSent"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }, [phone, t]);

  const doPhoneVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const ph = phone.trim();
      const code = otp.trim();
      const newPw = recoverNewPassword.trim();

      if (!ph) throw new Error(t("errors.phoneRequired"));
      if (!code) throw new Error(t("errors.smsCodeRequired"));
      if (newPw.length < 8) throw new Error(t("errors.passwordMin8"));

      const { data, error } = await supabase.auth.verifyOtp({ phone: ph, token: code, type: "sms" });
      if (error) throw error;

      const sess = data?.session;
      if (sess?.access_token && sess?.refresh_token) {
        await supabase.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token });
      }

      const { error: updErr } = await supabase.auth.updateUser({ password: newPw, data: { temp_password: false } });
      if (updErr) throw updErr;

      await supabase.auth.signOut();

      setNotice(t("notify.passwordUpdatedLogin"));
      setLoginMode("email");
      setOtpSent(false);
      setOtp("");
      setRecoverNewPassword("");
    } catch (e: any) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }, [phone, otp, recoverNewPassword, t]);

  const doEmailPasswordLogin = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      const pw = emailPassword;
      if (!em) throw new Error(t("errors.emailOrPhoneRequired"));
      if (!em.includes("@") && !em.startsWith("+")) throw new Error(t("errors.phoneE164"));
      if (!pw || !pw.trim()) throw new Error(t("errors.passwordRequired"));

      const payload = await authFetchJson<{
        access_token?: string;
        refresh_token?: string | null;
      }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: em, password: pw }),
      });
      if (!payload?.access_token) throw new Error(t("errors.token"));

      setAuthTokens(String(payload.access_token), payload.refresh_token ? String(payload.refresh_token) : null);
      const tok = getAccessToken();
      setToken(tok);
      await loadAll();
      setNotice(t("notify.loggedIn"));

      // If user is admin, send them straight to /admin
      try {
        const prof = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
        if (prof?.profile?.role === "admin") window.location.href = "/admin";
      } catch {}
    } catch (e: any) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }, [email, emailPassword, loadAll, t]);

  const doLogout = useCallback(() => {
    clearAuthTokens();
    try {
      supabase.auth.signOut();
    } catch {}
    setToken(null);
    setMe(null);
    setJobs([]);
    setNotice(t("notify.loggedOut"));
  }, [t]);

  const saveProfile = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const name = fullName.trim();
      if (!name) throw new Error(t("errors.nameRequired"));
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
      setNotice(t("notify.saved"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }, [fullName, profileEmail, loadAll, t]);

  const uploadPhoto = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        if (photos.length >= 5) throw new Error(t("errors.photoLimit"));
        const fd = new FormData();
        fd.append("file", file);
        await authFetchJson("/api/me/photos", { method: "POST", headers: bearerHeaders(), body: fd });
        await loadPhotos();
        setNotice(t("notify.photoUploaded"));
      } catch (e: any) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [loadPhotos, photos.length, t]
  );

  const delPhoto = useCallback(
    async (path: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await authFetchJson("/api/me/photos", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...bearerHeaders() },
          body: JSON.stringify({ path }),
        });
        await loadPhotos();
        setNotice(t("notify.deleted"));
      } catch (e: any) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [loadPhotos, t]
  );

  const makeAvatar = useCallback(
    async (path: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        await authFetchJson("/api/me/photos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...bearerHeaders() },
          body: JSON.stringify({ action: "make_primary", path }),
        });
        await loadPhotos();
        await loadAll();
        setNotice(t("notify.avatarSet"));
      } catch (e: any) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [loadPhotos, loadAll, t]
  );

  const submitForApproval = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await authFetchJson("/api/me/profile/submit", { method: "POST" });
      await loadAll();
      setNotice(t("notify.submittedActivation"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }, [loadAll, t]);

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
        setNotice(t("notify.shiftAccepted"));
        await loadAll();
      } catch (e: any) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [loadAll, t]
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
          body: JSON.stringify({ jobId, ...gps }),
        });
        setNotice(t("notify.startRecorded"));
        await loadAll();
      } catch (e: any) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [getGps, loadAll, t]
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
          body: JSON.stringify({ jobId, ...gps }),
        });
        setNotice(t("notify.stopRecorded"));
        await loadAll();
      } catch (e: any) {
        setError(clientWorkerErrorMessage(t, e));
      } finally {
        setBusy(false);
      }
    },
    [getGps, loadAll, t]
  );

  const planned = useMemo(() => jobs.filter((j) => j.status === "planned"), [jobs]);
  const inprog = useMemo(() => jobs.filter((j) => j.status === "in_progress"), [jobs]);
  const done = useMemo(() => jobs.filter((j) => j.status === "done"), [jobs]);

  if (booting) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center">
        <div className="text-sm opacity-80">{t("boot.loading")}</div>
      </div>
    );
  }

  // LOGIN
  if (!authed || !me) {
    return (
      <div className="relative min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-4 sm:p-6">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <HomeLanguageSwitcher />
        </div>
        <div className="relative w-full max-w-md">
          <div className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-r from-amber-500/55 via-amber-500/18 to-amber-500/55 blur-2xl" />
          <div className="relative w-full rounded-2xl border border-amber-500/40 bg-zinc-950/70 p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_0_95px_rgba(245,158,11,0.14),0_25px_90px_rgba(0,0,0,0.75)]">
            <div className="text-xl font-semibold">{t("active.title")}</div>
            <div className="text-sm opacity-80 mt-1">{t("login.brandSubtitle")}</div>

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
                {t("login.tabRecovery")}
              </button>
              <button
                className={`flex-1 rounded-xl px-3 py-2 text-sm border ${
                  loginMode === "email" ? "bg-amber-500 text-zinc-950 border-amber-500" : "border-amber-500/30 hover:bg-amber-500/10"
                }`}
                onClick={() => {
                  setLoginMode("email");

                  setError(null);
                  setNotice(null);
                }}
                disabled={busy}
              >
                {t("login.tabPassword")}
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            ) : null}
            {notice ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>
            ) : null}

            {loginMode === "phone" ? (
              <div className="mt-4 space-y-3">
                <input
                  className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                  placeholder={t("login.phonePlaceholder")}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                />
                <div className="text-xs opacity-70">{t("login.smsRecoveryHint")}</div>
                {!otpSent ? (
                  <button
                    className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                    onClick={doPhoneSend}
                    disabled={busy || !phone.trim()}
                  >
                    {busy ? t("login.sending") : t("login.sendCode")}
                  </button>
                ) : (
                  <>
                    <input
                      className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                      placeholder={t("login.smsCodePlaceholder")}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      inputMode="numeric"
                    />
                    <input
                      className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                      placeholder={t("login.newPasswordMinPlaceholder")}
                      type="password"
                      value={recoverNewPassword}
                      onChange={(e) => setRecoverNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                      onClick={doPhoneVerify}
                      disabled={busy || !otp.trim() || recoverNewPassword.trim().length < 8}
                    >
                      {busy ? t("login.verifying") : t("login.setPassword")}
                    </button>
                    <button
                      className="w-full rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
                      onClick={doPhoneSend}
                      disabled={busy}
                    >
                      {t("login.resendSms")}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">

                <input
                  className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                  placeholder={t("login.emailOrPhonePlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />

                <input
                  className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                  placeholder={t("login.passwordPlaceholder")}
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                />

                <button
                  className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                  onClick={doEmailPasswordLogin}
                  disabled={busy || !email.trim() || !emailPassword.trim()}
                >
                  {busy ? t("login.signingIn") : t("login.signIn")}
                </button>

                <div className="flex items-center justify-between text-xs opacity-80">
                  <a className="underline hover:opacity-100" href="/forgot-password">
                    {t("login.forgotPasswordEmail")}
                  </a>
                  <button
                    type="button"
                    className="underline hover:opacity-100"
                    onClick={() => {
                      setLoginMode("phone");
                      setOtpSent(false);
                      setOtp("");
                      setError(null);
                      setNotice(null);
                    }}
                    disabled={busy}
                  >
                    {t("login.viaSms")}
                  </button>
                </div>

                <div className="text-xs opacity-70">{t("login.mainLoginHelp")}</div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-baseline justify-center gap-x-1 gap-y-1 text-xs opacity-70">
              <span>{t("login.footerAdminLabel")}</span>
              <a className="underline" href="/admin">
                /admin
              </a>
              <span>•</span>
              <span>{t("login.footerRequestsLabel")}</span>
              <a className="underline" href="/admin/approvals">
                /admin/approvals
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // FORCE CHANGE PASSWORD (temp password)
  if (authed && me?.user?.temp_password) {
    return (
      <div className="relative min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-4 sm:p-6">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <HomeLanguageSwitcher />
        </div>
        <div className="relative w-full max-w-md">
          <div className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-r from-amber-500/55 via-amber-500/18 to-amber-500/55 blur-2xl" />
          <div className="relative w-full rounded-2xl border border-amber-500/40 bg-zinc-950/70 p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.18),0_0_95px_rgba(245,158,11,0.14),0_25px_90px_rgba(0,0,0,0.75)]">
            <div className="text-xl font-semibold">{t("tempPassword.title")}</div>
            <div className="text-sm opacity-80 mt-1">{t("tempPassword.subtitle")}</div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            ) : null}
            {notice ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>
            ) : null}

            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder={t("tempPassword.newPlaceholder")}
                type="password"
                value={forceNewPassword}
                onChange={(e) => setForceNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <input
                className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder={t("tempPassword.repeatPlaceholder")}
                type="password"
                value={forceNewPassword2}
                onChange={(e) => setForceNewPassword2(e.target.value)}
                autoComplete="new-password"
              />
              <button
                className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                disabled={busy || forceNewPassword.trim().length < 8 || forceNewPassword !== forceNewPassword2}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  setNotice(null);
                  try {
                    const pw1 = forceNewPassword.trim();
                    const pw2 = forceNewPassword2.trim();
                    if (pw1.length < 8) throw new Error(t("errors.passwordMin8Temp"));
                    if (pw1 !== pw2) throw new Error(t("errors.passwordMismatch"));
                    const { error: uErr } = await supabase.auth.updateUser({ password: pw1, data: { temp_password: false } });
                    if (uErr) throw uErr;
                    setForceNewPassword("");
                    setForceNewPassword2("");
                    await loadAll();
                    setNotice(t("notify.profileUpdated"));
                  } catch (e: any) {
                    setError(clientWorkerErrorMessage(t, e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? t("tempPassword.saving") : t("tempPassword.change")}
              </button>

              <button className="w-full rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout} disabled={busy}>
                {t("tempPassword.logout")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // INACTIVE / ONBOARDING
  if (me.profile?.active !== true) {
    const submitted = !!me.profile?.onboarding_submitted_at;
    const emailState = me.user.email
      ? me.user.email_confirmed_at
        ? t("onboarding.emailYes")
        : t("onboarding.emailNo")
      : t("onboarding.emailDash");

    return (
      <div className="relative min-h-screen bg-zinc-950 text-amber-100 p-4 sm:p-6">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <HomeLanguageSwitcher />
        </div>
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-2xl font-semibold">{t("onboarding.title")}</div>
              <div className="text-sm opacity-80 mt-1">{t("onboarding.subtitle")}</div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin/approvals">
                {t("onboarding.adminApprovals")}
              </a>
              <button className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" onClick={doLogout}>
                {t("onboarding.logout")}
              </button>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
          {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl">
            <div className="text-lg font-semibold">{t("onboarding.dataTitle")}</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder={t("onboarding.namePlaceholder")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                className="rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder={t("onboarding.emailOptionalPlaceholder")}
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
              />
            </div>

            <div className="mt-3 text-xs opacity-70">
              {t("onboarding.phoneLine", {
                phone: me.user.phone || me.profile.phone || t("onboarding.emailDash"),
                emailState,
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                disabled={busy}
                onClick={saveProfile}
              >
                {busy ? t("onboarding.saving") : t("onboarding.save")}
              </button>
              <button
                className="rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  setNotice(null);
                  try {
                    await loadAll();
                    setNotice(t("notify.refreshed"));
                  } catch (e: any) {
                    setError(clientWorkerErrorMessage(t, e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? t("onboarding.refreshBusy") : t("onboarding.refresh")}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold">{t("onboarding.photosTitle")}</div>
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
                disabled={busy || photos.length >= 5}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
              {photos.map((p) => {
                const isAvatar = avatarPath && p.path === avatarPath;
                return (
                  <div key={p.path} className="rounded-xl border border-amber-500/15 bg-zinc-900/30 overflow-hidden">
                    <div className="aspect-square bg-black/30 flex items-center justify-center">
                      {p.url ? <img src={p.url} className="h-full w-full object-cover" /> : <div className="text-xs opacity-60">{t("onboarding.emailDash")}</div>}
                    </div>
                    <div className="p-2 space-y-2">
                      <button
                        className="w-full rounded-lg bg-amber-500 text-zinc-950 px-2 py-1 text-xs font-semibold hover:bg-amber-400 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => makeAvatar(p.path)}
                      >
                        {isAvatar ? t("onboarding.avatar") : t("onboarding.makeAvatar")}
                      </button>
                      <button
                        className="w-full rounded-lg border border-amber-500/30 px-2 py-1 text-xs hover:bg-amber-500/10 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => delPhoto(p.path)}
                      >
                        {t("onboarding.delete")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {photos.length === 0 ? <div className="mt-3 text-sm opacity-70">{t("onboarding.photosEmpty")}</div> : null}
          </div>

          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-5 shadow-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold">{t("onboarding.activationTitle")}</div>
                <div className="text-sm opacity-80 mt-1">
                  {submitted ? t("onboarding.activationSubmitted") : t("onboarding.activationDraft")}
                </div>
              </div>

              <button
                className="rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                disabled={busy}
                onClick={submitForApproval}
              >
                {busy ? t("onboarding.submitting") : t("onboarding.submitActivation")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE WORKER SCREEN
  return (
    <div className="relative min-h-screen bg-zinc-950 text-amber-100 p-4 sm:p-6">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <HomeLanguageSwitcher />
      </div>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("active.title")}</div>
            <div className="text-sm opacity-80 mt-1">
              {me.profile?.full_name || t("job.lineDash")} • {me.user?.email || me.profile?.email || t("job.lineDash")} •{" "}
              {me.profile?.role || t("active.roleWorker")}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {me.profile?.role === "admin" ? (
              <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
                {t("active.admin")}
              </a>
            ) : null}

            <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/me/profile">
              {t("active.profile")}
            </a>

            <button
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                setError(null);
                setNotice(null);
                try {
                  await loadAll();
                  setNotice(t("notify.refreshed"));
                } catch (e: any) {
                  setError(clientWorkerErrorMessage(t, e));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? t("active.refreshing") : t("active.refresh")}
            </button>

            <button
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
              onClick={doLogout}
              disabled={busy}
            >
              {t("active.logout")}
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-4 shadow-xl">
          <div className="flex items-baseline justify-between">
            <div className="text-lg font-semibold">{t("active.photosTitle")}</div>
            <div className="text-sm opacity-70">{photos.length}/5</div>
          </div>

          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(f);
              }}
              disabled={busy || photos.length >= 5}
            />
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {photos.map((p) => {
              const isAvatar = avatarPath && p.path === avatarPath;
              return (
                <div key={p.path} className="min-w-[150px] max-w-[150px] rounded-xl border border-amber-500/15 bg-zinc-900/30 overflow-hidden">
                  <div className="aspect-square bg-black/30 flex items-center justify-center">
                    {p.url ? <img src={p.url} className="h-full w-full object-cover" /> : <div className="text-xs opacity-60">{t("onboarding.emailDash")}</div>}
                  </div>
                  <div className="p-2 space-y-2">
                    <button
                      className="w-full rounded-lg bg-amber-500 text-zinc-950 px-2 py-1 text-xs font-semibold hover:bg-amber-400 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => makeAvatar(p.path)}
                    >
                      {isAvatar ? t("onboarding.avatar") : t("onboarding.makeAvatar")}
                    </button>
                    <button
                      className="w-full rounded-lg border border-amber-500/30 px-2 py-1 text-xs hover:bg-amber-500/10 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => delPhoto(p.path)}
                    >
                      {t("onboarding.delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {photos.length === 0 ? <div className="mt-3 text-sm opacity-70">{t("active.photosEmpty")}</div> : null}
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title={t("job.planned")} items={planned} busy={busy} meUserId={me.user.id} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
          <Section title={t("job.inprogress")} items={inprog} busy={busy} meUserId={me.user.id} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
          <Section title={t("job.done")} items={done} busy={busy} meUserId={me.user.id} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
        </div>

        <div className="mt-6 text-xs opacity-70">{t("active.gpsRule")}</div>
      </div>
    </div>
  );

  function Section({
    title,
    items,
    busy,
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
            <div className="text-sm opacity-70">{t("job.lineDash")}</div>
          ) : (
            items.map((j) => {
              const from = timeHHMM(j.scheduled_time);
              const to = timeHHMM(j.scheduled_end_time ?? null);
              const planM = plannedMinutes(from, to);

              const factM = Math.max(0, Math.floor(Number(j.actual_minutes || 0) || 0));
              const showFact = j.status === "done" && factM > 0;

              const dash = t("job.lineDash");
              const wFrom = fmtWall(j.scheduled_time);
              const wTo = fmtWall(j.scheduled_end_time ?? null);
              const timeSegment = from && to ? `${wFrom}–${wTo}` : from ? wFrom : dash;
              const line =
                j.status === "done"
                  ? `${fmtDate(j.job_date)} • ${timeSegment} • ${
                      showFact
                        ? `${t("job.factPrefix")} ${fmtDurLoc(factM)}`
                        : planM != null
                          ? `${fmtDurLoc(planM)}`
                          : dash
                    } • ${jobStatusLabel(String(j.status || ""))}`
                  : `${fmtDate(j.job_date)} • ${timeSegment}${
                      planM != null ? ` • ${fmtDurLoc(planM)}` : ""
                    } • ${jobStatusLabel(String(j.status || ""))}`;

              return (
                <div key={j.id} className="rounded-xl border border-amber-500/15 bg-zinc-900/30 p-3">
                  <div className="text-sm font-semibold">{j.site_name || t("job.siteFallback")}</div>
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





