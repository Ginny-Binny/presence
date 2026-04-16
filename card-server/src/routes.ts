import type { IncomingMessage, ServerResponse } from 'node:http'
import type Redis from 'ioredis'
import { log } from './log.js'
import { readPresence } from './presence.js'
import { fetchWakapiStats } from './wakapi.js'
import { fetchAvatarDataUri, fetchDecorationDataUri } from './avatar.js'
import { fetchActivityAsset } from './activityasset.js'
import { resolveBadges } from './badges.js'
import { readUserProfile } from './userprofile.js'
import { renderCard } from './renderer.js'

type Deps = {
  redis: Redis
  userId: string
  wakapiUrl: string
  wakapiKey: string
  svgWidth: number
}

async function settled<T>(p: Promise<T>): Promise<T | null> {
  try { return await p } catch { return null }
}

export async function handleHealthz(_req: IncomingMessage, res: ServerResponse, deps: Deps) {
  const redisOk = await settled(deps.redis.ping().then(() => true))
  let wakapiOk: boolean | null = null
  try {
    const r = await fetch(`${deps.wakapiUrl.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(500) })
    wakapiOk = r.ok
  } catch { wakapiOk = false }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ redis: redisOk ? 'ok' : 'down', wakapi: wakapiOk ? 'ok' : 'down' }))
}

export async function handleCard(req: IncomingMessage, res: ServerResponse, deps: Deps) {
  // Stage 1: presence + profile + stats — independent, fan out in parallel.
  const [presenceR, profileR, statsR] = await Promise.allSettled([
    readPresence(deps.redis, deps.userId),
    readUserProfile(deps.redis, deps.userId),
    fetchWakapiStats(deps.wakapiUrl, deps.wakapiKey),
  ])
  const presence = presenceR.status === 'fulfilled' ? presenceR.value : null
  const profile = profileR.status === 'fulfilled' ? profileR.value : null
  const stats = statsR.status === 'fulfilled' ? statsR.value : null

  // Stage 2: derived assets that depend on stage 1 — also parallel.
  const liveActivity = presence?.activities.find((a) => a.type !== 4 && !!a.name)
  const [avatarDataUri, decorationDataUri, badges, activityLargeDataUri, activitySmallDataUri] =
    await Promise.all([
      settled(fetchAvatarDataUri(deps.userId, profile?.avatar ?? presence?.avatar ?? null)),
      settled(fetchDecorationDataUri(profile?.avatar_decoration ?? null)),
      profile
        ? settled(resolveBadges(profile.public_flags, profile.premium_type, profile.is_animated_avatar)).then((b) => b ?? [])
        : Promise.resolve([]),
      liveActivity
        ? settled(fetchActivityAsset(liveActivity.application_id ?? null, liveActivity.assets?.large_image))
        : Promise.resolve(null),
      liveActivity
        ? settled(fetchActivityAsset(liveActivity.application_id ?? null, liveActivity.assets?.small_image))
        : Promise.resolve(null),
    ])

  const svg = renderCard({
    presence,
    profile,
    stats,
    avatarDataUri,
    decorationDataUri,
    badges: badges ?? [],
    activityLargeDataUri,
    activitySmallDataUri,
    width: deps.svgWidth,
    fallbackUserId: deps.userId,
  })

  // 5s max-age — browsers will refetch quickly. GitHub's camo proxy still
  // caches more aggressively at the edge, so README embeds will lag this.
  const headers = {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'public, max-age=5, s-maxage=5',
    'access-control-allow-origin': '*',
  }
  if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return }
  res.writeHead(200, headers)
  res.end(svg)
}

export function notFound(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
}

export function serverError(_req: IncomingMessage, res: ServerResponse, err: unknown) {
  log.error('handler error', (err as Error).message)
  if (res.headersSent) { try { res.end() } catch { /* ignore */ } return }
  res.writeHead(500, { 'content-type': 'text/plain' })
  res.end('internal error')
}
