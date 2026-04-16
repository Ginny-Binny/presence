import type Redis from 'ioredis'
import { log } from './log.js'

// Discord REST returns much richer user info than gateway PRESENCE_UPDATE —
// avatar hash, public_flags (badges), decoration, premium type, etc. We poll
// every 10 min so badge/avatar changes show up without restarting the bot.

type DiscordUser = {
  id: string
  username: string
  global_name: string | null
  discriminator: string
  avatar: string | null
  banner: string | null
  accent_color: number | null
  public_flags: number
  premium_type: number
  avatar_decoration_data: { asset: string; sku_id: string } | null
  // Clan tag / Guild Identity feature (Discord 2024). Separate from public_flags —
  // this is what renders as the "CODE" / guild-name pill next to a username.
  primary_guild: {
    identity_guild_id: string | null
    tag: string | null
    badge: string | null
    identity_enabled: boolean | null
  } | null
}

export type StoredUser = {
  user_id: string
  username: string
  global_name: string | null
  discriminator: string
  avatar: string | null
  avatar_decoration: string | null
  public_flags: number
  premium_type: number
  is_animated_avatar: boolean
  clan_guild_id: string | null
  clan_tag: string | null
  clan_badge: string | null
  fetched_at: number
}

const REFRESH_MS = 10 * 60 * 1000

export async function fetchAndStore(redis: Redis, token: string, userId: string): Promise<void> {
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      log.warn(`user fetch http ${res.status}`)
      return
    }
    const u = (await res.json()) as DiscordUser
    // Clan fields only count when the user has opted into guild identity,
    // otherwise Discord still sends the object but without a tag.
    const clan = u.primary_guild?.identity_enabled ? u.primary_guild : null
    const stored: StoredUser = {
      user_id: u.id,
      username: u.username,
      global_name: u.global_name,
      discriminator: u.discriminator,
      avatar: u.avatar,
      avatar_decoration: u.avatar_decoration_data?.asset ?? null,
      public_flags: u.public_flags ?? 0,
      premium_type: u.premium_type ?? 0,
      // Animated avatar hashes start with `a_` — used as a Nitro signal.
      is_animated_avatar: !!u.avatar?.startsWith('a_'),
      clan_guild_id: clan?.identity_guild_id ?? null,
      clan_tag: clan?.tag ?? null,
      clan_badge: clan?.badge ?? null,
      fetched_at: Date.now(),
    }
    await redis.set(`user:${userId}`, JSON.stringify(stored))
    log.info(`user profile cached: ${stored.username} (flags=${stored.public_flags})`)
  } catch (err) {
    log.warn('user fetch failed', (err as Error).message)
  }
}

export function startUserProfileLoop(redis: Redis, token: string, userId: string): void {
  // Initial fetch immediately, then every 10 min.
  void fetchAndStore(redis, token, userId)
  setInterval(() => { void fetchAndStore(redis, token, userId) }, REFRESH_MS)
}
