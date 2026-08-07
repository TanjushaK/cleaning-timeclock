"use client";

import { useEffect } from "react";

type KillInfo = {
  enabled: boolean;
  kill: boolean;
  build?: string;
};

function truthy(v: unknown) {
  if (typeof v !== "string") return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

async function fetchKillInfo(): Promise<KillInfo | null> {
  try {
    const res = await fetch(`/api/pwa/sw-kill?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as KillInfo;
    return {
      enabled: !!(json as any)?.enabled,
      kill: !!(json as any)?.kill,
      build: (json as any)?.build,
    };
  } catch {
    return null;
  }
}

async function killServiceWorkerAndCaches(): Promise<boolean> {
  let changed = false;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      const results = await Promise.all(regs.map((r) => r.unregister()));
      if (results.some(Boolean)) changed = true;
    }
  } catch {
    // ignore
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      const ctKeys = keys.filter((k) => k.startsWith("ct-"));
      const results = await Promise.all(ctKeys.map((k) => caches.delete(k)));
      if (results.some(Boolean)) changed = true;
    }
  } catch {
    // ignore
  }

  return changed;
}

function reloadOnce(key: string) {
  try {
    const k = `ct:${key}`;
    if (sessionStorage.getItem(k) === "1") return;
    sessionStorage.setItem(k, "1");
  } catch {
    // ignore
  }
  window.location.reload();
}

export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const doWork = async () => {
      const info = await fetchKillInfo();

      // SAFE DEFAULT: disabled unless explicitly enabled by env.
      const enabled = info ? !!info.enabled : false;
      const kill = info ? !!info.kill : false;

      if (!enabled || kill) {
        const changed = await killServiceWorkerAndCaches();
        if (!cancelled && changed) {
          // Reload only when an existing SW or cache was actually removed.
          reloadOnce("sw-killed");
        }
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

        // If there's an updated worker waiting, activate it now.
        try {
          reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        } catch {
          // ignore
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              try {
                reg.waiting?.postMessage({ type: "SKIP_WAITING" });
              } catch {
                // ignore
              }
            }
          });
        });

        const onControllerChange = () => {
          if (cancelled) return;
          // New SW took control → reload ONCE to use fresh assets.
          reloadOnce("sw-updated");
        };

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        navigator.serviceWorker.addEventListener("message", (evt) => {
          const data = evt.data || {};
          if (data?.type === "SW_KILL" || data?.type === "SW_CLEAR" || data?.type === "CLEAR_CACHES") {
            killServiceWorkerAndCaches().then((changed) => {
              if (changed) reloadOnce("sw-killed");
            });
          }
        });

        // Proactively check for SW updates.
        try {
          await reg.update();
        } catch {
          // ignore
        }

        return () => {
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        };
      } catch {
        // Silent: SW is optional; app must work without it.
      }
    };

    doWork();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
