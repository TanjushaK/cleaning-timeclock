import { CompatAuthApi } from '@/lib/server/compat/auth-admin'
import { QueryBuilder } from '@/lib/server/compat/query-builder'
import { StorageShim } from '@/lib/server/compat/storage-shim'

export type CompatClient = {
  from: <T = any>(table: string) => QueryBuilder<T>
  auth: CompatAuthApi
  storage: StorageShim
}

const sharedAuth = new CompatAuthApi()
const sharedStorage = new StorageShim()

export function createCompatClient(): CompatClient {
  return {
    from: <T = any>(table: string) => new QueryBuilder<T>(table),
    auth: sharedAuth,
    storage: sharedStorage,
  }
}
