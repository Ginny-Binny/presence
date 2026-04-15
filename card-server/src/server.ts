import http from 'node:http'
import type Redis from 'ioredis'
import { log } from './log.js'
import { handleCard, handleHealthz, notFound, serverError } from './routes.js'

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
      return notFound(req, res)
    } catch (err) {
      serverError(req, res, err)
    }
  })

  server.listen(opts.port, () => log.info(`card-server listening on :${opts.port}`))
  return server
}
