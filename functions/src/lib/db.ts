import type { D1Database } from '../types'

export const uuid = () => crypto.randomUUID()
export const now = () => new Date().toISOString()

export async function one<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  return db
    .prepare(sql)
    .bind(...binds)
    .first<T>()
}

export async function all<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<T>()
  return res.results
}

export async function run(db: D1Database, sql: string, ...binds: unknown[]) {
  return db
    .prepare(sql)
    .bind(...binds)
    .run()
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
