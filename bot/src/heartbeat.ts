import type WebSocket from 'ws'
import { log } from './log.js'

export type Heartbeat = {
  stop: () => void
  ack: () => void
}

// Chained setTimeout (not setInterval) so a stalled event loop doesn't fire a
// burst of beats once it recovers. Missing an ACK closes the socket with 4000
// so the reconnect/resume path takes over.
export function startHeartbeat(
  ws: WebSocket,
  intervalMs: number,
  getSeq: () => number | null,
): Heartbeat {
  let acked = true
  let timer: NodeJS.Timeout | null = null
  let stopped = false

  const beat = () => {
    if (stopped) return
    if (!acked) {
      log.warn('heartbeat ack missed, closing socket')
      try { ws.close(4000, 'heartbeat missed') } catch { /* ignore */ }
      return
    }
    acked = false
    try {
      ws.send(JSON.stringify({ op: 1, d: getSeq() }))
    } catch (err) {
      log.warn('heartbeat send failed', (err as Error).message)
    }
    timer = setTimeout(beat, intervalMs)
  }

  // Discord requires jitter on the first beat: random in [0, interval).
  timer = setTimeout(beat, Math.floor(Math.random() * intervalMs))

  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
    ack: () => { acked = true },
  }
}
