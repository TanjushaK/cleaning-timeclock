import { createCompatClient, type CompatClient } from '@/lib/server/compat/client'

let _admin: CompatClient | null = null

export function getDbAdmin(): CompatClient {
  if (!_admin) _admin = createCompatClient()
  return _admin
}
