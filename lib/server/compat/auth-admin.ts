import type { AppUser, CompatListUsersResponse, CompatResponse } from '@/lib/server/compat/types'
import { createAccessToken } from '@/lib/auth/jwt'
import { createUser, deleteUserById, getUserByEmail, getUserById, getUserByPhone, listUsers, updateUserById } from '@/lib/auth/user-store'
import { issueRefreshToken, revokeRefreshSessionsForUser } from '@/lib/auth/refresh-store'
import { verifyPassword } from '@/lib/auth/password'

function ok<T>(data: T): CompatResponse<T> {
  return { data, error: null }
}

function fail<T>(message: string): CompatResponse<T> {
  return { data: null, error: { message } }
}

export class CompatAuthAdminApi {
  async createUser(input: {
    id?: string
    email?: string
    phone?: string
    password: string
    email_confirm?: boolean
    phone_confirm?: boolean
    user_metadata?: Record<string, unknown>
  }): Promise<CompatResponse<{ user: AppUser }>> {
    try {
      if (input.email) {
        const exists = await getUserByEmail(input.email)
        if (exists && !exists.deleted_at) return fail('User already exists')
      }
      if (input.phone) {
        const exists = await getUserByPhone(input.phone)
        if (exists && !exists.deleted_at) return fail('User already exists')
      }
      const user = await createUser(input)
      return ok({ user })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Create user failed')
    }
  }

  async updateUserById(id: string, patch: {
    email?: string
    phone?: string
    password?: string
    email_confirm?: boolean
    phone_confirm?: boolean
    user_metadata?: Record<string, unknown>
  }): Promise<CompatResponse<{ user: AppUser }>> {
    try {
      const user = await updateUserById(id, patch)
      if (!user) return fail('User not found')
      if (patch.password) await revokeRefreshSessionsForUser(id)
      return ok({ user })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Update user failed')
    }
  }

  async getUserById(id: string): Promise<CompatResponse<{ user: AppUser }>> {
    try {
      const user = await getUserById(id)
      if (!user || user.deleted_at) return fail('User not found')
      return ok({ user })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'User lookup failed')
    }
  }

  async listUsers(options?: { page?: number; perPage?: number }): Promise<CompatResponse<CompatListUsersResponse>> {
    try {
      const users = await listUsers(options?.page, options?.perPage)
      return ok({ users })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'List users failed')
    }
  }

  async deleteUser(id: string): Promise<CompatResponse<{ user: null }>> {
    try {
      const deleted = await deleteUserById(id)
      await revokeRefreshSessionsForUser(id)
      if (!deleted) return fail('User not found')
      return ok({ user: null })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Delete user failed')
    }
  }
}

export class CompatAuthApi {
  readonly admin = new CompatAuthAdminApi()

  async signInWithPassword(credentials: { email?: string; phone?: string; password: string }): Promise<CompatResponse<{ session: { access_token: string; refresh_token: string }; user: AppUser }>> {
    try {
      const user = credentials.email ? await getUserByEmail(credentials.email) : credentials.phone ? await getUserByPhone(credentials.phone) : null
      if (!user || user.deleted_at) return fail('Invalid credentials')
      const okPassword = await verifyPassword(credentials.password, user.password_hash)
      if (!okPassword) return fail('Invalid credentials')
      const publicUser: AppUser = {
        id: user.id,
        email: user.email,
        phone: user.phone,
        email_confirmed_at: user.email_confirmed_at,
        phone_confirmed_at: user.phone_confirmed_at,
        user_metadata: user.user_metadata,
        created_at: user.created_at,
        updated_at: user.updated_at,
      }
      const access_token = await createAccessToken(publicUser, null)
      const refresh_token = await issueRefreshToken(user.id)
      return ok({ session: { access_token, refresh_token }, user: publicUser })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Login failed')
    }
  }

  async getUser(token: string): Promise<CompatResponse<{ user: AppUser }>> {
    try {
      const { verifyAccessToken } = await import('@/lib/auth/jwt')
      const payload = await verifyAccessToken(token)
      const user = await getUserById(payload.sub)
      if (!user || user.deleted_at) return fail('Invalid or expired token')
      return ok({
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          email_confirmed_at: user.email_confirmed_at,
          phone_confirmed_at: user.phone_confirmed_at,
          user_metadata: user.user_metadata,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      })
    } catch {
      return fail('Invalid or expired token')
    }
  }

  async refreshSession({ refresh_token }: { refresh_token: string }): Promise<CompatResponse<{ session: { access_token: string; refresh_token: string }; user: AppUser }>> {
    try {
      const { refreshAuthSession } = await import('@/lib/auth/login-service')
      const session = await refreshAuthSession(refresh_token)
      if (!session) return fail('session refresh failed')
      return ok({ session: { access_token: session.access_token, refresh_token: session.refresh_token || '' }, user: session.user })
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'session refresh failed')
    }
  }
}
