import Redis from 'ioredis'
import { loadEnv, log } from './log.js'
import { startServer } from './server.js'

const env = loadEnv(['REDIS_URL', 'WAKAPI_URL', 'WAKAPI_API_KEY', 'DISCORD_USER_ID'])
const port = Number(process.env.PORT || 3002)
const svgWidth = Number(process.env.SVG_WIDTH || 480)

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false })
redis.on('error', (e) => log.warn('redis error', e.message))
redis.on('connect', () => log.info('redis connected'))

const server = startServer({
  port,
  redis,
  userId: env.DISCORD_USER_ID,
  wakapiUrl: env.WAKAPI_URL,
  wakapiKey: env.WAKAPI_API_KEY,
  svgWidth,
})

const shutdown = (sig: string) => {
  log.info(`${sig} received, shutting down`)
  server.close(() => { redis.disconnect(); process.exit(0) })
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
