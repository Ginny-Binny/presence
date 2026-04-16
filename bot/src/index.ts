import { loadEnv, log } from './log.js'
import { connectRedis } from './redis.js'
import { runGateway } from './gateway.js'
import { startUserProfileLoop } from './userprofile.js'

const env = loadEnv(['DISCORD_TOKEN', 'DISCORD_USER_ID', 'REDIS_URL'])

const redis = connectRedis(env.REDIS_URL)

runGateway({
  token: env.DISCORD_TOKEN,
  userId: env.DISCORD_USER_ID,
  redis,
})

// REST poll for avatar/badges/decoration — gateway events don't carry them.
startUserProfileLoop(redis, env.DISCORD_TOKEN, env.DISCORD_USER_ID)

const shutdown = (sig: string) => {
  log.info(`${sig} received, shutting down`)
  redis.disconnect()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
