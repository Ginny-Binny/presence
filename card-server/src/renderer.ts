import type { Presence, Activity } from './presence.js'
import type { Stats } from './wakapi.js'
import { initialsColor } from './avatar.js'

const STATUS_COLORS: Record<Presence['status'], string> = {
  online: '#43b581',
  idle: '#faa61a',
  dnd: '#f04747',
  offline: '#747f8d',
}

const ACTIVITY_PREFIX: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  5: 'Competing in',
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

function formatActivity(a: Activity): string | null {
  // Custom status: just the state text (no prefix).
  if (a.type === 4) {
    const emoji = a.emoji?.name ? `${a.emoji.name} ` : ''
    return a.state ? `${emoji}${a.state}` : null
  }
  if (!a.name) return null
  const prefix = ACTIVITY_PREFIX[a.type] ?? ''
  // VS Code presence uses details for filename, state for workspace.
  const detail = a.details ? ` — ${a.details}` : ''
  return `${prefix} ${a.name}${detail}`.trim()
}

function pickActivity(activities: Activity[]): string | null {
  // Custom status is the most informative when present, but a "real" activity
  // (game / IDE / music) is more interesting if both exist.
  const real = activities.find((a) => a.type !== 4)
  if (real) {
    const formatted = formatActivity(real)
    if (formatted) return formatted
  }
  const custom = activities.find((a) => a.type === 4)
  if (custom) return formatActivity(custom)
  return null
}

function formatHours(total: number): string {
  if (!isFinite(total) || total <= 0) return '0h this week'
  const h = Math.floor(total)
  const m = Math.floor((total - h) * 60)
  return `${h}h ${m}m this week`
}

type RenderInput = {
  presence: Presence | null
  stats: Stats | null
  avatarDataUri: string | null
  width: number
  fallbackUserId: string
}

export function renderCard(input: RenderInput): string {
  const w = input.width
  const h = 200
  const p = input.presence
  const status: Presence['status'] = p?.status ?? 'offline'
  const dotColor = STATUS_COLORS[status]
  const dotOpacity = p?.stale ? 0.5 : 1
  const username = escapeXml(truncate(p?.username ?? 'unknown', 24))
  const activity = p ? pickActivity(p.activities) : null
  const activityLine = activity ? escapeXml(truncate(activity, 36)) : ''

  const top = (input.stats?.languages ?? []).slice(0, 3)
  const maxHours = Math.max(...top.map((l) => l.hours), 0.0001)
  const totalLine = input.stats ? formatHours(input.stats.totalHours) : 'stats unavailable'

  const avatarFill = input.avatarDataUri
    ? `<image href="${input.avatarDataUri}" x="20" y="40" width="80" height="80" clip-path="url(#avatarClip)"/>`
    : (() => {
        const bg = initialsColor(p?.user_id ?? input.fallbackUserId)
        const letter = (p?.username ?? 'U').charAt(0).toUpperCase()
        return `<circle cx="60" cy="80" r="40" fill="${bg}"/>` +
               `<text x="60" y="92" font-family="sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="#fff">${escapeXml(letter)}</text>`
      })()

  const bars = top.map((l, i) => {
    const y = 130 + i * 18
    const barW = Math.round((l.hours / maxHours) * 180)
    const name = escapeXml(truncate(l.name, 12))
    const hrs = l.hours >= 1 ? `${l.hours.toFixed(1)}h` : `${Math.round(l.hours * 60)}m`
    return `
      <text x="130" y="${y}" font-family="sans-serif" font-size="11" fill="#b9bbbe">${name}</text>
      <rect x="200" y="${y - 9}" width="${barW}" height="10" rx="2" fill="#5865f2"/>
      <text x="${210 + barW}" y="${y}" font-family="sans-serif" font-size="11" fill="#b9bbbe">${hrs}</text>`
  }).join('')

  const noStats = top.length === 0
    ? `<text x="130" y="148" font-family="sans-serif" font-size="12" fill="#72767d">no stats yet</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="psyduck status card">
  <defs>
    <clipPath id="avatarClip"><circle cx="60" cy="80" r="40"/></clipPath>
  </defs>
  <rect width="${w}" height="${h}" rx="10" fill="#2f3136"/>
  ${avatarFill}
  <circle cx="92" cy="112" r="10" fill="#2f3136"/>
  <circle cx="92" cy="112" r="7" fill="${dotColor}" opacity="${dotOpacity}"/>
  <text x="130" y="60" font-family="sans-serif" font-size="18" font-weight="700" fill="#ffffff">${username}</text>
  <text x="130" y="84" font-family="sans-serif" font-size="13" fill="#b9bbbe">${activityLine}</text>
  ${bars}
  ${noStats}
  <text x="${w - 16}" y="${h - 12}" font-family="sans-serif" font-size="10" fill="#72767d" text-anchor="end">${escapeXml(totalLine)}</text>
</svg>`
}
