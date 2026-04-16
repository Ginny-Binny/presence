import { request } from 'undici'
import { TtlCache } from './cache.js'
import { log } from './log.js'

const cache = new TtlCache<string>()
const TTL_MS = 60 * 60 * 1000

// Activity assets come in two flavors:
//   1. Plain app-asset id like "1359299015484768338" — served from
//      cdn.discordapp.com/app-assets/<application_id>/<id>.png
//   2. Prefixed external asset like "spotify:ab67616d0000b273..." or
//      "mp:external/..." — serve directly from the prefixed CDN.
async function resolveAssetUrl(applicationId: string | null, raw: string): Promise<string | null> {
  if (raw.startsWith('spotify:')) {
    const id = raw.slice('spotify:'.length)
    return `https://i.scdn.co/image/${id}`
  }
  if (raw.startsWith('mp:external/')) {
    // Format: mp:external/<hash>/https/<host>/<path>
    const rest = raw.slice('mp:external/'.length)
    const parts = rest.split('/')
    if (parts.length < 4) return null
    const proto = parts[1] // https
    const host = parts[2]
    const path = parts.slice(3).join('/')
    return `${proto}://${host}/${path}`
  }
  if (raw.startsWith('mp:')) {
    return `https://media.discordapp.net/${raw.slice('mp:'.length)}`
  }
  if (!applicationId) return null
  return `https://cdn.discordapp.com/app-assets/${applicationId}/${raw}.png`
}

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await request(url, { headersTimeout: 2000, bodyTimeout: 2000 })
    if (res.statusCode !== 200) {
      log.warn(`activity asset http ${res.statusCode} ${url}`)
      return null
    }
    const buf = Buffer.from(await res.body.arrayBuffer())
    // Discord stamps PNGs; Spotify/external can be JPEG. PNG works for both
    // when the SVG just embeds via data URI — browsers sniff the bytes.
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch (err) {
    log.warn('activity asset fetch failed', (err as Error).message)
    return null
  }
}

export async function fetchActivityAsset(applicationId: string | null, raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null
  const key = `aasset:${applicationId ?? 'ext'}:${raw}`
  const cached = cache.get(key)
  if (cached) return cached
  const url = await resolveAssetUrl(applicationId, raw)
  if (!url) return null
  const dataUri = await fetchAsDataUri(url)
  if (dataUri) cache.set(key, dataUri, TTL_MS)
  return dataUri
}
