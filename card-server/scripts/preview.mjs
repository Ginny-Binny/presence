// Self-contained preview. Mirrors renderer.ts. Re-run with:
//   node card-server/scripts/preview.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const STATUS = { online: '#43b581', idle: '#faa61a', dnd: '#f04747', offline: '#747f8d' }
const ACTIVITY_PREFIX = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' }

const BG = '#1a1c1f'
const FG = '#ffffff'
const MUTED = '#b9bbbe'
const DIM = '#72767d'
const DIVIDER = 'rgba(255,255,255,0.08)'
const ACCENT = '#5865f2'
const FONT = `'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif`

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const initialsColor = (id) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const palette = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#9b59b6', '#e67e22']
  return palette[Math.abs(h) % palette.length]
}

const realActivity = (acts) => acts.find((a) => a.type !== 4 && !!a.name)
const customStatus = (acts) => acts.find((a) => a.type === 4)

const elapsedSince = (start) => {
  const total = Math.max(0, Math.floor((Date.now() - start) / 1000))
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60
  const pad = (n) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

const formatHours = (t) => {
  if (!isFinite(t) || t <= 0) return '0h 0m'
  const h = Math.floor(t), m = Math.floor((t - h) * 60)
  return `${h}h ${m}m`
}

const CODE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
const GENERIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`

const tile = (bg, glyph) =>
  `<div style="width:80px;height:80px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex:none">${glyph}</div>`

const avatarHtml = (presence, dataUri, fallbackId) => {
  const status = presence?.status ?? 'offline'
  const dot = STATUS[status]
  const opacity = presence?.stale ? 0.5 : 1
  const inner = dataUri
    ? `<img src="${dataUri}" alt="" style="width:64px;height:64px;border-radius:50%;display:block;object-fit:cover"/>`
    : (() => {
        const bg = initialsColor(presence?.user_id ?? fallbackId)
        const letter = (presence?.username ?? 'U').charAt(0).toUpperCase()
        return `<div style="width:64px;height:64px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font:700 28px ${FONT}">${escapeHtml(letter)}</div>`
      })()
  return `<div style="position:relative;width:64px;height:64px;flex:none">${inner}<span style="position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:50%;background:${dot};opacity:${opacity};box-shadow:0 0 0 4px ${BG}"></span></div>`
}

const activityCardHtml = (act) => {
  const prefix = ACTIVITY_PREFIX[act.type] ?? ''
  const header = escapeHtml(`${prefix} ${act.name ?? ''}`.trim())
  const details = act.details ? escapeHtml(act.details) : null
  const state = act.state ? escapeHtml(act.state) : null
  const elapsed = act.timestamps?.start ? `${elapsedSince(act.timestamps.start)} elapsed` : null
  const isCode = (act.name ?? '').toLowerCase().includes('code')
  const tileEl = tile(isCode ? '#0098ff' : '#5865f2', isCode ? CODE_ICON : GENERIC_ICON)
  const lines = [
    `<div style="color:${FG};font:700 14px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${header}</div>`,
    details && `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${details}</div>`,
    state && `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${state}</div>`,
    elapsed && `<div style="color:${DIM};font:400 12px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${elapsed}</div>`,
  ].filter(Boolean).join('')
  return `<div style="display:flex;flex-direction:row;gap:14px;padding:14px 16px;align-items:center">${tileEl}<div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">${lines}</div></div>`
}

const statsCardHtml = (stats) => {
  const top = stats.languages.slice(0, 3)
  const max = Math.max(...top.map((l) => l.hours), 0.0001)
  const tileEl = tile('#0098ff', CODE_ICON)
  const total = formatHours(stats.totalHours)
  const bars = top.length === 0
    ? `<div style="color:${DIM};font:400 13px ${FONT}">no stats yet this week</div>`
    : top.map((l) => {
        const pct = Math.max(4, Math.round((l.hours / max) * 100))
        const hrs = l.hours >= 1 ? `${l.hours.toFixed(1)}h` : `${Math.round(l.hours * 60)}m`
        return `<div style="display:flex;align-items:center;gap:8px"><div style="color:${MUTED};font:400 12px ${FONT};width:78px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.name)}</div><div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${ACCENT};border-radius:3px"></div></div><div style="color:${DIM};font:400 11px ${FONT};width:36px;text-align:right">${hrs}</div></div>`
      }).join('')
  return `<div style="display:flex;flex-direction:row;gap:14px;padding:14px 16px;align-items:center">${tileEl}<div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1"><div style="display:flex;justify-content:space-between;align-items:baseline"><div style="color:${FG};font:700 14px ${FONT}">Coding this week</div><div style="color:${DIM};font:400 12px ${FONT}">${total}</div></div>${bars}</div></div>`
}

const idleHtml = (msg) =>
  `<div style="display:flex;align-items:center;justify-content:center;padding:22px 16px"><div style="color:${DIM};font:italic 400 13px ${FONT}">${escapeHtml(msg)}</div></div>`

function renderCard({ presence, stats, avatarDataUri, width, fallbackUserId }) {
  const w = width
  const p = presence
  const username = escapeHtml(p?.username ?? 'unknown')
  const custom = p ? customStatus(p.activities) : undefined
  const customLine = custom?.state
    ? escapeHtml((custom.emoji?.name ? `${custom.emoji.name} ` : '') + custom.state)
    : null
  const live = p ? realActivity(p.activities) : undefined
  const hasStats = !!stats && (stats.languages.length > 0 || stats.totalHours > 0)

  let body
  if (live) body = activityCardHtml(live)
  else if (hasStats) body = statsCardHtml(stats)
  else body = idleHtml(p && p.status !== 'offline' ? 'Not doing anything right now' : 'Currently offline')

  const headerH = 92, bodyH = 108, h = headerH + bodyH
  const avatar = avatarHtml(p, avatarDataUri, fallbackUserId)
  const customHtml = customLine
    ? `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${customLine}</div>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="psyduck status"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:${BG};border-radius:12px;overflow:hidden;font-family:${FONT}"><div style="display:flex;flex-direction:row;align-items:center;gap:14px;padding:14px 16px;height:${headerH - 28}px">${avatar}<div style="display:flex;flex-direction:column;min-width:0;flex:1"><div style="color:${FG};font:700 16px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${username}</div>${customHtml}</div></div><div style="height:1px;background:${DIVIDER};margin:0 16px"></div>${body}</div></foreignObject></svg>`
}

const samples = {
  'card-online-coding.svg': {
    presence: {
      status: 'online', user_id: '123456789012345678', username: 'gaurang', avatar: null, stale: false,
      activities: [{ type: 0, name: 'Visual Studio Code', details: 'Editing renderer.ts', state: 'Workspace: presence', timestamps: { start: Date.now() - 1000 * 60 * 47 } }],
    },
    stats: { languages: [{ name: 'TypeScript', hours: 12.4 }, { name: 'YAML', hours: 1.8 }, { name: 'Markdown', hours: 0.6 }], totalHours: 14.8 },
  },
  'card-idle-custom.svg': {
    presence: {
      status: 'idle', user_id: '987654321098765432', username: 'psyduck', avatar: null, stale: false,
      activities: [{ type: 4, name: 'Custom Status', state: 'building things', emoji: { name: '🦆' } }],
    },
    stats: { languages: [{ name: 'Go', hours: 3.2 }, { name: 'Shell', hours: 0.5 }], totalHours: 3.7 },
  },
  'card-offline-nostats.svg': {
    presence: { status: 'offline', user_id: '111222333444555666', username: 'afk-user', avatar: null, stale: true, activities: [] },
    stats: null,
  },
  'card-dnd-game.svg': {
    presence: {
      status: 'dnd', user_id: '222333444555666777', username: 'in_a_meeting', avatar: null, stale: false,
      activities: [
        { type: 4, name: 'Custom Status', state: 'heads down 🎧' },
        { type: 0, name: 'Valorant', details: 'Competitive — Haven', state: 'In Match (7-3)', timestamps: { start: Date.now() - 1000 * 60 * 18 } },
      ],
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
    width: 410,
    fallbackUserId: sample.presence?.user_id ?? '0',
  })
  const path = join(out, name)
  writeFileSync(path, svg)
  console.log('wrote', path)
}
