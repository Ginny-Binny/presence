import { request } from 'undici'
import { TtlCache } from './cache.js'
import { log } from './log.js'

const cache = new TtlCache<string>()
const TTL_MS = 24 * 60 * 60 * 1000

export async function fetchAvatarDataUri(userId: string, hash: string | null): Promise<string | null> {
  if (!hash) return null
  const key = `${userId}:${hash}`
  const cached = cache.get(key)
  if (cached) return cached

  const url = `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=128`
  try {
    const res = await request(url, {
      method: 'GET',
      headersTimeout: 2000,
      bodyTimeout: 2000,
    })
    if (res.statusCode !== 200) {
      log.warn(`avatar http ${res.statusCode}`)
      return null
    }
    const buf = Buffer.from(await res.body.arrayBuffer())
    const dataUri = `data:image/png;base64,${buf.toString('base64')}`
    cache.set(key, dataUri, TTL_MS)
    return dataUri
  } catch (err) {
    log.warn('avatar fetch failed', (err as Error).message)
    return null
  }
}

// Deterministic background color for the initials fallback. Same user_id always
// gets the same color so the card doesn't flicker between renders.
export function initialsColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0
  const palette = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#9b59b6', '#e67e22']
  return palette[Math.abs(h) % palette.length]
}
