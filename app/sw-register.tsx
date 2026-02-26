"use client";

import { useEffect } from "react";

type KillInfo = {
  enabled: boolean;
  kill: boolean;
  build?: string;
};

async function fetchKillInfo(): Promise<KillInfo | null> {
  try {
    const res = await fetch(`/api/pwa/sw-kill?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as KillInfo;
  } catch {
    return null;
  }
}

async function killServiceWorkerAndCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("ct-")).map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
}

export default function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const doWork = async () => {
      const info = await fetchKillInfo();

      // Default: SW enabled unless explicitly disabled.
      const enabled = info ? !!info.enabled : true;
      const kill = info ? !!info.kill : false;

      if (!enabled || kill) {
        await killServiceWorkerAndCaches();
        if (!cancelled) {
          // Hard refresh to ensure the newest app code (no SW).
          window.location.reload();
        }
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

        // If there's an updated worker waiting, activate it now.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // When a new SW is installed and there's an existing controller,
            // it's an update → take over immediately.
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
          // New SW took control → reload once to use fresh assets.
          window.location.reload();
        };

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        // Ask SW to clean caches if backend says kill=true later.
        navigator.serviceWorker.addEventListener("message", (evt) => {
          const data = evt.data || {};
          if (data?.type === "SW_KILL" || data?.type === "SW_CLEAR") {
            killServiceWorkerAndCaches().finally(() => window.location.reload());
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
