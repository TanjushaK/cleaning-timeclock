"use client";

import React, { useEffect, useRef, useState } from "react";

type KillStatus = { enabled: boolean; ts?: number };

async function getKillEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/pwa/sw-kill", { cache: "no-store" });
    if (!res.ok) return true;
    const data = (await res.json()) as KillStatus;
    return !(data && data.enabled === false);
  } catch {
    return true;
  }
}

async function clientDisableSW() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
  } catch {}
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch {}
}

export default function SWRegister() {
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const refreshingRef = useRef(false);

  const [updateReady, setUpdateReady] = useState(false);
  const [swDisabled, setSwDisabled] = useState(false);
  const [swSupported, setSwSupported] = useState(true);

  const wireRegistration = (reg: ServiceWorkerRegistration) => {
    regRef.current = reg;

    if (reg.waiting) setUpdateReady(true);

    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }
      });
    });
  };

  const applyUpdate = () => {
    const reg = regRef.current;
    if (!reg?.waiting) {
      window.location.reload();
      return;
    }
    try {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    } catch {
      window.location.reload();
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      setSwSupported(false);
      return;
    }

    let mounted = true;

    const onControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };

    const onMessage = (ev: MessageEvent) => {
      const data = ev?.data;
      if (!data) return;
      if (data.type === "SW_DISABLED") {
        setSwDisabled(true);
        clientDisableSW().catch(() => {});
      }
    };

    const onVis = () => {
      if (document.hidden) return;

      const reg = regRef.current;
      if (reg) reg.update().catch(() => {});

      getKillEnabled()
        .then((enabled) => {
          if (!mounted) return;
          if (!enabled) {
            setSwDisabled(true);
            clientDisableSW().catch(() => {});
          }
        })
        .catch(() => {});
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVis);

    (async () => {
      const enabled = await getKillEnabled();
      if (!mounted) return;

      if (!enabled) {
        setSwDisabled(true);
        await clientDisableSW();
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (!mounted) return;
        wireRegistration(reg);

        // Quick check right after register (some browsers keep old SW around)
        if (reg.waiting) setUpdateReady(true);
      } catch {
        // Silent: SW is optional; app must work without it.
      }
    })();

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!swSupported) return null;

  if (swDisabled) {
    return (
      <div className="fixed bottom-3 left-3 right-3 z-50">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-500/30 bg-black/70 p-3 text-sm text-amber-200 shadow-lg">
          PWA-кеш отключён (kill-switch). Обнови страницу.
          <button
            className="ml-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
            onClick={() => window.location.reload()}
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50">
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-500/30 bg-black/70 p-3 text-sm text-amber-200 shadow-lg">
        Есть обновление интерфейса.
        <button
          className="ml-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-100"
          onClick={applyUpdate}
        >
          Обновить
        </button>
      </div>
    </div>
  );
}
