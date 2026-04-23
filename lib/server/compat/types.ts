export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type AppUser = {
  id: string
  email: string | null
  phone: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  user_metadata: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
}

export type AuthSession = {
  access_token: string
  refresh_token: string | null
  user: AppUser
}

export type CompatResponse<T> = {
  data: T | null
  error: { message: string } | null
}

export type CompatListUsersResponse = {
  users: AppUser[]
}

export type StorageListItem = {
  name: string
  created_at: string | null
}

export type StorageSignedUrl = {
  path: string
  signedUrl: string
}

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED'
