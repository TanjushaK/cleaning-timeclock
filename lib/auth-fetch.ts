import { supabase } from '@/lib/supabase';

type AnyJson = Record<string, any>;

export async function authFetchJson<T = AnyJson>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    // Важно: убрали токсичную техничку про Bearer
    throw new Error('Нужно войти (нет активной сессии)');
  }

  const headers = new Headers(init?.headers || {});
  headers.set('authorization', `Bearer ${token}`);

  // если отправляем строковый body и не задан content-type — поставим JSON
  if (!headers.has('content-type') && typeof init?.body === 'string') {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(input, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = raw ? { error: raw } : null;
  }

  if (!res.ok) {
    const msg =
      json?.error ||
      json?.message ||
      (raw ? String(raw) : '') ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (json ?? ({} as any)) as T;
}
