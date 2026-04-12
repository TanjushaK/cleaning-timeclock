"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import { FetchApiError } from "@/lib/fetch-api-error";
import AppFooter from "@/app/_components/AppFooter";
import { useI18n } from "@/components/I18nProvider";

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSave = useMemo(() => pass1.length >= 8 && pass1 === pass2, [pass1, pass2]);

  useEffect(() => {
    let unsub: { data: { subscription: { unsubscribe: () => void } } } | null = null;

    void (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          }
        }

        const { data } = await supabase.auth.getSession();
        if (data?.session) setReady(true);
      } catch {
        // show open-from-email hint
      }
    })();

    unsub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    return () => {
      unsub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  async function onSave() {
    setErr(null);
    setMsg(null);
    if (!canSave) {
      setErr(t("resetPassword.passRules"));
      return;
    }

    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const at = data?.session?.access_token ? String(data.session.access_token) : null;
      if (!at) throw new Error(t("resetPassword.sessionMissing"));

      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${at}` },
        body: JSON.stringify({ password: pass1 }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; errorCode?: string };
      if (!res.ok) {
        const code = j?.errorCode ? String(j.errorCode) : "";
        if (code) {
          throw new FetchApiError(`admin.api.${code}`, { status: res.status, errorCode: code });
        }
        throw new Error(j?.error || `HTTP ${res.status}`);
      }

      setMsg(t("resetPassword.success"));
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = "/";
      }, 900);
    } catch (e: unknown) {
      setErr(clientWorkerErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="appTheme min-h-screen flex flex-col">
      <div className="mx-auto max-w-md px-5 py-10 flex-1">
        <div className="rounded-3xl border border-amber-400/20 bg-gradient-to-b from-[#0b0b12] to-[#07070b] p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <img src="/tanija-logo.png" alt="" className="h-10 w-10 rounded-xl" />
            <div>
              <div className="text-xl font-semibold tracking-tight text-amber-200">{t("resetPassword.title")}</div>
              <div className="text-sm text-zinc-400">{t("resetPassword.subtitle")}</div>
            </div>
          </div>

          {!ready ? (
            <div className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-300/5 px-4 py-3 text-sm text-zinc-300">{t("resetPassword.openFromEmail")}</div>
          ) : (
            <div className="mt-6 space-y-3">
              <label className="block text-sm text-zinc-300">{t("resetPassword.newPasswordLabel")}</label>
              <input
                value={pass1}
                onChange={(e) => setPass1(e.target.value)}
                placeholder={t("resetPassword.minChars")}
                type="password"
                className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-300/60"
                autoComplete="new-password"
              />

              <label className="block text-sm text-zinc-300">{t("resetPassword.repeatLabel")}</label>
              <input
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                placeholder={t("resetPassword.repeatPlaceholder")}
                type="password"
                className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-300/60"
                autoComplete="new-password"
              />

              <button
                onClick={() => void onSave()}
                disabled={busy || !canSave}
                className="mt-2 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
              >
                {busy ? t("resetPassword.saving") : t("resetPassword.save")}
              </button>

              {msg ? (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{msg}</div>
              ) : null}

              {err ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
              ) : null}
            </div>
          )}

          <a
            href="/"
            className="mt-6 block text-center text-sm text-zinc-400 underline decoration-amber-300/40 underline-offset-4 hover:text-zinc-200"
          >
            {t("resetPassword.home")}
          </a>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
