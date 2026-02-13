import { createClient } from '@supabase/supabase-js';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new ApiError(500, `Нет env: ${name}`);
  return v;
}

export function supabaseService() {
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function supabaseAnon() {
  const url = mustEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = mustEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function getBearer(h: Headers) {
  const a = h.get('authorization') || h.get('Authorization') || '';
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || '';
}

export async function requireUser(reqOrHeaders: Request | Headers) {
  const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : reqOrHeaders.headers;
  const token = getBearer(headers);
  if (!token) throw new ApiError(401, 'Нет токена (Authorization: Bearer ...)');

  const anon = supabaseAnon();
  const { data, error } = await anon.auth.getUser(token);

  if (error || !data?.user?.id) throw new ApiError(401, 'Сессия невалидна');

  const supabase = supabaseService();
  const admin: any = (supabase as any).auth?.admin;

  return { userId: data.user.id, supabase, admin };
}

export async function requireAdmin(reqOrHeaders: Request | Headers) {
  const { userId, supabase, admin } = await requireUser(reqOrHeaders);

  const { data, error } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Не смог прочитать profiles');
  if (!data || data.role !== 'admin' || data.active === false) throw new ApiError(403, 'Нет прав админа');

  return { userId, supabase, admin };
}
