"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import { apiErrorMessage } from "@/lib/admin-api-message";
import { clearAuthTokens, getAccessToken } from "@/lib/auth-fetch";

function getAccessTokenOrNull(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return getAccessToken();
  } catch {
    return null;
  }
}

export function useAdminAuthFetch() {
  const { t, lang } = useI18n();

  return useCallback(
    async function adminAuthFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
      const token = getAccessTokenOrNull();
      if (!token) throw new Error(t("admin.common.errorNoToken"));

      const ctrl = new AbortController();
      const ms = 15000;
      const timer = setTimeout(() => ctrl.abort(), ms);

      try {
        const sep = url.includes("?") ? "&" : "?";
        const u = `${url}${sep}lang=${encodeURIComponent(lang)}`;
        const res = await fetch(u, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: ctrl.signal,
        });

        const payload = await res.json().catch(() => ({} as any));

        if (res.status === 401) {
          clearAuthTokens();
          throw new Error(t("admin.common.errorSessionExpired"));
        }
        if (!res.ok) {
          throw new Error(apiErrorMessage(t, payload));
        }
        return payload as T;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          throw new Error(t("admin.common.errorRequestTimeout"));
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    [t, lang],
  );
}
