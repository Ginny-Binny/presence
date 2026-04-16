import { request } from 'undici'
import { TtlCache } from './cache.js'
import { log } from './log.js'

// Discord public_flags bitmask. Names match the gateway docs.
// https://discord.com/developers/docs/resources/user#user-object-user-flags
const FLAGS = {
  STAFF: 1 << 0,
  PARTNER: 1 << 1,
  HYPESQUAD: 1 << 2,                  // events organiser
  BUG_HUNTER_LEVEL_1: 1 << 3,
  HYPESQUAD_BRAVERY: 1 << 6,
  HYPESQUAD_BRILLIANCE: 1 << 7,
  HYPESQUAD_BALANCE: 1 << 8,
  EARLY_SUPPORTER: 1 << 9,
  BUG_HUNTER_LEVEL_2: 1 << 14,
  VERIFIED_DEVELOPER: 1 << 17,        // early verified bot dev
  CERTIFIED_MODERATOR: 1 << 18,       // discontinued by Discord but kept
  ACTIVE_DEVELOPER: 1 << 22,
} as const

// Asset hashes Discord serves on its public CDN. These are the published
// values used by every third-party badge renderer (Lanyard, etc). If Discord
// ever rotates them, the badge silently disappears — preferred over bundling
// PNGs in our repo per the user's call.
const BADGE_ASSETS: Record<keyof typeof FLAGS, string> = {
  STAFF: '5e74e9b61934fc1f67c65515d1f7e60d',
  PARTNER: '3f9748e53446a137a052f3454e2de41e',
  HYPESQUAD: 'bf01d1073931f921909045f3a39fd264',
  BUG_HUNTER_LEVEL_1: '2717692c7dca7289b35297368a940dd0',
  HYPESQUAD_BRAVERY: '8a88d63823d8a71cd5e390baa45efa02',
  HYPESQUAD_BRILLIANCE: '011940fd013da3f7fb926e4a1cd2e618',
  HYPESQUAD_BALANCE: 'aa494b3777eb9476c265f8c70b4218a4',
  EARLY_SUPPORTER: '7060786766c9c840eb3019e725d2b358',
  BUG_HUNTER_LEVEL_2: '848f79194d4be5ff5f81505cbd0ce1e6',
  VERIFIED_DEVELOPER: '6df5892e0f35b051f8b61eace34f4967',
  CERTIFIED_MODERATOR: 'fee1624003e2fee35cb398e125dc479b',
  ACTIVE_DEVELOPER: '6bdc42827a38498929a4920da12695d9',
}

// Nitro is signalled by premium_type or animated avatar — separate asset.
const NITRO_ASSET = '2ba85e8026a8614b640c2837bcdfe21b'

const cache = new TtlCache<string>()
const TTL_MS = 24 * 60 * 60 * 1000

export type Badge = { key: string; dataUri: string }

async function fetchBadgeIcon(asset: string): Promise<string | null> {
  const cached = cache.get(asset)
  if (cached) return cached
  try {
    const url = `https://cdn.discordapp.com/badge-icons/${asset}.png`
    const res = await request(url, { headersTimeout: 2000, bodyTimeout: 2000 })
    if (res.statusCode !== 200) {
      log.warn(`badge http ${res.statusCode} ${asset}`)
      return null
    }
    const buf = Buffer.from(await res.body.arrayBuffer())
    const dataUri = `data:image/png;base64,${buf.toString('base64')}`
    cache.set(asset, dataUri, TTL_MS)
    return dataUri
  } catch (err) {
    log.warn('badge fetch failed', (err as Error).message)
    return null
  }
}

export async function resolveBadges(publicFlags: number, premiumType: number, isAnimatedAvatar: boolean): Promise<Badge[]> {
  const matched: { key: string; asset: string }[] = []
  for (const [key, bit] of Object.entries(FLAGS)) {
    if ((publicFlags & bit) === bit) {
      matched.push({ key, asset: BADGE_ASSETS[key as keyof typeof FLAGS] })
    }
  }
  if (premiumType > 0 || isAnimatedAvatar) {
    matched.push({ key: 'NITRO', asset: NITRO_ASSET })
  }
  // Resolve all in parallel; drop ones that failed to fetch.
  const resolved = await Promise.all(
    matched.map(async (m) => {
      const dataUri = await fetchBadgeIcon(m.asset)
      return dataUri ? { key: m.key, dataUri } : null
    }),
  )
  return resolved.filter((b): b is Badge => b !== null)
}
