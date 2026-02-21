"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authFetchJson, clearAuthTokens, getAccessToken, setAuthTokens } from "@/lib/auth-fetch";

type Profile = {
  id: string;
  role?: string | null;
  active?: boolean | null;
  full_name?: string | null;
  phone?: string | null;
  notes?: string | null;
};

type MeProfileResponse = {
  user: { id: string; email?: string | null };
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
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
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

export default function AppPage() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [me, setMe] = useState<MeProfileResponse | null>(null);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const authed = !!token;

  const loadAll = useCallback(async () => {
    setError(null);
    setNotice(null);
    const profile = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
    const jobsRes = await authFetchJson<MeJobsResponse>("/api/me/jobs", { cache: "no-store" });
    setMe(profile);
    setJobs(jobsRes.items || []);
  }, []);

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

  const doLoginEmail = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      setAuthTokens(payload.access_token, payload.refresh_token || null);
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
  }, [email, password, loadAll]);

  const doPhoneSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = phone.trim();
      if (!p || !p.startsWith("+")) throw new Error("Телефон нужен в формате E.164, например +31612345678");

      const { error: e1 } = await supabase.auth.signInWithOtp({
        phone: p,
        options: { channel: "sms" },
      });

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

      const { data, error: e2 } = await supabase.auth.verifyOtp({
        phone: p,
        token: code,
        type: "sms",
      });

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

  const doLogout = useCallback(() => {
    clearAuthTokens();
    try { supabase.auth.signOut(); } catch {}
    setToken(null);
    setMe(null);
    setJobs([]);
    setNotice("Вы вышли.");
  }, []);

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

  if (!authed || !me) {
    return (
      <div className="min-h-screen bg-zinc-950 text-amber-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
          <div className="text-xl font-semibold">Tanija • Worker</div>
          <div className="text-sm opacity-80 mt-1">Вход</div>

          <div className="mt-4 flex gap-2">
            <button
              className={`flex-1 rounded-xl px-3 py-2 text-sm border ${
                loginMode === "email"
                  ? "bg-amber-500 text-zinc-950 border-amber-500"
                  : "border-amber-500/30 hover:bg-amber-500/10"
              }`}
              onClick={() => {
                setLoginMode("email");
                setOtpSent(false);
                setOtp("");
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Email
            </button>
            <button
              className={`flex-1 rounded-xl px-3 py-2 text-sm border ${
                loginMode === "phone"
                  ? "bg-amber-500 text-zinc-950 border-amber-500"
                  : "border-amber-500/30 hover:bg-amber-500/10"
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
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {notice}
            </div>
          ) : null}

          {loginMode === "email" ? (
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <input
                className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder="Пароль"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                onClick={doLoginEmail}
                disabled={busy || !email.trim() || !password.trim()}
              >
                {busy ? "Вхожу…" : "Войти"}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                placeholder="Телефон, например +31612345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
              {!otpSent ? (
                <button
                  className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                  onClick={doPhoneSend}
                  disabled={busy || !phone.trim()}
                >
                  {busy ? "Отправляю…" : "Отправить код"}
                </button>
              ) : (
                <>
                  <input
                    className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
                    placeholder="Код из SMS"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    inputMode="numeric"
                  />
                  <button
                    className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                    onClick={doPhoneVerify}
                    disabled={busy || !otp.trim()}
                  >
                    {busy ? "Проверяю…" : "Войти"}
                  </button>
                  <button
                    className="w-full rounded-xl border border-amber-500/30 px-4 py-2 text-sm hover:bg-amber-500/10 disabled:opacity-60"
                    onClick={doPhoneSend}
                    disabled={busy}
                  >
                    Отправить ещё раз
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-amber-100 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">Tanija • Worker</div>
            <div className="text-sm opacity-80 mt-1">
              {me.profile?.full_name || "—"} • {me.user?.email || "—"} • {me.profile?.role || "worker"}
            </div>
          </div>

          <div className="flex gap-2">
            {me.profile?.role === "admin" ? (
              <a className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10" href="/admin">
                Админка
              </a>
            ) : null}
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

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section title="Запланировано" items={planned} busy={busy} meUserId={me.user.id} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
          <Section title="В процессе" items={inprog} busy={busy} meUserId={me.user.id} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
          <Section title="Завершено" items={done} busy={busy} meUserId={me.user.id} onAccept={acceptJob} onStart={startJob} onStop={stopJob} />
        </div>

        <div className="mt-6 text-xs opacity-70">Правило: старт/стоп только рядом с объектом, GPS точность ≤ 80м.</div>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  busy,
  meUserId,
  onAccept,
  onStart,
  onStop,
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
            const canAccept = !!j.can_accept || (!j.worker_id && j.status === "planned");
            const isMine = !j.worker_id || j.worker_id === meUserId;

            const showAccept = j.status === "planned" && canAccept;
            const showStart = j.status === "planned" && !showAccept && isMine;
            const showStop = j.status === "in_progress" && isMine;

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

                {showAccept ? (
                  <button className="mt-3 w-full rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" disabled={busy} onClick={() => onAccept(j.id)}>
                    Принять смену
                  </button>
                ) : null}

                {showStart ? (
                  <button className="mt-3 w-full rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" disabled={busy} onClick={() => onStart(j.id)}>
                    Старт
                  </button>
                ) : null}

                {showStop ? (
                  <button className="mt-3 w-full rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60" disabled={busy} onClick={() => onStop(j.id)}>
                    Стоп
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
