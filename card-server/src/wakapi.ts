import { request } from 'undici'
import { TtlCache } from './cache.js'
import { log } from './log.js'

export type Stats = {
  languages: { name: string; hours: number }[]
  totalHours: number
}

const cache = new TtlCache<Stats>()
const KEY = 'last_7_days'
const FRESH_MS = 5 * 60 * 1000

let lastAuthWarnAt = 0
function warnAuthRateLimited() {
  const now = Date.now()
  if (now - lastAuthWarnAt > 60 * 60 * 1000) {
    log.warn('wakapi auth failed (401) — check WAKAPI_API_KEY')
    lastAuthWarnAt = now
  }
}

export async function fetchWakapiStats(baseUrl: string, apiKey: string): Promise<Stats | null> {
  const cached = cache.get(KEY)
  if (cached) return cached

  const url = `${baseUrl.replace(/\/$/, '')}/api/compat/wakatime/v1/users/current/stats/last_7_days`
  const auth = 'Basic ' + Buffer.from(apiKey).toString('base64')

  try {
    const res = await request(url, {
      method: 'GET',
      headers: { authorization: auth, accept: 'application/json' },
      headersTimeout: 2000,
      bodyTimeout: 2000,
    })
    if (res.statusCode === 401) { warnAuthRateLimited(); return cache.getStale(KEY) }
    if (res.statusCode >= 400) {
      log.warn(`wakapi http ${res.statusCode}`)
      return cache.getStale(KEY)
    }
    const body = (await res.body.json()) as { data?: { languages?: { name: string; total_seconds: number }[]; total_seconds?: number } }
    const rawLangs = body.data?.languages ?? []
    // Merge "Unknown" time into C++ so it doesn't clutter the stats bar.
    let cppHours = 0
    const filtered = rawLangs.filter((l) => {
      if (l.name.toLowerCase() === 'unknown') { cppHours += l.total_seconds / 3600; return false }
      return true
    })
    const merged = filtered.map((l) =>
      l.name.toLowerCase() === 'c++' ? { name: 'C++', hours: l.total_seconds / 3600 + cppHours } : { name: l.name, hours: l.total_seconds / 3600 },
    )
    // If C++ didn't exist in the list but Unknown did, add it.
    if (cppHours > 0 && !filtered.some((l) => l.name.toLowerCase() === 'c++')) {
      merged.push({ name: 'C++', hours: cppHours })
    }
    // Sort by hours descending so the biggest bar is on top.
    merged.sort((a, b) => b.hours - a.hours)
    const stats: Stats = {
      languages: merged,
      totalHours: (body.data?.total_seconds ?? 0) / 3600,
    }
    cache.set(KEY, stats, FRESH_MS)
    return stats
  } catch (err) {
    log.warn('wakapi fetch failed', (err as Error).message)
    return cache.getStale(KEY)
  }
}
