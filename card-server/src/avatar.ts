import { request } from 'undici'
import { TtlCache } from './cache.js'
import { log } from './log.js'

const cache = new TtlCache<string>()
const TTL_MS = 24 * 60 * 60 * 1000

async function fetchAsDataUri(url: string, mime: string): Promise<string | null> {
  try {
    const res = await request(url, {
      method: 'GET',
      headersTimeout: 2000,
      bodyTimeout: 2000,
    })
    if (res.statusCode !== 200) {
      log.warn(`asset http ${res.statusCode} ${url}`)
      return null
    }
    const buf = Buffer.from(await res.body.arrayBuffer())
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    log.warn('asset fetch failed', (err as Error).message)
    return null
  }
}

export async function fetchAvatarDataUri(userId: string, hash: string | null): Promise<string | null> {
  if (!hash) return null
  const key = `avatar:${userId}:${hash}`
  const cached = cache.get(key)
  if (cached) return cached
  // Animated avatars come down as GIF; static ones as PNG. We always request
  // PNG since SVG renderers handle it most reliably.
  const url = `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=128`
  const dataUri = await fetchAsDataUri(url, 'image/png')
  if (dataUri) cache.set(key, dataUri, TTL_MS)
  return dataUri
}

// Decoration is a separate WebP overlaid on top of the avatar. We strip the
// `v_` prefix Discord uses for asset versioning since the CDN accepts both.
export async function fetchDecorationDataUri(asset: string | null): Promise<string | null> {
  if (!asset) return null
  const key = `decoration:${asset}`
  const cached = cache.get(key)
  if (cached) return cached
  const url = `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=128&passthrough=false`
  const dataUri = await fetchAsDataUri(url, 'image/png')
  if (dataUri) cache.set(key, dataUri, TTL_MS)
  return dataUri
}

export function initialsColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0
  const palette = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#9b59b6', '#e67e22']
  return palette[Math.abs(h) % palette.length]
}
