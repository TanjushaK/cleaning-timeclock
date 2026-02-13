import { supabase } from '@/lib/supabase';

export type ApiJson = Record<string, any>;

export async function authFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');

  // Авто content-type для JSON body
  const hasBody = typeof init.body === 'string' || init.body instanceof Blob || init.body instanceof FormData;
  if (hasBody && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function authFetchJson<T = ApiJson>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await authFetch(input, init);
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      (json && (json.error || json.message)) ||
      `HTTP ${res.status} ${res.statusText}` ||
      'Ошибка запроса';
    throw new Error(String(msg));
  }

  return (json ?? ({} as any)) as T;
}
