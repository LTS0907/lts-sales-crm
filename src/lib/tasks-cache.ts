/**
 * Tasks API のレスポンスキャッシュ（同じ serverless インスタンス内で共有）。
 * - GET 時にキャッシュ命中なら Google API を呼ばない（クォータ節約）
 * - POST / PATCH / DELETE 時に clear() で当該ユーザーのキャッシュを破棄
 */
import { createHash } from 'node:crypto'

export type TasksPayload = {
  taskLists: { id: string; title: string }[]
  tasks: Array<Record<string, unknown>>
}

const TTL_MS = 90_000
const QUOTA_BACKOFF_MS = 10 * 60 * 1000

const cache = new Map<string, { ts: number; payload: TasksPayload }>()
const backoff = new Map<string, number>()

export function tokenKey(accessToken: string): string {
  return createHash('sha256').update(accessToken).digest('hex').slice(0, 24)
}

export function getCached(key: string): TasksPayload | null {
  const e = cache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > TTL_MS) {
    cache.delete(key)
    return null
  }
  return e.payload
}

export function getStale(key: string): TasksPayload | null {
  return cache.get(key)?.payload ?? null
}

export function setCached(key: string, payload: TasksPayload) {
  cache.set(key, { ts: Date.now(), payload })
  backoff.delete(key)
}

export function clearCached(key: string) {
  cache.delete(key)
  backoff.delete(key)
}

export function isQuotaBackoff(key: string): boolean {
  const until = backoff.get(key)
  return !!until && Date.now() < until
}

export function startQuotaBackoff(key: string) {
  backoff.set(key, Date.now() + QUOTA_BACKOFF_MS)
}
