import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function supabaseService(): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function supabaseAnon(accessToken?: string): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_ANON_KEY');

  return createClient(url, key, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function extractBearer(headers: Headers): string | null {
  const h = headers.get('authorization') || headers.get('Authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function requireUser(input: Request | Headers): Promise<{
  userId: string;
  supabase: SupabaseClient;
  admin: any;
}> {
  const headers = input instanceof Headers ? input : input.headers;
  const token = extractBearer(headers);

  if (!token) throw new ApiError(401, 'Нет токена. Нужен Authorization: Bearer ...');

  const anon = supabaseAnon(token);
  const { data, error } = await anon.auth.getUser();

  if (error || !data?.user?.id) {
    throw new ApiError(401, 'Сессия недействительна. Перелогиньтесь.');
  }

  const svc = supabaseService();
  const admin = (svc.auth as any).admin as any;

  return { userId: data.user.id, supabase: svc, admin };
}

export async function requireAdmin(input: Request | Headers): Promise<{
  userId: string;
  supabase: SupabaseClient;
  admin: any;
}> {
  const { userId, supabase, admin } = await requireUser(input);

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Не смог прочитать profiles');
  if (!data) throw new ApiError(403, 'Профиль не найден');
  if (data.role !== 'admin') throw new ApiError(403, 'Доступ только для админа');
  if (data.active !== true) throw new ApiError(403, 'Админ отключён (active=false)');

  return { userId, supabase, admin };
}
