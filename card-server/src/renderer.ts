import type { Presence, Activity } from './presence.js'
import type { Stats } from './wakapi.js'
import { initialsColor } from './avatar.js'

// Discord status dot colors.
const STATUS = {
  online: '#43b581',
  idle: '#faa61a',
  dnd: '#f04747',
  offline: '#747f8d',
} as const

const ACTIVITY_PREFIX: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  5: 'Competing in',
}

// Discord-ish dark palette so the card sits naturally on a dark README.
const BG = '#1a1c1f'
const FG = '#ffffff'
const MUTED = '#b9bbbe'
const DIM = '#72767d'
const DIVIDER = 'rgba(255,255,255,0.08)'
const ACCENT = '#5865f2'

const FONT = `'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function realActivity(acts: Activity[]): Activity | undefined {
  // Custom status (type 4) is metadata, not an "activity" — pick the first
  // real one (game, IDE, music, watching, competing).
  return acts.find((a) => a.type !== 4 && !!a.name)
}

function customStatus(acts: Activity[]): Activity | undefined {
  return acts.find((a) => a.type === 4)
}

function elapsedSince(startMs: number): string {
  const total = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatHours(t: number): string {
  if (!isFinite(t) || t <= 0) return '0h 0m'
  const h = Math.floor(t)
  const m = Math.floor((t - h) * 60)
  return `${h}h ${m}m`
}

// Avatar block: real image when we have one, otherwise a deterministic
// initials circle. Status dot is overlaid bottom-right with a ring punched
// out of the background so it looks recessed, the way Discord does it.
function avatarHtml(presence: Presence | null, dataUri: string | null, fallbackId: string): string {
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
  return `
    <div style="position:relative;width:64px;height:64px;flex:none">
      ${inner}
      <span style="position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:50%;background:${dot};opacity:${opacity};box-shadow:0 0 0 4px ${BG}"></span>
    </div>`
}

// Inline VS Code-ish glyph as the icon when the activity card is showing
// coding stats (no real Discord activity). Keeps the file dependency-free.
const CODE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>`

const GENERIC_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>`

function activityIconTile(bg: string, glyph: string): string {
  return `
    <div style="width:80px;height:80px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;flex:none">
      ${glyph}
    </div>`
}

function activityCardHtml(act: Activity): string {
  const prefix = ACTIVITY_PREFIX[act.type] ?? ''
  const header = escapeHtml(`${prefix} ${act.name ?? ''}`.trim())
  const details = act.details ? escapeHtml(act.details) : null
  const state = act.state ? escapeHtml(act.state) : null
  const elapsed = act.timestamps?.start ? `${elapsedSince(act.timestamps.start)} elapsed` : null
  // VS Code activity gets the code glyph; everything else gets the clock.
  const isCode = (act.name ?? '').toLowerCase().includes('code')
  const tile = activityIconTile(isCode ? '#0098ff' : '#5865f2', isCode ? CODE_ICON : GENERIC_ICON)

  const lines = [
    `<div style="color:${FG};font:700 14px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${header}</div>`,
    details && `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${details}</div>`,
    state && `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${state}</div>`,
    elapsed && `<div style="color:${DIM};font:400 12px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${elapsed}</div>`,
  ].filter(Boolean).join('')

  return `
    <div style="display:flex;flex-direction:row;gap:14px;padding:14px 16px;align-items:center">
      ${tile}
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">
        ${lines}
      </div>
    </div>`
}

function statsCardHtml(stats: Stats): string {
  const top = stats.languages.slice(0, 3)
  const max = Math.max(...top.map((l) => l.hours), 0.0001)
  const tile = activityIconTile('#0098ff', CODE_ICON)
  const total = formatHours(stats.totalHours)

  const bars = top.length === 0
    ? `<div style="color:${DIM};font:400 13px ${FONT}">no stats yet this week</div>`
    : top.map((l) => {
        const pct = Math.max(4, Math.round((l.hours / max) * 100))
        const hrs = l.hours >= 1 ? `${l.hours.toFixed(1)}h` : `${Math.round(l.hours * 60)}m`
        return `
          <div style="display:flex;align-items:center;gap:8px">
            <div style="color:${MUTED};font:400 12px ${FONT};width:78px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.name)}</div>
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${ACCENT};border-radius:3px"></div>
            </div>
            <div style="color:${DIM};font:400 11px ${FONT};width:36px;text-align:right">${hrs}</div>
          </div>`
      }).join('')

  return `
    <div style="display:flex;flex-direction:row;gap:14px;padding:14px 16px;align-items:center">
      ${tile}
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0;flex:1">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="color:${FG};font:700 14px ${FONT}">Coding this week</div>
          <div style="color:${DIM};font:400 12px ${FONT}">${total}</div>
        </div>
        ${bars}
      </div>
    </div>`
}

function idleHtml(message: string): string {
  return `
    <div style="display:flex;align-items:center;justify-content:center;padding:22px 16px">
      <div style="color:${DIM};font:italic 400 13px ${FONT}">${escapeHtml(message)}</div>
    </div>`
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
  const p = input.presence
  const username = escapeHtml(p?.username ?? 'unknown')
  const custom = p ? customStatus(p.activities) : undefined
  const customLine = custom?.state
    ? escapeHtml((custom.emoji?.name ? `${custom.emoji.name} ` : '') + custom.state)
    : null

  const live = p ? realActivity(p.activities) : undefined
  const hasStats = !!input.stats && (input.stats.languages.length > 0 || input.stats.totalHours > 0)

  // Pick the body section once; height adapts to it.
  let body: string
  if (live) body = activityCardHtml(live)
  else if (hasStats) body = statsCardHtml(input.stats!)
  else body = idleHtml(p && p.status !== 'offline' ? 'Not doing anything right now' : 'Currently offline')

  // Header is fixed-height; body sections are designed at ~108px so the card
  // settles around 200px. foreignObject needs an explicit height.
  const headerH = 92
  const bodyH = 108
  const h = headerH + bodyH

  const avatar = avatarHtml(p, input.avatarDataUri, input.fallbackUserId)
  const customHtml = customLine
    ? `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${customLine}</div>`
    : ''

  // foreignObject + HTML/CSS gives us flex, ellipsis truncation, gradients,
  // rounded corners — things raw SVG can't express cleanly. GitHub's camo
  // proxy passes the SVG straight through to the browser, so this renders
  // the same in a README as it does locally.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="psyduck status">
  <foreignObject x="0" y="0" width="${w}" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:${BG};border-radius:12px;overflow:hidden;font-family:${FONT}">
      <div style="display:flex;flex-direction:row;align-items:center;gap:14px;padding:14px 16px;height:${headerH - 28}px">
        ${avatar}
        <div style="display:flex;flex-direction:column;min-width:0;flex:1">
          <div style="color:${FG};font:700 16px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${username}</div>
          ${customHtml}
        </div>
      </div>
      <div style="height:1px;background:${DIVIDER};margin:0 16px"></div>
      ${body}
    </div>
  </foreignObject>
</svg>`
}
