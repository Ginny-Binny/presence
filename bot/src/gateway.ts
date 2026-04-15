import WebSocket from 'ws'
import type Redis from 'ioredis'
import { log } from './log.js'
import { buildIdentify, buildResume } from './identify.js'
import { startHeartbeat, type Heartbeat } from './heartbeat.js'
import { writePresence } from './presence.js'

const DEFAULT_GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json'

type Opts = { token: string; userId: string; redis: Redis }

type Session = { id: string; resumeUrl: string } | null

// Close codes Discord uses to signal a non-recoverable problem. Retrying these
// just hammers the gateway and gets the bot rate-limited.
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014])

export function runGateway(opts: Opts) {
  let session: Session = null
  let seq: number | null = null
  let backoffMs = 1000
  let resumedTimer: NodeJS.Timeout | null = null

  const connect = (url: string, isResume: boolean) => {
    log.info(`connecting (${isResume ? 'resume' : 'identify'}) ${url}`)
    const ws = new WebSocket(url)
    let hb: Heartbeat | null = null

    const cleanup = () => {
      if (hb) { hb.stop(); hb = null }
      if (resumedTimer) { clearTimeout(resumedTimer); resumedTimer = null }
    }

    const reconnect = (canResume: boolean) => {
      cleanup()
      const wait = backoffMs
      backoffMs = Math.min(backoffMs * 2, 30000)
      setTimeout(() => {
        if (canResume && session) connect(session.resumeUrl + '/?v=10&encoding=json', true)
        else { session = null; seq = null; connect(DEFAULT_GATEWAY, false) }
      }, wait)
    }

    ws.on('open', () => {
      if (isResume && session) {
        ws.send(JSON.stringify(buildResume(opts.token, session.id, seq)))
        // If the gateway accepts the resume it sends RESUMED; if it never
        // arrives within 10s assume it's wedged and start a fresh identify.
        resumedTimer = setTimeout(() => {
          log.warn('no RESUMED within 10s, forcing reidentify')
          try { ws.close(4000, 'resume timeout') } catch { /* ignore */ }
        }, 10000)
      }
    })

    ws.on('message', async (data) => {
      let payload: { op: number; d: unknown; s: number | null; t: string | null }
      try { payload = JSON.parse(data.toString()) } catch { return }
      if (payload.s !== null) seq = payload.s

      switch (payload.op) {
        case 10: { // HELLO
          const d = payload.d as { heartbeat_interval: number }
          hb = startHeartbeat(ws, d.heartbeat_interval, () => seq)
          if (!isResume) ws.send(JSON.stringify(buildIdentify(opts.token)))
          break
        }
        case 11: hb?.ack(); break // HEARTBEAT_ACK
        case 1: { // server-requested heartbeat
          try { ws.send(JSON.stringify({ op: 1, d: seq })) } catch { /* ignore */ }
          break
        }
        case 7: { // RECONNECT
          log.info('gateway requested reconnect')
          try { ws.close(4000, 'reconnect requested') } catch { /* ignore */ }
          break
        }
        case 9: { // INVALID_SESSION
          log.warn('invalid session')
          const resumable = payload.d === true
          if (!resumable) { session = null; seq = null }
          // Discord asks for a 1-5s wait before re-identifying.
          setTimeout(() => { try { ws.close(4000, 'invalid session') } catch { /* ignore */ } },
            1000 + Math.floor(Math.random() * 4000))
          break
        }
        case 0: { // dispatch
          if (payload.t === 'READY') {
            const d = payload.d as { session_id: string; resume_gateway_url: string; user: { username: string } }
            session = { id: d.session_id, resumeUrl: d.resume_gateway_url }
            backoffMs = 1000
            log.info(`READY as ${d.user.username}`)
          } else if (payload.t === 'RESUMED') {
            if (resumedTimer) { clearTimeout(resumedTimer); resumedTimer = null }
            backoffMs = 1000
            log.info('RESUMED')
          } else if (payload.t === 'PRESENCE_UPDATE') {
            await writePresence(opts.redis, opts.userId, payload.d as never)
          }
          break
        }
      }
    })

    ws.on('close', (code, reason) => {
      log.warn(`socket closed ${code} ${reason.toString() || ''}`)
      if (FATAL_CLOSE_CODES.has(code)) {
        if (code === 4014) log.error('disallowed intent — enable PRESENCE INTENT in Discord developer portal')
        if (code === 4004) log.error('authentication failed — check DISCORD_TOKEN')
        process.exit(1)
      }
      reconnect(Boolean(session))
    })

    ws.on('error', (err) => {
      log.warn('socket error', err.message)
      // close handler will run next and trigger reconnect
    })
  }

  connect(DEFAULT_GATEWAY, false)
}
