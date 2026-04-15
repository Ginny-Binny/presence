import type { IncomingMessage, ServerResponse } from 'node:http'
import type Redis from 'ioredis'
import { log } from './log.js'
import { readPresence } from './presence.js'
import { fetchWakapiStats } from './wakapi.js'
import { fetchAvatarDataUri } from './avatar.js'
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
  // Fan out all three lookups in parallel; allSettled means a single failure
  // never poisons the response.
  const [presenceR, statsR] = await Promise.allSettled([
    readPresence(deps.redis, deps.userId),
    fetchWakapiStats(deps.wakapiUrl, deps.wakapiKey),
  ])
  const presence = presenceR.status === 'fulfilled' ? presenceR.value : null
  const stats = statsR.status === 'fulfilled' ? statsR.value : null

  // Avatar fetch depends on the presence payload, so run it after.
  const avatarDataUri = presence
    ? await settled(fetchAvatarDataUri(presence.user_id, presence.avatar))
    : null

  const svg = renderCard({
    presence,
    stats,
    avatarDataUri,
    width: deps.svgWidth,
    fallbackUserId: deps.userId,
  })

  const headers = {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'public, max-age=30',
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
