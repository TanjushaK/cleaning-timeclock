"use client";

import { useEffect, useState } from "react";
import { appAuth } from "@/lib/browser-auth";
import { clientWorkerErrorMessage } from "@/lib/app-api-message";
import { setAuthTokens } from "@/lib/auth-fetch";
import AppWorkerShell from "@/app/_components/AppWorkerShell";
import { useI18n } from "@/components/I18nProvider";

export default function AuthCallbackPage() {
  const { t } = useI18n();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await appAuth.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await appAuth.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
          }
        }

        const { data, error: sErr } = await appAuth.auth.getSession();
        if (sErr) throw sErr;
        const session = data?.session;
        if (!session?.access_token) throw new Error(t("errors.tokenMissing"));

        setAuthTokens(session.access_token, session.refresh_token || null);

        window.location.replace("/");
      } catch (e: unknown) {
        setMsg(t("authCallback.loginError", { detail: clientWorkerErrorMessage(t, e) }));
      }
    })();
  }, [t]);

  return (
    <AppWorkerShell mainClassName="p-6">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/20 bg-zinc-950/60 p-6 shadow-xl">
          <div className="text-sm opacity-80">{msg ?? t("authCallback.loading")}</div>
        </div>
      </div>
    </AppWorkerShell>
  );
}
