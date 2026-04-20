import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Redis from 'ioredis'
import { log } from './log.js'
import { handleCard, handleHealthz, notFound, serverError } from './routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Blue dev badge icon lives at repo root — two levels up from dist/
const faviconPath = path.resolve(__dirname, '..', '..', 'favicon.png')
let faviconBuf: Buffer | null = null
try { faviconBuf = fs.readFileSync(faviconPath) } catch { /* missing is fine */ }

type Opts = {
  port: number
  redis: Redis
  userId: string
  wakapiUrl: string
  wakapiKey: string
  svgWidth: number
}

export function startServer(opts: Opts): http.Server {
  const deps = {
    redis: opts.redis,
    userId: opts.userId,
    wakapiUrl: opts.wakapiUrl,
    wakapiKey: opts.wakapiKey,
    svgWidth: opts.svgWidth,
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://x')
      if (url.pathname === '/card.svg') return await handleCard(req, res, deps)
      if (url.pathname === '/healthz') return await handleHealthz(req, res, deps)
      if ((url.pathname === '/favicon.ico' || url.pathname === '/favicon.png') && faviconBuf) {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
        res.end(faviconBuf)
        return
      }
      return notFound(req, res)
    } catch (err) {
      serverError(req, res, err)
    }
  })

  server.listen(opts.port, () => log.info(`card-server listening on :${opts.port}`))
  return server
}
