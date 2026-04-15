type Level = 'debug' | 'info' | 'warn' | 'error'

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const min: Level = (process.env.LOG_LEVEL as Level) || 'info'

function emit(level: Level, msg: string, extra?: unknown) {
  if (order[level] < order[min]) return
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`
  const out = level === 'error' || level === 'warn' ? console.error : console.log
  if (extra !== undefined) out(line, extra)
  else out(line)
}

export const log = {
  debug: (m: string, e?: unknown) => emit('debug', m, e),
  info: (m: string, e?: unknown) => emit('info', m, e),
  warn: (m: string, e?: unknown) => emit('warn', m, e),
  error: (m: string, e?: unknown) => emit('error', m, e),
}

export function loadEnv(required: string[]): Record<string, string> {
  const missing = required.filter((k) => !process.env[k] || process.env[k] === '')
  if (missing.length) {
    log.error(`missing required env: ${missing.join(', ')}`)
    process.exit(1)
  }
  return Object.fromEntries(required.map((k) => [k, process.env[k] as string]))
}
