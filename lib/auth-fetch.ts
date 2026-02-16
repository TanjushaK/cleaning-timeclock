import { supabase } from "@/lib/supabase";

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers ?? {});
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function authFetchJson<T = any>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set("accept", "application/json");

  // Если body уже строка — считаем что это JSON
  const body = init.body;
  const isJsonBody = typeof body === "string";

  if (isJsonBody) headers.set("content-type", "application/json");

  const res = await authFetch(url, { ...init, headers });

  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  let payload: any = null;
  if (ct.includes("application/json")) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const msg =
      payload?.error ||
      payload?.message ||
      (text?.trim() ? text : `HTTP ${res.status}`);
    throw new Error(msg);
  }

  if (!ct.includes("application/json")) {
    // чтобы не молча падать на HTML/текст
    return (text as unknown) as T;
  }

  return payload as T;
}
