import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { mustEnv } from '@/lib/server/env'

declare global {
  var __timeclockPool: Pool | undefined
}

function createPool(): Pool {
  return new Pool({
    connectionString: mustEnv('DATABASE_URL'),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

export function getPool(): Pool {
  if (!global.__timeclockPool) {
    global.__timeclockPool = createPool()
  }
  return global.__timeclockPool
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values)
}
