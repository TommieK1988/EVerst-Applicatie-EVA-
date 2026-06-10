/**
 * Directe Postgres-pool naar Supabase.
 *
 * Gebruikt voor bulk-writes (ULU trips) zodat we het PostgREST schema-cache-
 * probleem volledig omzeilen. De Supabase JS client (PostgREST) blijft
 * voor reads gebruikt.
 *
 * Verwacht env-variable DATABASE_URL — de Supabase "Connection string"
 * uit Project Settings → Database. Gebruik de "Transaction pooler" (port 6543)
 * zodat we geen verbindingen openhouden in serverless-omgevingen.
 */

import { Pool, type PoolConfig } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __wagenparkPgPool: Pool | undefined
}

function buildPool(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL ontbreekt. Zet de Supabase connection string ' +
        '(Project Settings → Database → Connection string) in .env.local.',
    )
  }

  const config: PoolConfig = {
    connectionString: url,
    // Supabase pooler ondersteunt TLS; leeg ssl-object accepteert self-signed niet
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
  }
  return new Pool(config)
}

/** Singleton pool — voorkom reconnect-storm tijdens Next.js hot-reload. */
export function getPgPool(): Pool {
  if (!globalThis.__wagenparkPgPool) {
    globalThis.__wagenparkPgPool = buildPool()
  }
  return globalThis.__wagenparkPgPool
}

/**
 * Convenience: voer een query uit en geef rijen terug.
 */
export async function pgQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = getPgPool()
  const res = await pool.query<T>(sql, params)
  return res.rows
}
