import type Redis from 'ioredis'
import { log } from './log.js'

export type UserProfile = {
  user_id: string
  username: string
  global_name: string | null
  discriminator: string
  avatar: string | null
  avatar_decoration: string | null
  public_flags: number
  premium_type: number
  is_animated_avatar: boolean
  fetched_at: number
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(null) })
  })
}

export async function readUserProfile(redis: Redis, userId: string): Promise<UserProfile | null> {
  const raw = await withTimeout(redis.get(`user:${userId}`), 1000)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserProfile
  } catch (err) {
    log.warn('user profile parse failed', (err as Error).message)
    return null
  }
}
