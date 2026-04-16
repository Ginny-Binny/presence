import type Redis from 'ioredis'
import { log } from './log.js'

type Activity = {
  type: number
  name?: string
  details?: string | null
  state?: string | null
  application_id?: string | null
  emoji?: { name?: string; id?: string | null } | null
  timestamps?: { start?: number; end?: number } | null
  assets?: {
    large_image?: string | null
    large_text?: string | null
    small_image?: string | null
    small_text?: string | null
  } | null
}

type RawPresence = {
  user: { id: string; username?: string; avatar?: string | null; global_name?: string | null }
  status: 'online' | 'idle' | 'dnd' | 'offline'
  activities?: Activity[]
  client_status?: { desktop?: string; mobile?: string; web?: string }
}

export type StoredPresence = {
  status: RawPresence['status']
  activities: Activity[]
  client_status: NonNullable<RawPresence['client_status']>
  user_id: string
  username: string | null
  avatar: string | null
  updated_at: number
}

function normalizeActivity(a: Activity): Activity {
  // Custom status (type 4) carries only state + emoji; strip the rest.
  if (a.type === 4) return { type: 4, name: a.name, state: a.state ?? null, emoji: a.emoji ?? null }
  return {
    type: a.type,
    name: a.name,
    details: a.details ?? null,
    state: a.state ?? null,
    application_id: a.application_id ?? null,
    timestamps: a.timestamps ?? null,
    assets: a.assets ?? null,
  }
}

export function normalize(raw: RawPresence): StoredPresence {
  return {
    status: raw.status,
    activities: (raw.activities ?? []).map(normalizeActivity),
    client_status: raw.client_status ?? {},
    user_id: raw.user.id,
    username: raw.user.global_name ?? raw.user.username ?? null,
    avatar: raw.user.avatar ?? null,
    updated_at: Date.now(),
  }
}

export async function writePresence(redis: Redis, userId: string, raw: RawPresence) {
  if (raw.user.id !== userId) return
  const payload = normalize(raw)
  try {
    await redis.set(`presence:${userId}`, JSON.stringify(payload))
    log.debug(`presence written: ${payload.status}`)
  } catch (err) {
    log.warn('presence write failed', (err as Error).message)
  }
}
