import type { Presence, Activity } from './presence.js'
import type { Stats } from './wakapi.js'
import type { UserProfile } from './userprofile.js'
import type { Badge } from './badges.js'
import { initialsColor } from './avatar.js'

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

const BG = '#1a1c1f'
const FG = '#ffffff'
const MUTED = '#b9bbbe'
const DIM = '#72767d'
const DIVIDER = 'rgba(255,255,255,0.08)'
const ACCENT = '#5865f2'

const FONT = `'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function realActivity(acts: Activity[]): Activity | undefined {
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

// Avatar + animated decoration overlay. Decoration sits on top of the avatar
// circle (slightly larger) and the status dot punches through it bottom-right.
function avatarHtml(
  presence: Presence | null,
  profile: UserProfile | null,
  avatarDataUri: string | null,
  decorationDataUri: string | null,
  fallbackId: string,
): string {
  const status = presence?.status ?? 'offline'
  const dot = STATUS[status]
  const opacity = presence?.stale ? 0.5 : 1

  const inner = avatarDataUri
    ? `<img src="${avatarDataUri}" alt="" style="width:64px;height:64px;border-radius:50%;display:block;object-fit:cover"/>`
    : (() => {
        const bg = initialsColor(profile?.user_id ?? presence?.user_id ?? fallbackId)
        const letter = (profile?.global_name ?? profile?.username ?? presence?.username ?? 'U').charAt(0).toUpperCase()
        return `<div style="width:64px;height:64px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font:700 28px ${FONT}">${escapeHtml(letter)}</div>`
      })()

  const decoration = decorationDataUri
    ? `<img src="${decorationDataUri}" alt="" style="position:absolute;top:50%;left:50%;width:80px;height:80px;transform:translate(-50%,-50%);pointer-events:none"/>`
    : ''

  return `
    <div style="position:relative;width:64px;height:64px;flex:none">
      ${inner}
      ${decoration}
      <span style="position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:50%;background:${dot};opacity:${opacity};box-shadow:0 0 0 4px ${BG}"></span>
    </div>`
}

function badgesHtml(badges: Badge[]): string {
  if (badges.length === 0) return ''
  return badges.map((b) =>
    `<img src="${b.dataUri}" alt="${escapeHtml(b.key)}" title="${escapeHtml(b.key)}" style="width:18px;height:18px;display:block"/>`,
  ).join('')
}

const CODE_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>`

const GENERIC_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>`

// Activity icon: real app/album image when we have one, otherwise a generic
// glyph with a colored tile so the layout doesn't shift.
function activityIconTile(largeDataUri: string | null, smallDataUri: string | null, fallbackBg: string, fallbackGlyph: string): string {
  const main = largeDataUri
    ? `<img src="${largeDataUri}" alt="" style="width:80px;height:80px;border-radius:12px;object-fit:cover;display:block"/>`
    : `<div style="width:80px;height:80px;border-radius:12px;background:${fallbackBg};display:flex;align-items:center;justify-content:center">${fallbackGlyph}</div>`
  const overlay = smallDataUri
    ? `<img src="${smallDataUri}" alt="" style="position:absolute;right:-6px;bottom:-6px;width:26px;height:26px;border-radius:50%;border:3px solid ${BG};background:${BG}"/>`
    : ''
  return `<div style="position:relative;width:80px;height:80px;flex:none">${main}${overlay}</div>`
}

function activityCardHtml(act: Activity, largeDataUri: string | null, smallDataUri: string | null): string {
  const prefix = ACTIVITY_PREFIX[act.type] ?? ''
  const header = escapeHtml(`${prefix} ${act.name ?? ''}`.trim())
  const details = act.details ? escapeHtml(act.details) : null
  const state = act.state ? escapeHtml(act.state) : null
  const elapsed = act.timestamps?.start ? `${elapsedSince(act.timestamps.start)} elapsed` : null
  const isCode = (act.name ?? '').toLowerCase().includes('code')
  const tile = activityIconTile(largeDataUri, smallDataUri, isCode ? '#0098ff' : '#5865f2', isCode ? CODE_ICON : GENERIC_ICON)

  const lines = [
    `<div style="color:${FG};font:700 14px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${header}</div>`,
    details && `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${details}</div>`,
    state && `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${state}</div>`,
    elapsed && `<div style="color:${DIM};font:400 12px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${elapsed}</div>`,
  ].filter(Boolean).join('')

  return `
    <div style="display:flex;flex-direction:row;gap:18px;padding:14px 16px;align-items:center">
      ${tile}
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">
        ${lines}
      </div>
    </div>`
}

const MAX_LANGUAGES = 10

// Compact stats row — top languages + total hours on the right. Designed to
// stack under the activity row so both are visible in one card.
function statsRowHtml(stats: Stats | null): string {
  const top = (stats?.languages ?? []).slice(0, MAX_LANGUAGES)
  const total = stats ? formatHours(stats.totalHours) : '—'
  const max = Math.max(...top.map((l) => l.hours), 0.0001)

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <div style="color:${FG};font:700 12px ${FONT};letter-spacing:0.3px;text-transform:uppercase">Coding this week</div>
      <div style="color:${DIM};font:400 11px ${FONT}">${total}</div>
    </div>`

  const body = top.length === 0
    ? `<div style="color:${DIM};font:italic 400 11px ${FONT}">no stats yet — start coding to populate</div>`
    : top.map((l) => {
        const pct = Math.max(4, Math.round((l.hours / max) * 100))
        const hrs = l.hours >= 1 ? `${l.hours.toFixed(1)}h` : `${Math.round(l.hours * 60)}m`
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
            <div style="color:${MUTED};font:400 11px ${FONT};width:78px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.name)}</div>
            <div style="flex:1;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${ACCENT};border-radius:2px"></div>
            </div>
            <div style="color:${DIM};font:400 10px ${FONT};width:34px;text-align:right">${hrs}</div>
          </div>`
      }).join('')

  return `
    <div style="padding:12px 16px 14px">
      ${header}
      ${body}
    </div>`
}

function idleHtml(message: string): string {
  return `
    <div style="display:flex;align-items:center;justify-content:center;padding:22px 16px">
      <div style="color:${DIM};font:italic 400 13px ${FONT}">${escapeHtml(message)}</div>
    </div>`
}

export type RenderInput = {
  presence: Presence | null
  profile: UserProfile | null
  stats: Stats | null
  avatarDataUri: string | null
  decorationDataUri: string | null
  badges: Badge[]
  activityLargeDataUri: string | null
  activitySmallDataUri: string | null
  clanBadgeDataUri: string | null
  width: number
  fallbackUserId: string
}

// Clan tag pill — icon + tag letters, dark pill. Rendered to the right of
// the username, to the left of public_flags badges. Discord calls this the
// "guild identity" / primary_guild feature.
function clanPillHtml(tag: string | null, badgeDataUri: string | null): string {
  if (!tag) return ''
  const icon = badgeDataUri
    ? `<img src="${badgeDataUri}" alt="" style="width:14px;height:14px;display:block"/>`
    : ''
  return `
    <div style="display:flex;align-items:center;gap:4px;padding:2px 6px;background:rgba(255,255,255,0.08);border-radius:4px;flex:none">
      ${icon}
      <span style="color:${FG};font:600 11px ${FONT};letter-spacing:0.3px">${escapeHtml(tag)}</span>
    </div>`
}

export function renderCard(input: RenderInput): string {
  const w = input.width
  const p = input.presence
  // Username precedence: profile (REST, has global_name) > presence > 'unknown'.
  const displayName = input.profile?.global_name
    ?? input.profile?.username
    ?? p?.username
    ?? 'unknown'
  const username = escapeHtml(displayName)

  const custom = p ? customStatus(p.activities) : undefined
  const customLine = custom?.state
    ? escapeHtml((custom.emoji?.name ? `${custom.emoji.name} ` : '') + custom.state)
    : null

  const live = p ? realActivity(p.activities) : undefined

  // Both rows always render. Activity row falls back to an idle message if
  // the user isn't doing anything real. Stats row is separate below it.
  const activitySection = live
    ? activityCardHtml(live, input.activityLargeDataUri, input.activitySmallDataUri)
    : idleHtml(p && p.status !== 'offline' ? 'Not doing anything right now' : 'Currently offline')
  const statsSection = statsRowHtml(input.stats)

  const headerH = 92
  const activityH = live ? 108 : 60
  // Stats row: 12px top pad + 18px header + ~17px per bar + 14px bottom pad.
  // Grow with the actual number of languages so we never clip the last row.
  const langCount = Math.min(input.stats?.languages?.length ?? 0, MAX_LANGUAGES) || 1
  const statsH = 12 + 18 + langCount * 17 + 14
  const h = headerH + activityH + statsH

  const avatar = avatarHtml(p, input.profile, input.avatarDataUri, input.decorationDataUri, input.fallbackUserId)
  const badges = badgesHtml(input.badges)
  const clan = clanPillHtml(input.profile?.clan_tag ?? null, input.clanBadgeDataUri)

  const customHtml = customLine
    ? `<div style="color:${MUTED};font:400 13px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${customLine}</div>`
    : ''

  const usernameExtras = clan || badges
    ? `<div style="display:flex;align-items:center;gap:6px;flex:none">${clan}${badges}</div>`
    : ''
  const usernameRow = usernameExtras
    ? `<div style="display:flex;align-items:center;gap:6px;min-width:0">
         <div style="color:${FG};font:700 16px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${username}</div>
         ${usernameExtras}
       </div>`
    : `<div style="color:${FG};font:700 16px ${FONT};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${username}</div>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="psyduck status">
  <foreignObject x="0" y="0" width="${w}" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:${BG};border-radius:12px;overflow:hidden;font-family:${FONT}">
      <div style="display:flex;flex-direction:row;align-items:center;gap:14px;padding:14px 16px;height:${headerH - 28}px">
        ${avatar}
        <div style="display:flex;flex-direction:column;min-width:0;flex:1">
          ${usernameRow}
          ${customHtml}
        </div>
      </div>
      <div style="height:1px;background:${DIVIDER};margin:0 16px"></div>
      ${activitySection}
      <div style="height:1px;background:${DIVIDER};margin:0 16px"></div>
      ${statsSection}
    </div>
  </foreignObject>
</svg>`
}
