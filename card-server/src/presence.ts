import type Redis from 'ioredis'
import { log } from './log.js'

export type Activity = {
  type: number
  name?: string
  details?: string | null
  state?: string | null
  emoji?: { name?: string } | null
  timestamps?: { start?: number; end?: number } | null
}

export type Presence = {
  status: 'online' | 'idle' | 'dnd' | 'offline'
  activities: Activity[]
  user_id: string
  username: string | null
  avatar: string | null
  updated_at: number
  stale: boolean
}

const STALE_AFTER_MS = 5 * 60 * 1000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(null) })
  })
}

export async function readPresence(redis: Redis, userId: string): Promise<Presence | null> {
  const raw = await withTimeout(redis.get(`presence:${userId}`), 1000)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Presence
    parsed.stale = Date.now() - parsed.updated_at > STALE_AFTER_MS
    return parsed
  } catch (err) {
    log.warn('presence parse failed', (err as Error).message)
    return null
  }
}
