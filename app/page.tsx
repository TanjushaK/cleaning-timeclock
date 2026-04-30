"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appAuth } from "@/lib/browser-auth";
import {
  biometricHardwareAvailable,
  clearBiometricStoredCredentials,
  enableBiometricUnlock,
  hasBiometricUnlockFlag,
  isNativeCapacitorApp,
  unlockSessionWithBiometrics,
} from "@/lib/biometric-unlock";
import { authFetch, authFetchJson, clearClientAuthState, getAccessToken, getRefreshToken, setAuthTokens } from "@/lib/auth-fetch";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import { FetchApiError } from "@/lib/fetch-api-error";
import { formatDateTimeShort, formatWallTime } from "@/lib/locale-format";
import AppWorkerShell from "@/app/_components/AppWorkerShell";
import { useI18n } from "@/components/I18nProvider";
import { OutboxEvent, outboxAdd, outboxCount as outboxCountDb, outboxList, outboxRemove, outboxUpdate } from "@/lib/offline/outbox";
import { openNavigation } from "@/lib/open-navigation";

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
    scheduled_end_time?: string | null;
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

type TeamResponse = {
  teams: Record<
    string,
    Array<{
      id: string;
      name: string;
    }>
  >;
};

type MyPhotosResponse = {
  photos: Array<{ path: string; url?: string | null }>;
  avatar_path?: string | null;
};

function hasValidSiteStartCoords(job: MeJobsResponse["jobs"][number] | null | undefined): boolean {
  if (!job) return false;
  if (job.site_lat == null || job.site_lng == null || job.site_radius == null) return false;
  const lat = Number(job.site_lat);
  const lng = Number(job.site_lng);
  const radius = Number(job.site_radius);
  return Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius) && radius > 0;
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatHMS(ms: number) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function appLocaleToBCP47(lang: string): string {
  const v = String(lang || "en").toLowerCase();
  if (v === "ru") return "ru-RU";
  if (v === "uk") return "uk-UA";
  if (v === "nl") return "nl-NL";
  return "en-US";
}

function parseJobDateSafe(input: string | null | undefined): Date | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const datePart = raw.slice(0, 10);
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeekMonday(d: Date): Date {
  const x = startOfLocalDay(d);
  const jsDay = x.getDay();
  const shift = (jsDay + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x;
}

function parseClockMinutes(input: string | null | undefined): number | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);

  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }

  return h * 60 + min;
}

function parseScheduledTimeWindow(
  scheduledTime: string | null | undefined,
  scheduledEndTime?: string | null
): { startMin: number | null; endMin: number | null } {
  const raw = String(scheduledTime || "").trim();
  if (!raw) return { startMin: null, endMin: null };

  const normalized = raw.replace(/[\u2013\u2014]/g, "-");
  const range = normalized.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?))?\s*$/);
  if (!range) return { startMin: null, endMin: null };

  const startMin = parseClockMinutes(range[1]);
  const endMin = parseClockMinutes(range[2] || scheduledEndTime);

  return { startMin, endMin };
}

function calcDurationMin(startMin: number | null, endMin: number | null): number | null {
  if (startMin == null || endMin == null) return null;
  const diff = endMin - startMin;
  return diff >= 0 ? diff : 24 * 60 + diff;
}

function formatDurationHoursLabel(lang: string, durationMin: number, tr: (key: any) => string): string {
  const hours = durationMin / 60;
  const asText = Number(hours.toFixed(2)).toString();
  if (lang === "ru" || lang === "uk") {
    return `${asText.replace(".", ",")}${tr("jobs.hoursShort")}`;
  }
  return `${asText}${tr("jobs.hoursShort")}`;
}

function formatScheduleRangeLabel(
  lang: Parameters<typeof formatWallTime>[0],
  scheduledTime: string | null | undefined,
  scheduledEndTime: string | null | undefined
): string {
  const start = formatWallTime(lang, scheduledTime);
  const hasEnd = String(scheduledEndTime || "").trim().length > 0;
  if (!hasEnd) return start;

  const end = formatWallTime(lang, scheduledEndTime);
  if (!end || end === "\u2014") return start;

  return `${start} \u2013 ${end}`;
}



function calcWorkedDurationMin(job: MeJobsResponse["jobs"][number], nowMs: number): number {
  const startedMs = Date.parse(String(job.started_at || ""));
  if (!Number.isFinite(startedMs)) return 0;

  const stoppedMs = Date.parse(String(job.stopped_at || ""));
  const status = String(job.status || "").toLowerCase();
  const endMs = Number.isFinite(stoppedMs) ? stoppedMs : status === "in_progress" ? nowMs : NaN;

  if (!Number.isFinite(endMs) || endMs <= startedMs) return 0;

  return Math.max(0, Math.floor((endMs - startedMs) / 60000));
}

function statusPillClasses(s: string | null | undefined) {
  const v = String(s || "").toLowerCase()
  if (v === "in_progress")
    return "appStatusPill appStatusPillInProgress border-emerald-400/40 bg-emerald-500/20 text-emerald-100 dark:border-emerald-300/55 dark:bg-emerald-500/42 dark:text-emerald-50"
  if (v === "planned")
    return "appStatusPill appStatusPillPlanned border-amber-400/40 bg-amber-500/20 text-[#3b2414] dark:border-amber-300/55 dark:bg-amber-500/42 dark:text-amber-50"
  if (v === "done")
    return "appStatusPill appStatusPillDone border-sky-400/40 bg-sky-500/20 text-sky-100 dark:border-sky-300/55 dark:bg-sky-500/42 dark:text-sky-50"
  return "border-yellow-400/20 bg-yellow-400/10 text-yellow-100/85 dark:border-amber-300/50 dark:bg-amber-500/38 dark:text-amber-50"
}



function openNavToSite(lat: number | null | undefined, lng: number | null | undefined, address: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    openNavigation({ lat, lng, address });
  } catch {
    // ignore
  }
}

type GpsErrorMessages = {
  unavailable: string;
  unavailableOnDevice: string;
  invalid: string;
  failedPrefix: string;
};

async function getGpsOnce(messages?: Partial<GpsErrorMessages>): Promise<{ lat: number; lng: number; accuracy: number }> {
  const text: GpsErrorMessages = {
    unavailable: "GPS unavailable.",
    unavailableOnDevice: "GPS is unavailable on this device.",
    invalid: "Failed to get valid GPS data.",
    failedPrefix: "Failed to get GPS",
    ...messages,
  };

  if (typeof window === "undefined") throw new Error(text.unavailable);
  if (!("geolocation" in navigator)) throw new Error(text.unavailableOnDevice);

  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy)) {
          reject(new Error(text.invalid));
          return;
        }

        resolve({ lat, lng, accuracy });
      },
      (err) => {
        reject(new Error(`${text.failedPrefix}: ${err.message || err.code}`));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {}
  // fallback
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

function isOfflineishError(e: any): boolean {
  try {
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) return true;
  } catch {}
  const msg = String(e?.message || e || "");
  return /Failed to fetch|NetworkError|Load failed|fetch failed|The network connection was lost/i.test(msg);
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
type PlannedPeriod = "day" | "week" | "month" | "custom" | "all";

export default function AppPage() {
  const { t: tr, lang } = useI18n();

  const statusLabel = useCallback((s: string | null | undefined) => {
    const v = String(s || "").toLowerCase();
    if (v === "planned") return tr("status.planned");
    if (v === "in_progress") return tr("status.inProgress");
    if (v === "done") return tr("status.done");
    return s ? String(s) : tr("status.unknown");
  }, [tr]);

  const gpsMetricsLabel = useCallback(
    (distance: number | null | undefined, accuracy: number | null | undefined) =>
      tr("jobs.gpsMetrics")
        .replace("{distance}", String(distance ?? tr("status.unknown")))
        .replace("{accuracy}", String(accuracy ?? tr("status.unknown"))),
    [tr]
  );

  const gpsErrorMessages = useMemo(
    () => ({
      unavailable: tr("errors.gpsUnavailable"),
      unavailableOnDevice: tr("errors.gpsUnavailableOnDevice"),
      invalid: tr("errors.gpsInvalid"),
      failedPrefix: tr("errors.gpsFailedPrefix"),
    }),
    [tr]
  );
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
  const [smsResetToken, setSmsResetToken] = useState("");
  const [smsStep, setSmsStep] = useState<"enter_phone" | "enter_code" | "set_password">("enter_phone");

  // email recovery link
  const [emailRecover, setEmailRecover] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [offline, setOffline] = useState(false);
  const [outboxN, setOutboxN] = useState(0);
  const [outboxItems, setOutboxItems] = useState<OutboxEvent[]>([]);
  const [teamByJob, setTeamByJob] = useState<TeamResponse["teams"]>({});
  const [syncing, setSyncing] = useState(false);

  /** Native Capacitor: biometric hardware present and enrolled */
  const [bioHardware, setBioHardware] = useState(false);
  /** User chose to save refresh token behind biometrics */
  const [bioSaved, setBioSaved] = useState(false);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [localStartMs, setLocalStartMs] = useState<Record<string, number>>({});
  const [selectedDateKey, setSelectedDateKey] = useState<string>("");
  const [plannedPeriod, setPlannedPeriod] = useState<PlannedPeriod>("week");
  const [customPeriodFrom, setCustomPeriodFrom] = useState<string>("");
  const [customPeriodTo, setCustomPeriodTo] = useState<string>("");

  // onboarding + photos
  const [fullName, setFullName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [photos, setPhotos] = useState<Array<{ path: string; url?: string | null }>>([]);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const authed = !!token;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isNativeCapacitorApp()) {
        if (!cancelled) {
          setBioHardware(false);
          setBioSaved(false);
        }
        return;
      }
      const hw = await biometricHardwareAvailable();
      const saved = hasBiometricUnlockFlag();
      if (!cancelled) {
        setBioHardware(hw);
        setBioSaved(saved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [authed]);

  useEffect(() => {
    // Drop stale translated messages when language changes.
    setError(null);
    setNotice(null);
  }, [lang]);

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

  
  const loadTeams = useCallback(async () => {
    try {
      const res = await authFetchJson<any>("/api/me/jobs/team", { cache: "no-store" });
      const teams = (res && typeof res === "object" && res.teams && typeof res.teams === "object") ? (res.teams as TeamResponse["teams"]) : {};
      setTeamByJob(teams || {});
    } catch {
      // offline or not available
      setTeamByJob({});
    }
  }, []);

const loadAll = useCallback(async () => {
    const profile = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
    setMe(profile);
    setFullName(profile?.profile?.full_name || "");
    setProfileEmail(profile?.profile?.email || "");

    await loadPhotos().catch(() => {});

    const role = String(profile?.profile?.role || "");
    const isActive = Boolean((profile as any)?.profile?.active);
    if (role !== "worker" || !isActive) {
      setJobs([]);
      setTeamByJob({});
      return;
    }

    const jobsRes = await authFetchJson<any>("/api/me/jobs", { cache: "no-store" });
    const list = Array.isArray(jobsRes?.jobs)
      ? jobsRes.jobs
      : Array.isArray(jobsRes?.items)
        ? jobsRes.items
        : [];
    setJobs(Array.isArray(list) ? list : []);

    setLocalStartMs((prev) => {
      const next: Record<string, number> = { ...prev };
      const arr = Array.isArray(list) ? list : [];
      const ids = new Set(arr.map((x: any) => x?.id).filter(Boolean));
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id];
      }
      for (const j of arr as any[]) {
        if (!j || !j.id) continue;
        if (j.started_at || j.stopped_at) {
          delete next[j.id];
        }
      }
      return next;
    });

    await loadTeams().catch(() => {});
  }, [loadPhotos, loadTeams]);

  const refreshOutbox = useCallback(async () => {
    try {
      const items = await outboxList();
      setOutboxItems(Array.isArray(items) ? items : []);
      setOutboxN(Array.isArray(items) ? items.length : 0);
    } catch {
      setOutboxItems([]);
      setOutboxN(0);
    }
  }, []);

  const syncOutbox = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return;
      if (syncing) return;

      const online = typeof navigator !== "undefined" ? navigator.onLine !== false : true;
      if (!online) {
        await refreshOutbox();
        return;
      }

      const items = await outboxList();
      if (!items.length) {
        await refreshOutbox();
        return;
      }

      setSyncing(true);
      try {

        let sentAny = false;

        for (const ev of items) {
          try {
            if (ev.kind === "start") {
              const currentJob = jobs.find((j) => j.id === ev.job_id);
              const currentStatus = String(currentJob?.status || "").toLowerCase();
              const hasOpenStartLog = Boolean(currentJob?.started_at && !currentJob?.stopped_at);
              if (currentStatus === "in_progress" || hasOpenStartLog) {
                // Drop stale queued START events for already running shifts.
                await outboxRemove(ev.event_id);
                await refreshOutbox();
                continue;
              }
            }
            const endpoint = ev.kind === "start" ? "/api/me/jobs/start" : "/api/me/jobs/stop";
            const res = await authFetchJson<any>(endpoint, {
              method: "POST",
              body: JSON.stringify({
                id: ev.job_id,
                event_id: ev.event_id,
                lat: ev.lat,
                lng: ev.lng,
                accuracy: ev.accuracy,
              }),
            });

            if (res?.error) throw new Error(String(res.error));

            await outboxRemove(ev.event_id);
            sentAny = true;
            await refreshOutbox();
          } catch (e: any) {
            if (isOfflineishError(e)) {
              await outboxUpdate(ev.event_id, { tries: (ev.tries || 0) + 1, last_error: "offline" });
              await refreshOutbox();
              break;
            }
            const msg = clientWorkerErrorMessage(tr, e);
            await outboxUpdate(ev.event_id, { tries: (ev.tries || 0) + 1, last_error: msg });
            await refreshOutbox();
            if (!opts?.silent) setError(msg);
            break;
          }
        }

        if (sentAny) {
          await loadAll().catch(() => {});
        }
      } finally {
        setSyncing(false);
      }
    },
    [jobs, loadAll, refreshOutbox, syncing, token, tr]
  );

  useEffect(() => {
    const t = getAccessToken();
    setToken(t);
    (async () => {
      try {
        if (t) await loadAll();
      } catch (e: unknown) {
        const fe = e instanceof FetchApiError ? e : null;
        const msg = fe ? fe.message : String((e as Error)?.message ?? "");
        if (
          fe?.status === 401 ||
          /401|session|expired|unauthorized|login again|auth/i.test(msg)
        ) {
          clearClientAuthState();
          setToken(null);
          setMe(null);
          setJobs([]);
          try {
            await appAuth.auth.signOut();
          } catch {}
        } else {
          setError(clientWorkerErrorMessage(tr, e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll, tr]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnline = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    updateOnline();

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setOutboxN(0);
      return;
    }
    refreshOutbox().catch(() => {});
    if (typeof navigator !== "undefined" && navigator.onLine !== false) {
      syncOutbox({ silent: true }).catch(() => {});
    }
  }, [refreshOutbox, syncOutbox, token]);

  useEffect(() => {
    if (!token) return;
    if (typeof document === "undefined") return;

    const onVis = () => {
      if (outboxN <= 0) return;
      if (!document.hidden && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        syncOutbox({ silent: true }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const timer = window.setInterval(() => {
      if (outboxN <= 0) return;
      if (document.hidden) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      syncOutbox({ silent: true }).catch(() => {});
    }, 15000);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [syncOutbox, token, outboxN]);

  const doLogout = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await clearBiometricStoredCredentials();
      setBioSaved(false);
      clearClientAuthState();
      setToken(null);
      setMe(null);
      setJobs([]);
      try {
        await appAuth.auth.signOut();
      } catch {}
      setNotice(tr("feedback.loggedOut"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [tr]);

  const doSwitchToWorker = useCallback(async () => {
    await doLogout();
    setTab("login");
  }, [doLogout]);

  const bioPrompt = useCallback(
    () => ({
      reason: tr("auth.biometricPromptReason"),
      title: tr("auth.biometricPromptTitle"),
      subtitle: "",
      description: "",
      cancel: tr("common.cancel"),
    }),
    [tr],
  );

  const doEnableBiometric = useCallback(async () => {
    if (!getRefreshToken()) {
      setError(tr("errors.sessionExpired"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await enableBiometricUnlock(bioPrompt());
      setBioSaved(true);
      setNotice(tr("auth.biometricEnabledOk"));
    } catch (e: unknown) {
      const msg = String((e as Error)?.message || e || "");
      if (/user cancel|USER_CANCEL|cancel/i.test(msg)) {
        setNotice(tr("auth.biometricCanceled"));
      } else {
        setError(tr("auth.biometricFailed"));
      }
    } finally {
      setBusy(false);
    }
  }, [bioPrompt, tr]);

  const doDisableBiometric = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await clearBiometricStoredCredentials();
      setBioSaved(false);
      setNotice(tr("auth.biometricDisabledOk"));
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [tr]);

  const doBiometricQuickLogin = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const ok = await unlockSessionWithBiometrics(bioPrompt());
      if (!ok) throw new Error(tr("auth.biometricFailed"));

      const at = getAccessToken();
      const rt = getRefreshToken();
      if (!at) throw new Error(tr("errors.tokenMissing"));

      try {
        if (rt) await appAuth.auth.setSession({ access_token: at, refresh_token: rt });
      } catch {}

      setToken(at);
      await loadAll();
      setNotice(tr("feedback.loginSuccess"));

      try {
        const prof = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
        if (prof?.profile?.role === "admin") window.location.href = "/admin";
      } catch {}
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [bioPrompt, loadAll, tr]);

  const doEmailPasswordLogin = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = email.trim();
      const pw = emailPassword;
      if (!em) throw new Error(tr("errors.enterEmailOrPhone"));
      if (!em.includes("@") && !em.startsWith("+")) throw new Error(tr("errors.phoneE164"));
      if (!pw || !pw.trim()) throw new Error(tr("errors.passwordRequired"));

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: em, password: pw }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        errorCode?: string;
        access_token?: string;
        refresh_token?: string;
      };
      if (!res.ok) {
        const code = payload?.errorCode ? String(payload.errorCode) : "";
        if (code) {
          throw new FetchApiError(`admin.api.${code}`, { status: res.status, errorCode: code });
        }
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      if (!payload?.access_token) throw new Error(tr("errors.tokenMissing"));

      setAuthTokens(String(payload.access_token), payload.refresh_token ? String(payload.refresh_token) : null);

      // Sync browser auth session tokens so profile/password updates stay consistent after /api/auth/login
      try {
        if (payload.refresh_token) {
          await appAuth.auth.setSession({
            access_token: String(payload.access_token),
            refresh_token: String(payload.refresh_token),
          });
        }
      } catch {}

      const t = getAccessToken();
      setToken(t);
      await loadAll();
      setNotice(tr("feedback.loginSuccess"));

      try {
        const prof = await authFetchJson<MeProfileResponse>("/api/me/profile", { cache: "no-store" });
        if (prof?.profile?.role === "admin") window.location.href = "/admin";
      } catch {}
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [email, emailPassword, loadAll, tr]);

  const doSmsSend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = smsPhone.trim();
      if (!isE164(p)) throw new Error(tr("errors.phoneE164"));

      const res = await fetch("/api/auth/forgot-password-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });
      const payload = (await res.json().catch(() => ({}))) as { errorCode?: string; error?: string };
      if (!res.ok) {
        const code = payload?.errorCode ? String(payload.errorCode) : "";
        if (code) {
          throw new FetchApiError(`admin.api.${code}`, { status: res.status, errorCode: code });
        }
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      const cap = (await fetch("/api/auth/sms-capabilities")
        .then((r) => r.json())
        .catch(() => ({ outboundSms: false }))) as { outboundSms?: boolean };

      setSmsStep("enter_code");
      setSmsResetToken("");
      setNotice(cap.outboundSms ? tr("feedback.smsResetNeutralLive") : tr("feedback.smsResetNeutral"));
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [smsPhone, tr]);

  const doSmsVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const p = smsPhone.trim();
      const code = smsOtp.trim();
      if (!isE164(p)) throw new Error(tr("errors.phoneE164"));
      if (!code) throw new Error(tr("errors.enterSmsCode"));

      const res = await fetch("/api/auth/verify-reset-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, code }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        errorCode?: string;
        error?: string;
        reset_token?: string;
      };
      if (!res.ok) {
        const codeErr = payload?.errorCode ? String(payload.errorCode) : "";
        if (codeErr) {
          throw new FetchApiError(`admin.api.${codeErr}`, { status: res.status, errorCode: codeErr });
        }
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      const tok = payload?.reset_token ? String(payload.reset_token) : "";
      if (!tok) throw new Error(tr("errors.tokenMissing"));

      setSmsResetToken(tok);
      setSmsStep("set_password");
      setNotice(tr("feedback.phoneConfirmed"));
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [smsPhone, smsOtp, tr]);

  const doSmsSetPassword = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const pw = smsNewPassword.trim();
      if (!pw || pw.length < 8) throw new Error(tr("errors.passwordMin8"));
      if (!smsResetToken) throw new Error(tr("errors.sessionExpired"));

      const res = await fetch("/api/auth/reset-password-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: smsResetToken, password: pw }),
      });
      const payload = (await res.json().catch(() => ({}))) as { errorCode?: string; error?: string };
      if (!res.ok) {
        const code = payload?.errorCode ? String(payload.errorCode) : "";
        if (code) {
          throw new FetchApiError(`admin.api.${code}`, { status: res.status, errorCode: code });
        }
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      setNotice(tr("feedback.passwordUpdated"));
      setTab("login");
      setSmsStep("enter_phone");
      setSmsOtp("");
      setSmsNewPassword("");
      setSmsResetToken("");
    } catch (e: unknown) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [smsNewPassword, smsResetToken, tr]);

  const doEmailRecovery = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const em = emailRecover.trim().toLowerCase();
      if (!em || !em.includes("@")) throw new Error(tr("errors.validEmailRequired"));

      if (typeof window === "undefined") {
        throw new Error(tr("errors.loadFailed"));
      }
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error: rErr } = await appAuth.auth.resetPasswordForEmail(em, {
        redirectTo,
      });

      if (rErr) throw new Error(rErr.message);

      setNotice(tr("feedback.recoveryEmailSent"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [emailRecover, tr]);

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
      setNotice(tr("feedback.profileUpdated"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [fullName, profileEmail, loadAll, tr]);

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
      setNotice(tr("feedback.approvalSubmitted"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [loadAll, tr]);

  const doUploadPhoto = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input = fileRef.current;
      const file = input?.files?.[0];
      if (!file) throw new Error(tr("errors.chooseFile"));
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
      setNotice(tr("feedback.photoUploaded"));
      if (input) input.value = "";
    } catch (e: any) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [bearerHeaders, loadPhotos, tr]);

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
        setNotice(tr("feedback.avatarUpdated"));
      } catch (e: any) {
        setError(clientWorkerErrorMessage(tr, e));
      } finally {
        setBusy(false);
      }
    },
    [bearerHeaders, loadPhotos, tr]
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
        setNotice(tr("feedback.photoDeleted"));
      } catch (e: any) {
        setError(clientWorkerErrorMessage(tr, e));
      } finally {
        setBusy(false);
      }
    },
    [bearerHeaders, loadPhotos, tr]
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
      setNotice(tr("feedback.accepted"));
    } catch (e: any) {
      setError(clientWorkerErrorMessage(tr, e));
    } finally {
      setBusy(false);
    }
  }, [loadAll, tr]);

  const doStart = useCallback(
    async (jobId: string) => {
      const currentJob = jobs.find((j) => j.id === jobId);
      const pending = outboxItems.find((ev) => ev?.job_id === jobId) || null;
      const currentStatus = String(currentJob?.status || "").toLowerCase();
      const hasOpenStartLog = Boolean(currentJob?.started_at && !currentJob?.stopped_at);
      const hasSiteCoords = hasValidSiteStartCoords(currentJob);
      if (!hasSiteCoords) {
        setNotice(null);
        setError(tr("jobs.siteCoordsMissing"));
        return;
      }
      if (pending?.kind === "start" || currentStatus === "in_progress" || hasOpenStartLog) return;

      setBusy(true);
      setError(null);
      setNotice(null);
      const event_id = newEventId();

      // IMPORTANT: no optimistic START. We switch to "in_progress" only after server GPS validation.
      let gps: { lat: number; lng: number; accuracy: number } | null = null;

      try {
        gps = await getGpsOnce(gpsErrorMessages);
        const response = await authFetch("/api/me/jobs/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: jobId, event_id, ...gps }),
        });
        const payload = await response.json().catch(() => ({} as any));
        if (!response.ok) {
          const errorCode = typeof payload?.errorCode === "string" ? payload.errorCode : "";
          const errorText = typeof payload?.error === "string" ? payload.error : "";
          if (response.status === 400 && (errorCode || errorText)) {
            throw new Error(errorCode && errorText ? `${errorCode}: ${errorText}` : errorCode || errorText);
          }
          if (errorCode) {
            throw new FetchApiError(`admin.api.${errorCode}`, { status: response.status, errorCode });
          }
          throw new Error(errorText || `HTTP ${response.status}`);
        }
        if (payload?.error) throw new Error(String(payload.error));
        const startedLocal = Date.now();
        setLocalStartMs((p) => ({ ...p, [jobId]: startedLocal }));
        setJobs((prev) =>
          prev.map((x) =>
            x.id === jobId
              ? { ...x, status: "in_progress", started_at: x.started_at ?? new Date(startedLocal).toISOString() }
              : x
          )
        );
        await loadAll();
        setNotice(tr("feedback.started"));
        if (outboxN > 0) syncOutbox({ silent: true }).catch(() => {});
      } catch (e: any) {
        if (isOfflineishError(e)) {
          try {
            if (!gps) gps = await getGpsOnce(gpsErrorMessages);
            await outboxAdd({
              event_id,
              kind: "start",
              job_id: jobId,
              lat: gps.lat,
              lng: gps.lng,
              accuracy: gps.accuracy,
              created_at: Date.now(),
              tries: 0,
              last_error: null,
            });
            await refreshOutbox();
            // Do not start locally while offline — START requires server GPS validation.
            setNotice(tr("feedback.startedOfflineBlocked"));
          } catch (e2: any) {
            setError(clientWorkerErrorMessage(tr, e2));
          }
        } else {
          setError(clientWorkerErrorMessage(tr, e));
        }
      } finally {
        setBusy(false);
      }
    },
    [gpsErrorMessages, jobs, loadAll, outboxItems, outboxN, refreshOutbox, syncOutbox, tr]
  );

  const doStop = useCallback(
    async (jobId: string) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      const event_id = newEventId();

      const stoppedLocal = Date.now();
      setLocalStartMs((p) => {
        const n: Record<string, number> = { ...p };
        delete n[jobId];
        return n;
      });
      setJobs((prev) =>
        prev.map((x) =>
          x.id === jobId
            ? { ...x, status: "done", stopped_at: x.stopped_at ?? new Date(stoppedLocal).toISOString() }
            : x
        )
      );

      let gps: { lat: number; lng: number; accuracy: number } | null = null;

      try {
        gps = await getGpsOnce(gpsErrorMessages);
        const res = await authFetchJson<any>("/api/me/jobs/stop", {
          method: "POST",
          body: JSON.stringify({ id: jobId, event_id, ...gps }),
        });
        if (res?.error) throw new Error(String(res.error));
        await loadAll();
        setNotice(tr("feedback.stopped"));
        if (outboxN > 0) syncOutbox({ silent: true }).catch(() => {});
      } catch (e: any) {
        if (isOfflineishError(e)) {
          try {
            if (!gps) gps = await getGpsOnce(gpsErrorMessages);
            await outboxAdd({
              event_id,
              kind: "stop",
              job_id: jobId,
              lat: gps.lat,
              lng: gps.lng,
              accuracy: gps.accuracy,
              created_at: Date.now(),
              tries: 0,
              last_error: null,
            });
            await refreshOutbox();
            setJobs((prev) => prev.map((x) => (x.id === jobId ? { ...x, status: "done" } : x)));
            setNotice(tr("feedback.stoppedQueued"));
          } catch (e2: any) {
            setError(clientWorkerErrorMessage(tr, e2));
          }
        } else {
          setError(clientWorkerErrorMessage(tr, e));
        }
      } finally {
        setBusy(false);
      }
    },
    [gpsErrorMessages, loadAll, outboxN, refreshOutbox, syncOutbox, tr]
  );


  const workerIsActive = Boolean(me?.profile?.active);
  const isAdmin = me?.profile?.role === "admin";
  const tempPassword = Boolean(me?.user?.temp_password);


  const pendingByJob = useMemo(() => {
    const m: Record<string, OutboxEvent> = {};
    for (const ev of outboxItems) {
      if (ev && ev.job_id) m[ev.job_id] = ev;
    }
    return m;
  }, [outboxItems]);

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

  const scheduleRows = useMemo(
    () =>
      jobsSorted.map((j) => {
        const day = parseJobDateSafe(j.job_date);
        const dateKey = day ? toDateKeyLocal(day) : "";
        const tm = parseScheduledTimeWindow(j.scheduled_time, j.scheduled_end_time);
        const durationMin = calcDurationMin(tm.startMin, tm.endMin);
        const workedMin = calcWorkedDurationMin(j, nowMs);
        return { j, day, dateKey, durationMin, workedMin };
      }),
    [jobsSorted, nowMs]
  );

  const weekAnchorDate = useMemo(() => {
    const today = startOfLocalDay(new Date());
    const upcoming = scheduleRows
      .map((x) => x.day)
      .filter((d): d is Date => Boolean(d))
      .filter((d) => d.getTime() >= today.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (upcoming) return upcoming;
    const earliest = scheduleRows
      .map((x) => x.day)
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return earliest || today;
  }, [scheduleRows]);

  useEffect(() => {
    if (!selectedDateKey) {
      setSelectedDateKey(toDateKeyLocal(weekAnchorDate));
    }
  }, [selectedDateKey, weekAnchorDate]);

  const selectedDate = useMemo(() => parseJobDateSafe(selectedDateKey) || weekAnchorDate, [selectedDateKey, weekAnchorDate]);
  const weekStart = useMemo(() => startOfWeekMonday(selectedDate), [selectedDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDaysLocal(weekStart, i);
        return { date: d, key: toDateKeyLocal(d) };
      }),
    [weekStart]
  );
  const weekEnd = useMemo(() => addDaysLocal(weekStart, 6), [weekStart]);

  const weekRows = useMemo(
    () =>
      scheduleRows.filter((row) => {
        if (!row.day) return false;
        const t = row.day.getTime();
        return t >= weekStart.getTime() && t <= weekEnd.getTime();
      }),
    [scheduleRows, weekEnd, weekStart]
  );

  const weekRowsByDate = useMemo(() => {
    const m = new Map<string, typeof weekRows>();
    for (const row of weekRows) {
      const key = row.dateKey;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(row);
    }
    return m;
  }, [weekRows]);

  const selectedDayRows = useMemo(() => weekRowsByDate.get(selectedDateKey) || [], [selectedDateKey, weekRowsByDate]);
  const selectedDayMonthTitle = useMemo(() => {
    const locale = appLocaleToBCP47(lang);
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(selectedDate);
  }, [lang, selectedDate]);
  const selectedDayShortTitle = useMemo(() => {
    const locale = appLocaleToBCP47(lang);
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(selectedDate);
  }, [lang, selectedDate]);

  const monthRows = useMemo(
    () =>
      scheduleRows.filter((row) => {
        if (!row.day) return false;
        return row.day.getFullYear() === selectedDate.getFullYear() && row.day.getMonth() === selectedDate.getMonth();
      }),
    [scheduleRows, selectedDate]
  );

  const customPeriodRows = useMemo(() => {
    const from = parseJobDateSafe(customPeriodFrom);
    const to = parseJobDateSafe(customPeriodTo);
    if (!from || !to) return selectedDayRows;

    const fromMs = startOfLocalDay(from).getTime();
    const toMs = startOfLocalDay(to).getTime();
    const minMs = Math.min(fromMs, toMs);
    const maxMs = Math.max(fromMs, toMs);

    return scheduleRows.filter((row) => {
      if (!row.day) return false;
      const rowMs = startOfLocalDay(row.day).getTime();
      return rowMs >= minMs && rowMs <= maxMs;
    });
  }, [customPeriodFrom, customPeriodTo, scheduleRows, selectedDayRows]);

  const plannedDayMinutes = useMemo(
    () => selectedDayRows.reduce((acc, row) => acc + (row.durationMin || 0), 0),
    [selectedDayRows]
  );

  const plannedWeekMinutes = useMemo(
    () => weekRows.reduce((acc, row) => acc + (row.durationMin || 0), 0),
    [weekRows]
  );

  const plannedMonthMinutes = useMemo(
    () => monthRows.reduce((acc, row) => acc + (row.durationMin || 0), 0),
    [monthRows]
  );

  const plannedCustomMinutes = useMemo(
    () => customPeriodRows.reduce((acc, row) => acc + (row.durationMin || 0), 0),
    [customPeriodRows]
  );

  const plannedLoadedMinutes = useMemo(
    () => scheduleRows.reduce((acc, row) => acc + (row.durationMin || 0), 0),
    [scheduleRows]
  );

  const plannedPeriodMinutes = useMemo(() => {
    if (plannedPeriod === "day") return plannedDayMinutes;
    if (plannedPeriod === "week") return plannedWeekMinutes;
    if (plannedPeriod === "month") return plannedMonthMinutes;
    if (plannedPeriod === "custom") return plannedCustomMinutes;
    return plannedLoadedMinutes;
  }, [plannedCustomMinutes, plannedDayMinutes, plannedLoadedMinutes, plannedMonthMinutes, plannedPeriod, plannedWeekMinutes]);

  const workedDayMinutes = useMemo(
    () => selectedDayRows.reduce((acc, row) => acc + (row.workedMin || 0), 0),
    [selectedDayRows]
  );

  const workedWeekMinutes = useMemo(
    () => weekRows.reduce((acc, row) => acc + (row.workedMin || 0), 0),
    [weekRows]
  );

  const workedMonthMinutes = useMemo(
    () => monthRows.reduce((acc, row) => acc + (row.workedMin || 0), 0),
    [monthRows]
  );

  const workedCustomMinutes = useMemo(
    () => customPeriodRows.reduce((acc, row) => acc + (row.workedMin || 0), 0),
    [customPeriodRows]
  );

  const workedLoadedMinutes = useMemo(
    () => scheduleRows.reduce((acc, row) => acc + (row.workedMin || 0), 0),
    [scheduleRows]
  );

  const workedPeriodMinutes = useMemo(() => {
    if (plannedPeriod === "day") return workedDayMinutes;
    if (plannedPeriod === "week") return workedWeekMinutes;
    if (plannedPeriod === "month") return workedMonthMinutes;
    if (plannedPeriod === "custom") return workedCustomMinutes;
    return workedLoadedMinutes;
  }, [plannedPeriod, workedCustomMinutes, workedDayMinutes, workedLoadedMinutes, workedMonthMinutes, workedWeekMinutes]);

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

  const btnStartSolid = clsx(
    "rounded-xl px-4 py-2 font-semibold",
    "bg-red-600 text-white hover:bg-red-700",
    "shadow-[0_10px_30px_rgba(220,38,38,0.25)]",
    "disabled:opacity-50 disabled:cursor-not-allowed"
  );

  const btnStopSolid = clsx(
    "rounded-xl px-4 py-2 font-semibold",
    "bg-emerald-600 text-white hover:bg-emerald-700",
    "shadow-[0_10px_30px_rgba(16,185,129,0.25)]",
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
      <AppWorkerShell>
        <main className="flex-1 bg-black text-zinc-100 flex items-center justify-center p-6">
          <div className={clsx(card, "p-6 w-full max-w-md")}>
            <div className="text-lg font-semibold">{tr("home.loadingTitle")}</div>
            <div className="mt-2 text-sm opacity-70">{tr("home.loadingSubtitle")}</div>
          </div>
        </main>
      </AppWorkerShell>
    );
  }

  return (
    <AppWorkerShell>
      <main className="flex-1 bg-black px-6 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-6 text-zinc-100">
        <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className={clsx("text-2xl font-semibold", gold)}>Cleaning Timeclock</div>
            <div className="text-sm opacity-70">Van Tanija BV Cleaning</div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {authed && bioHardware && (
              <>
                {bioSaved ? (
                  <button type="button" className={clsx(btn, "text-xs")} onClick={doDisableBiometric} disabled={busy}>
                    {tr("auth.biometricDisable")}
                  </button>
                ) : (
                  <button type="button" className={clsx(btn, "text-xs")} onClick={doEnableBiometric} disabled={busy}>
                    {tr("auth.biometricEnable")}
                  </button>
                )}
              </>
            )}
            {authed && (
              <>
                <a className={btn} href="/me/profile">{tr("nav.profile")}</a>
                {isAdmin && <a className={btn} href="/admin">{tr("nav.adminPanel")}</a>}
                <button className={btn} onClick={doLogout} disabled={busy}>{tr("auth.logout")}</button>
              </>
            )}
          </div>
        </header>

        {(error || notice || offline || outboxN > 0 || syncing) && (
          <div className={clsx("mt-4", card, "p-4")}>
            {error && <div className="text-sm text-red-300">{error}</div>}
            {notice && <div className="text-sm text-emerald-200">{notice}</div>}
            {offline && <div className="mt-2 text-sm text-amber-200">{tr("home.offlineNotice")}</div>}
            {(outboxN > 0 || syncing) && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-amber-200">
                  {tr("common.queue")}: {outboxN}{syncing && outboxN > 0 ? ` • ${tr("common.loading")}` : ""}
                </div>
                <button
                  className={clsx(btn, "px-3 py-1.5 text-sm", (busy || syncing || offline || outboxN <= 0) && "opacity-50 cursor-not-allowed")}
                  disabled={busy || syncing || offline || outboxN <= 0}
                  onClick={() => syncOutbox()}
                >
                  {tr("home.syncNow")}
                </button>
              </div>
            )}
          </div>
        )}

        {authed && isAdmin && (
          <section className="mt-4">
            <div className={clsx(card, "p-4")}>
              <div className="text-sm font-semibold text-amber-100">{tr("auth.signedInAsAdministrator")}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className={btn} href="/admin">
                  {tr("auth.openAdminPanel")}
                </a>
                <button className={btn} onClick={doSwitchToWorker} disabled={busy}>
                  {tr("auth.signOutAndSignInAsWorker")}
                </button>
              </div>
            </div>
          </section>
        )}

        {!authed ? (
          <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={clsx(card, "p-6")}>
              <div className="flex items-center gap-2">
                <button
                  className={clsx(btn, tab === "login" && "bg-amber-400/30")}
                  onClick={() => setTab("login")}
                >
                  {tr("auth.loginTab")}
                </button>
                <button
                  className={clsx(btn, tab === "sms" && "bg-amber-400/30")}
                  onClick={() => setTab("sms")}
                >
                  {tr("auth.smsTab")}
                </button>
                <button
                  className={clsx(btn, tab === "email" && "bg-amber-400/30")}
                  onClick={() => setTab("email")}
                >
                  {tr("auth.emailTab")}
                </button>
              </div>

              {tab === "login" && (
                <div className="mt-5 space-y-3">
                  <div className="text-sm opacity-80">{tr("auth.loginHint")}</div>

                  {bioHardware && bioSaved && (
                    <button type="button" className={clsx(btnSolid, "w-full")} onClick={doBiometricQuickLogin} disabled={busy}>
                      {tr("auth.biometricQuickLogin")}
                    </button>
                  )}

                  <input
                    className={input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tr("auth.loginPlaceholder")}
                    autoComplete="username"
                  />

                  <input
                    className={input}
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder={tr("auth.passwordPlaceholder")}
                    type="password"
                    autoComplete="current-password"
                  />

                  <div className="flex items-center gap-2">
                    <button className={btnSolid} onClick={doEmailPasswordLogin} disabled={busy}>
                      {tr("auth.loginButton")}
                    </button>
                    <a className="text-sm underline opacity-80 hover:opacity-100" href="/forgot-password">
                      {tr("auth.forgotPassword")}
                    </a>
                  </div>

                  <div className="text-xs opacity-60">
                    {tr("auth.workerNoEmailHint")} <span className="font-mono">{makeWorkerEmailFromPhone("+31612345678")}</span>
                  </div>
                </div>
              )}

              {tab === "sms" && (
                <div className="mt-5 space-y-3">
                  <div className="text-sm opacity-80">{tr("auth.smsRecoveryHint")}</div>

                  <input
                    className={input}
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    placeholder={tr("auth.smsPhonePlaceholder")}
                    autoComplete="tel"
                  />

                  {smsStep === "enter_phone" && (
                    <button className={btnSolid} onClick={doSmsSend} disabled={busy}>
                      {tr("auth.sendCode")}
                    </button>
                  )}

                  {smsStep === "enter_code" && (
                    <>
                      <input
                        className={input}
                        value={smsOtp}
                        onChange={(e) => setSmsOtp(e.target.value)}
                        placeholder={tr("auth.smsCodePlaceholder")}
                        autoComplete="one-time-code"
                      />
                      <div className="flex gap-2">
                        <button className={btnSolid} onClick={doSmsVerify} disabled={busy}>
                          {tr("auth.confirm")}
                        </button>
                        <button
                          className={btn}
                          onClick={() => {
                            setSmsStep("enter_phone");
                            setSmsOtp("");
                            setSmsResetToken("");
                          }}
                          disabled={busy}
                        >
                          {tr("auth.back")}
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
                        placeholder={tr("auth.newPasswordPlaceholder")}
                        type="password"
                        autoComplete="new-password"
                      />
                      <button className={btnSolid} onClick={doSmsSetPassword} disabled={busy}>
                        {tr("auth.savePassword")}
                      </button>
                    </>
                  )}

                  <div className="text-xs opacity-70">
                    {tr("auth.smsMissingBindingHint")}
                  </div>
                </div>
              )}

              {tab === "email" && (
                <div className="mt-5 space-y-3">
                  <div className="text-sm opacity-80">{tr("auth.emailRecoveryHint")}</div>
                  <input
                    className={input}
                    value={emailRecover}
                    onChange={(e) => setEmailRecover(e.target.value)}
                    placeholder={tr("auth.emailPlaceholder")}
                    autoComplete="email"
                  />
                  <button className={btnSolid} onClick={doEmailRecovery} disabled={busy}>
                    {tr("auth.sendEmail")}
                  </button>
                  <div className="text-xs opacity-60">
                    {tr("auth.resetEmailHint")} <span className="font-mono">/reset-password</span>.
                  </div>
                </div>
              )}
            </div>

            <div className={clsx(card, "p-6")}>
              <div className="text-lg font-semibold">{tr("auth.howItWorksTitle")}</div>
              <ul className="mt-3 space-y-2 text-sm opacity-80 list-disc pl-5">
                <li>{tr("auth.howItWorksItem1")}</li>
                <li>{tr("auth.howItWorksItem2")}</li>
                <li>{tr("auth.howItWorksItem3")}</li>
                <li>{tr("auth.howItWorksItem4")}</li>
              </ul>
              <div className="mt-4 text-xs opacity-60">
                {tr("auth.adminRedirectHint")}
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className={clsx(card, "p-6 xl:col-span-2")}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{tr("jobs.scheduleTitle")}</div>
                <button className={btn} onClick={() => loadAll().catch((e) => setError(clientWorkerErrorMessage(tr, e)))} disabled={busy}>
                  {tr("common.refresh")}
                </button>
              </div>

              {!workerIsActive && !isAdmin && (
                <div className={clsx("mt-4 p-3 rounded-xl", border, "bg-amber-400/10")}>
                  <div className="text-sm font-semibold text-amber-200">{tr("jobs.activationPendingTitle")}</div>
                  <div className="text-xs opacity-80 mt-1">
                    {tr("jobs.activationPendingText")}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {jobsSorted.length === 0 ? (
                  <div className="text-sm opacity-70">{tr("jobs.empty")}</div>
                ) : (
                  <>
                    <div className={clsx("rounded-2xl p-3", border, "bg-zinc-950/50")}>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className={clsx(btn, "px-3 py-1.5 text-xs")}
                          onClick={() => setSelectedDateKey(toDateKeyLocal(addDaysLocal(selectedDate, -7)))}
                        >
                          {tr("jobs.previousWeek")}
                        </button>
                        <div className="text-xs font-semibold opacity-80">{tr("jobs.thisWeek")}</div>
                        <button
                          type="button"
                          className={clsx(btn, "px-3 py-1.5 text-xs")}
                          onClick={() => setSelectedDateKey(toDateKeyLocal(addDaysLocal(selectedDate, 7)))}
                        >
                          {tr("jobs.nextWeek")}
                        </button>
                      </div>
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {weekDays.map((d) => {
                          const active = d.key === selectedDateKey;
                          const hasShifts = weekRowsByDate.has(d.key);
                          const locale = appLocaleToBCP47(lang);
                          const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d.date);
                          const numLabel = d.date.getDate();
                          return (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => setSelectedDateKey(d.key)}
                              className={clsx(
                                "min-w-[3.3rem] rounded-2xl px-2 py-2 text-center transition",
                                border,
                                active ? "bg-amber-400 text-zinc-950" : "bg-zinc-900/35 hover:bg-zinc-900/55"
                              )}
                            >
                              <div className={clsx("text-[10px] uppercase", active ? "opacity-90" : "opacity-70")}>{dayLabel}</div>
                              <div className="text-sm font-semibold leading-5">{numLabel}</div>
                              <div className="mt-1 h-1.5">
                                {hasShifts ? (
                                  <span className={clsx("inline-block h-1.5 w-1.5 rounded-full", active ? "bg-zinc-900" : "bg-amber-300")} />
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className={clsx("rounded-2xl p-3", border, "bg-zinc-950/50")}>
                      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs opacity-70">{tr("jobs.plannedDay")}</div>
                          <div className="font-semibold">
                            {formatDurationHoursLabel(lang, plannedDayMinutes, tr)}
                          </div>
                          <div className="mt-2 text-xs opacity-70">{tr("jobs.workedDay")}</div>
                          <div className="font-semibold">
                            {formatDurationHoursLabel(lang, workedDayMinutes, tr)}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs opacity-70">{tr("jobs.plannedPeriod")}</div>
                            <div className="font-semibold">
                              {formatDurationHoursLabel(lang, plannedPeriodMinutes, tr)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="text-xs opacity-70">{tr("jobs.workedPeriod")}</div>
                            <div className="font-semibold">
                              {formatDurationHoursLabel(lang, workedPeriodMinutes, tr)}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {([
                              ["day", tr("jobs.periodDay")],
                              ["week", tr("jobs.periodWeek")],
                              ["month", tr("jobs.periodMonth")],
                              ["custom", tr("jobs.periodCustom")],
                              ["all", tr("jobs.periodAll")],
                            ] as Array<[PlannedPeriod, string]>).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  if (value === "custom") {
                                    const key = selectedDateKey || toDateKeyLocal(selectedDate);
                                    setCustomPeriodFrom((current) => current || key);
                                    setCustomPeriodTo((current) => current || key);
                                  }
                                  setPlannedPeriod(value);
                                }}
                                className={clsx(
                                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                                  plannedPeriod === value
                                    ? "border-amber-300 bg-amber-400 text-zinc-950"
                                    : "border-amber-500/25 bg-zinc-900/35 text-amber-100 hover:bg-zinc-900/55"
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {plannedPeriod === "custom" ? (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="text-xs opacity-80">
                                <span className="mb-1 block">{tr("jobs.periodFrom")}</span>
                                <input
                                  type="date"
                                  value={customPeriodFrom}
                                  onChange={(e) => setCustomPeriodFrom(e.target.value)}
                                  className="w-full rounded-xl border border-amber-500/25 bg-zinc-950/70 px-2 py-2 text-xs text-amber-50 outline-none"
                                />
                              </label>
                              <label className="text-xs opacity-80">
                                <span className="mb-1 block">{tr("jobs.periodTo")}</span>
                                <input
                                  type="date"
                                  value={customPeriodTo}
                                  onChange={(e) => setCustomPeriodTo(e.target.value)}
                                  className="w-full rounded-xl border border-amber-500/25 bg-zinc-950/70 px-2 py-2 text-xs text-amber-50 outline-none"
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className={clsx("text-xs font-semibold uppercase tracking-wide text-amber-200/90")}>
                        {selectedDayMonthTitle}
                      </div>
                      {selectedDayRows.length === 0 ? (
                        <div className="text-sm opacity-70">{tr("jobs.noShiftsForDay")}</div>
                      ) : (
                        selectedDayRows.map(({ j, durationMin, workedMin }) => {
                    const pending = pendingByJob[j.id];
                    const rawStatus = String(j.status || "").toLowerCase();
                    const hasOpenStartLog = Boolean(j.started_at && !j.stopped_at);
                    const baseStatus = hasOpenStartLog ? "in_progress" : rawStatus;
                    const effStatus = pending
                      ? (pending.kind === "start" ? "in_progress" : pending.kind === "stop" ? "done" : baseStatus)
                      : baseStatus;
                    const planned = effStatus === "planned";
                    const inProg = effStatus === "in_progress";
                    const done = effStatus === "done";
                    const hasSiteCoords = hasValidSiteStartCoords(j);
                    const blockedByMissingCoords = planned && !hasSiteCoords;

                    const baseStart = (localStartMs as any)[j.id] ?? (j.started_at ? new Date(j.started_at).getTime() : null);
                    const elapsedMs = inProg && baseStart ? Math.max(0, nowMs - baseStart) : null;
                    const elapsedStr = elapsedMs != null ? formatHMS(elapsedMs) : null;

                    return (
                      <div key={j.id} className={clsx("rounded-2xl p-4", border, "bg-zinc-900/70")}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className={clsx("w-14 shrink-0 rounded-xl border border-amber-500/25 p-2 text-center", "bg-amber-400/15")}>
                            <div className="text-xl font-semibold leading-5">{selectedDate.getDate()}</div>
                            <div className="mt-1 text-[10px] uppercase opacity-70">{selectedDayShortTitle}</div>
                          </div>
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => openNavToSite(j.site_lat, j.site_lng, j.site_address)}
                              className={clsx("relative h-12 w-12 overflow-hidden rounded-2xl", border, "bg-zinc-900/30", (j.site_lat != null && j.site_lng != null) || j.site_address ? "hover:bg-zinc-900/40" : "")}
                              title={tr("jobs.navigation")}
                            >
                              <div className="absolute inset-0 flex items-center justify-center text-xs opacity-70">
                                {(j.site_name || "—").trim().slice(0, 1).toUpperCase() || "•"}
                              </div>
                              {j.site_photo_url ? (
                                 
                                <img
                                  src={j.site_photo_url}
                                  alt="site"
                                  className="absolute inset-0 h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    try {
                                      ;(e.currentTarget as HTMLImageElement).style.display = "none"
                                      ;(e.currentTarget as HTMLImageElement).removeAttribute("src")
                                    } catch {}
                                  }}
                                />
                              ) : null}
                            </button>

                            <div>
                              <div className="text-sm font-semibold">
                                {j.site_name || tr("jobs.siteFallback")} • <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusPillClasses(effStatus)}`}>{statusLabel(effStatus)}</span>
                              </div>
                              <div className="text-xs opacity-70 mt-1">
                                {j.site_address || tr("status.unknown")}
                              </div>
                              <div className="text-xs opacity-80 mt-1">
                                {formatScheduleRangeLabel(lang, j.scheduled_time, j.scheduled_end_time)}
                                {durationMin != null ? (
                                  <span> • {tr("jobs.estimated")} ({formatDurationHoursLabel(lang, durationMin, tr)})</span>
                                ) : null}
                                {workedMin > 0 ? (
                                  <span> • {tr("jobs.worked")} ({formatDurationHoursLabel(lang, workedMin, tr)})</span>
                                ) : null}
                              </div>
                              {(() => {
                                const xs = teamByJob?.[j.id] || [];
                                const myId = me?.user?.id || "";
                                const others = xs.filter((x) => x && x.id && x.id !== myId);
                                const line = others.map((x) => x.name).filter(Boolean).join(", ");
                                return line ? (
                                  <div className="text-xs opacity-70 mt-1">
                                    {tr("jobs.team")}: <span className="text-amber-100">{line}</span>
                                  </div>
                                ) : null;
                              })()}
                              <div className="mt-2">
                                <button
                                  type="button"
                                  className={clsx(btn, "text-xs px-3 py-1") }
                                  onClick={() => openNavToSite(j.site_lat, j.site_lng, j.site_address)}
                                >
                                  {tr("jobs.navigation")}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
                            {planned && Boolean(j.can_accept) && (
                              <button className={btnSolid} onClick={() => doAccept(j.id)} disabled={busy}>
                                {tr("jobs.accept")}
                              </button>
                            )}
                            {inProg && (
                              <button className={btnStopSolid} onClick={() => doStop(j.id)} disabled={busy}>
                                {pending && pending.kind === "stop" ? tr("jobs.stopQueued") : tr("jobs.stop")}
                              </button>
                            )}
                            {planned && !Boolean(j.can_accept) && !Boolean(j.started_at && !j.stopped_at) && !blockedByMissingCoords && (
                              <button className={btnStartSolid} onClick={() => doStart(j.id)} disabled={busy}>
                                {pending && pending.kind === "start" ? tr("jobs.startQueued") : tr("jobs.start")}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs opacity-80 md:grid-cols-2">
                          <div>{tr("jobs.startedAt")}: {formatDateTimeShort(lang, j.started_at)}</div>
                          <div>{tr("jobs.stoppedAt")}: {formatDateTimeShort(lang, j.stopped_at)}</div>
                        </div>

                        {inProg && elapsedStr ? (
                          <div className="mt-2 text-xs">
                            <span className="opacity-70">{tr("jobs.timer")}: </span>
                            <span className={clsx("font-semibold", gold)}>{elapsedStr}</span>
                          </div>
                        ) : null}


                        {(j.distance_m != null || j.accuracy_m != null) ? (
                          <div className="mt-2 text-xs opacity-70">
                            {gpsMetricsLabel(j.distance_m, j.accuracy_m)}
                          </div>
                        ) : null}
                        {blockedByMissingCoords ? (
                          <div className="mt-2 text-xs text-amber-200">{tr("jobs.siteCoordsMissing")}</div>
                        ) : null}
                      </div>
                    );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={clsx(card, "p-6 xl:col-span-1")}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  { }
                  <img src="/tanija-logo.png" alt="Tanija" className="h-6 w-auto" />
                  <div className="text-lg font-semibold">{tr("profile.title")}</div>
                </div>
                <div className="text-xs opacity-70">
                  {tr("profile.role")}: <span className={gold}>{me?.profile?.role || tr("status.unknown")}</span> • {tr("profile.active")}:{" "}
                  <span className={gold}>{workerIsActive ? tr("common.yes") : tr("common.no")}</span>
                </div>
              </div>

              {tempPassword && (
                <div className={clsx("mt-4 p-3 rounded-xl", border, "bg-amber-400/10")}>
                  <div className="text-sm font-semibold text-amber-200">{tr("profile.tempPasswordTitle")}</div>
                  <div className="text-xs opacity-80 mt-1">
                    {tr("profile.tempPasswordHint")}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-xs opacity-70">{tr("profile.name")}</div>
                  <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={tr("profile.fullNamePlaceholder")} />
                </div>
                <div>
                  <div className="text-xs opacity-70">{tr("profile.contactEmail")}</div>
                  <input className={input} value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} placeholder={tr("auth.emailPlaceholder")} />
                </div>

                <button className={btnSolid} onClick={doUpdateProfile} disabled={busy}>
                  {tr("profile.saveProfile")}
                </button>

                <div className="text-xs opacity-70">
                  {tr("profile.phone")}: {me?.user?.phone || me?.profile?.phone || tr("status.unknown")} • {tr("profile.emailConfirmed")}:{" "}
                  {me?.user?.email ? (me?.user?.email_confirmed_at ? tr("common.yes") : tr("common.no")) : tr("status.unknown")}
                </div>
              </div>

              <div className="mt-6 border-t border-amber-500/15 pt-5">
                <div className="text-lg font-semibold">{tr("profile.photosTitle")}</div>

                <div className="mt-3 flex gap-2 items-center">
                  <input ref={fileRef} className={clsx("text-xs", "w-full")} type="file" accept="image/png,image/jpeg,image/webp" />
                  <button className={btn} onClick={doUploadPhoto} disabled={busy}>
                    {tr("profile.upload")}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {photos.map((p) => {
                    const isPrimary = avatarPath && p.path === avatarPath;
                    return (
                      <div key={p.path} className={clsx("rounded-xl overflow-hidden", border, "bg-zinc-950/60")}>
                        <div className="aspect-[4/3] bg-zinc-900/30 flex items-center justify-center">
                          {p.url ? (
                             
                            <img src={p.url} alt="photo" className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-xs opacity-60">{tr("profile.noPreview")}</div>
                          )}
                        </div>
                        <div className="p-2 flex gap-2">
                          <button className={clsx(btn, "text-xs px-2 py-1")} onClick={() => doMakePrimary(p.path)} disabled={busy}>
                            {isPrimary ? tr("profile.avatar") : tr("profile.makeAvatar")}
                          </button>
                          <button className={clsx(btn, "text-xs px-2 py-1")} onClick={() => doDeletePhoto(p.path)} disabled={busy}>
                            {tr("profile.delete")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!workerIsActive && !isAdmin ? (
                  <div className="mt-4">
                    <button className={btnSolid} onClick={doSubmitForApproval} disabled={busy}>
                      {tr("profile.submitForActivation")}
                    </button>
                    <div className="text-xs opacity-60 mt-2">
                      {tr("profile.submitForActivationHint")}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-xs opacity-70">{tr("profile.activated")}</div>
                )}
              </div>
            </div>
          </section>
        )}

        </div>
      </main>
    </AppWorkerShell>
  );
}
