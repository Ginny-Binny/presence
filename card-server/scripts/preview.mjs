// Self-contained preview script — no deps, no build step. Mirrors renderer.ts
// so changes to the real renderer should be ported here too (or this script
// converted to tsx import once you have node_modules installed).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STATUS_COLORS = { online: '#43b581', idle: '#faa61a', dnd: '#f04747', offline: '#747f8d' }
const ACTIVITY_PREFIX = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' }

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const truncate = (s, max) => s.length <= max ? s : s.slice(0, max - 1) + '…'

const formatActivity = (a) => {
  if (a.type === 4) {
    const emoji = a.emoji?.name ? `${a.emoji.name} ` : ''
    return a.state ? `${emoji}${a.state}` : null
  }
  if (!a.name) return null
  const prefix = ACTIVITY_PREFIX[a.type] ?? ''
  const detail = a.details ? ` — ${a.details}` : ''
  return `${prefix} ${a.name}${detail}`.trim()
}

const pickActivity = (acts) => {
  const real = acts.find((a) => a.type !== 4)
  if (real) { const f = formatActivity(real); if (f) return f }
  const custom = acts.find((a) => a.type === 4)
  return custom ? formatActivity(custom) : null
}

const formatHours = (t) => {
  if (!isFinite(t) || t <= 0) return '0h this week'
  const h = Math.floor(t)
  const m = Math.floor((t - h) * 60)
  return `${h}h ${m}m this week`
}

const initialsColor = (id) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const palette = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#9b59b6', '#e67e22']
  return palette[Math.abs(h) % palette.length]
}

function renderCard({ presence, stats, avatarDataUri, width, fallbackUserId }) {
  const w = width, h = 200
  const p = presence
  const status = p?.status ?? 'offline'
  const dotColor = STATUS_COLORS[status]
  const dotOpacity = p?.stale ? 0.5 : 1
  const username = escapeXml(truncate(p?.username ?? 'unknown', 24))
  const activity = p ? pickActivity(p.activities) : null
  const activityLine = activity ? escapeXml(truncate(activity, 36)) : ''

  const top = (stats?.languages ?? []).slice(0, 3)
  const maxHours = Math.max(...top.map((l) => l.hours), 0.0001)
  const totalLine = stats ? formatHours(stats.totalHours) : 'stats unavailable'

  const avatarFill = avatarDataUri
    ? `<image href="${avatarDataUri}" x="20" y="40" width="80" height="80" clip-path="url(#avatarClip)"/>`
    : (() => {
        const bg = initialsColor(p?.user_id ?? fallbackUserId)
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

const samples = {
  'card-online-coding.svg': {
    presence: {
      status: 'online',
      user_id: '123456789012345678',
      username: 'gaurang',
      avatar: null,
      stale: false,
      activities: [
        { type: 0, name: 'Visual Studio Code', details: 'Editing renderer.ts', state: 'Workspace: presence' },
      ],
    },
    stats: {
      languages: [
        { name: 'TypeScript', hours: 12.4 },
        { name: 'YAML', hours: 1.8 },
        { name: 'Markdown', hours: 0.6 },
      ],
      totalHours: 14.8,
    },
  },
  'card-idle-custom.svg': {
    presence: {
      status: 'idle',
      user_id: '987654321098765432',
      username: 'psyduck',
      avatar: null,
      stale: false,
      activities: [
        { type: 4, name: 'Custom Status', state: 'building things', emoji: { name: '🦆' } },
      ],
    },
    stats: {
      languages: [{ name: 'Go', hours: 3.2 }],
      totalHours: 3.2,
    },
  },
  'card-offline-nostats.svg': {
    presence: {
      status: 'offline',
      user_id: '111222333444555666',
      username: 'afk-user',
      avatar: null,
      stale: true,
      activities: [],
    },
    stats: null,
  },
}

const out = 'C:/Users/gaura/Downloads'
for (const [name, sample] of Object.entries(samples)) {
  const svg = renderCard({
    presence: sample.presence,
    stats: sample.stats,
    avatarDataUri: null,
    width: 480,
    fallbackUserId: sample.presence?.user_id ?? '0',
  })
  const path = join(out, name)
  writeFileSync(path, svg)
  console.log('wrote', path)
}
