import { request } from 'undici'
import { TtlCache } from './cache.js'
import { log } from './log.js'

const cache = new TtlCache<string>()
const TTL_MS = 24 * 60 * 60 * 1000

// Discord clan/guild-identity badges live on their own CDN path. Unlike app
// assets, the URL only needs the guild id + badge hash.
export async function fetchClanBadgeDataUri(guildId: string | null, badgeHash: string | null): Promise<string | null> {
  if (!guildId || !badgeHash) return null
  const key = `clan:${guildId}:${badgeHash}`
  const cached = cache.get(key)
  if (cached) return cached
  const url = `https://cdn.discordapp.com/clan-badges/${guildId}/${badgeHash}.png?size=32`
  try {
    const res = await request(url, { headersTimeout: 2000, bodyTimeout: 2000 })
    if (res.statusCode !== 200) {
      log.warn(`clan badge http ${res.statusCode}`)
      return null
    }
    const buf = Buffer.from(await res.body.arrayBuffer())
    const dataUri = `data:image/png;base64,${buf.toString('base64')}`
    cache.set(key, dataUri, TTL_MS)
    return dataUri
  } catch (err) {
    log.warn('clan badge fetch failed', (err as Error).message)
    return null
  }
}
