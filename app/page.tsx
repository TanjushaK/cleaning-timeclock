"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  authFetchJson,
  clearAuthTokens,
  getAccessToken,
  setAuthTokens,
} from "@/lib/auth-fetch";

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
  site_id: string | null;
  site_name: string | null;
  worker_id: string | null;
  started_at: string | null;
  stopped_at: string | null;
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
  if (!t) return "—";
  const x = String(t);
  return x.length >= 5 ? x.slice(0, 5) : x;
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

  const doLogin = useCallback(async () => {
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

  const doLogout = useCallback(() => {
    clearAuthTokens();
    setToken(null);
    setMe(null);
    setJobs([]);
    setNotice("Вы вышли.");
  }, []);

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
        setNotice("Смена принята.");
        await loadAll();
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
          body: JSON.stringify({ jobId, ...gps }),
        });
        setNotice("Старт зафиксирован.");
        await loadAll();
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
          body: JSON.stringify({ jobId, ...gps }),
        });
        setNotice("Стоп зафиксирован.");
        await loadAll();
      } catch (e: any) {
        setError(String(e?.message || e || "Ошибка стопа"));
      } finally {
        setBusy(false);
      }
    },
    [loadAll]
  );

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
          <div className="text-sm opacity-80 mt-1">Вход по email/паролю</div>

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

          <div className="mt-4 space-y-3">
            <input
              id="email"
              name="email"
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <input
              id="password"
              name="password"
              className="w-full rounded-xl bg-zinc-900/60 border border-amber-500/20 px-3 py-2 text-sm outline-none focus:border-amber-400/50"
              placeholder="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              className="w-full rounded-xl bg-amber-500 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
              onClick={doLogin}
              disabled={busy || !email.trim() || !password.trim()}
            >
              {busy ? "Вхожу…" : "Войти"}
            </button>
          </div>
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
              <a
                className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
                href="/admin"
              >
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
            <button
              className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm hover:bg-amber-500/10"
              onClick={doLogout}
            >
              Выйти
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {notice}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section
            title="Запланировано"
            subtitle={`${planned.length}`}
            items={planned}
            busy={busy}
            meUserId={me.user.id}
            onAccept={acceptJob}
            onStart={startJob}
            onStop={stopJob}
          />
          <Section
            title="В процессе"
            subtitle={`${inprog.length}`}
            items={inprog}
            busy={busy}
            meUserId={me.user.id}
            onAccept={acceptJob}
            onStart={startJob}
            onStop={stopJob}
          />
          <Section
            title="Завершено"
            subtitle={`${done.length}`}
            items={done}
            busy={busy}
            meUserId={me.user.id}
            onAccept={acceptJob}
            onStart={startJob}
            onStop={stopJob}
          />
        </div>

        <div className="mt-6 text-xs opacity-70">
          Правило: старт/стоп только рядом с объектом, GPS точность ≤ 80м.
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  items,
  busy,
  meUserId,
  onAccept,
  onStart,
  onStop,
}: {
  title: string;
  subtitle: string;
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
        <div className="text-sm opacity-70">{subtitle}</div>
      </div>

      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <div className="text-sm opacity-70">—</div>
        ) : (
          items.map((j) => {
            const canAccept = !!j.can_accept || (!j.worker_id && j.status === "planned");
            const isMine = !j.worker_id || j.worker_id === meUserId ? true : false;

            const showAccept = j.status === "planned" && canAccept;
            const showStart = j.status === "planned" && !showAccept && isMine;
            const showStop = j.status === "in_progress" && isMine;

            return (
              <div key={j.id} className="rounded-xl border border-amber-500/15 bg-zinc-900/30 p-3">
                <div className="text-sm font-semibold">{j.site_name || "Объект"}</div>
                <div className="mt-1 text-xs opacity-80">
                  {fmtD(j.job_date)} • {timeHHMM(j.scheduled_time)} • {statusRu(j.status)}
                </div>

                {showAccept ? (
                  <button
                    className="mt-3 w-full rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => onAccept(j.id)}
                  >
                    Принять смену
                  </button>
                ) : null}

                {showStart ? (
                  <button
                    className="mt-3 w-full rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => onStart(j.id)}
                  >
                    Старт
                  </button>
                ) : null}

                {showStop ? (
                  <button
                    className="mt-3 w-full rounded-xl bg-amber-500 text-zinc-950 px-3 py-2 text-sm font-semibold hover:bg-amber-400 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => onStop(j.id)}
                  >
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
