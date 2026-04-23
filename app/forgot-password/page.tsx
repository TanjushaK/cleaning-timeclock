"use client";

import { useMemo, useState } from "react";
import { appAuth } from "@/lib/browser-auth";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import AppFooter from "@/app/_components/AppFooter";
import { useI18n } from "@/components/I18nProvider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canSend = useMemo(() => email.trim().length >= 5 && email.includes("@"), [email]);

  async function onSend() {
    setErr(null);
    setMsg(null);
    if (!canSend) {
      setErr(t("forgotPassword.needEmail"));
      return;
    }

    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { data, error } = await appAuth.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      const delivery = data?.delivery;
      if (delivery === "sent") setMsg(t("forgotPassword.successEmailSent"));
      else if (delivery === "dev_log") setMsg(t("forgotPassword.deliveryDevLog"));
      else setMsg(t("forgotPassword.requestAck"));
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
              <div className="text-xl font-semibold tracking-tight text-amber-200">{t("forgotPassword.title")}</div>
              <div className="text-sm text-zinc-400">{t("forgotPassword.subtitle")}</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm text-zinc-300">{t("forgotPassword.emailLabel")}</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("forgotPassword.emailPlaceholder")}
              className="w-full rounded-2xl border border-amber-400/20 bg-black/40 px-4 py-3 text-zinc-100 outline-none transition focus:border-amber-300/60"
              autoComplete="email"
              inputMode="email"
            />

            <button
              onClick={() => void onSend()}
              disabled={busy || !canSend}
              className="mt-2 w-full rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 font-semibold text-amber-200 transition hover:bg-amber-300/15 disabled:opacity-50"
            >
              {busy ? t("forgotPassword.sending") : t("forgotPassword.send")}
            </button>

            <a
              href="/"
              className="block text-center text-sm text-zinc-400 underline decoration-amber-300/40 underline-offset-4 hover:text-zinc-200"
            >
              {t("forgotPassword.backToLogin")}
            </a>

            {msg ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{msg}</div>
            ) : null}

            {err ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{err}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-zinc-500">
          {t("forgotPassword.redirectHint")} <span className="text-zinc-300">/reset-password</span>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
