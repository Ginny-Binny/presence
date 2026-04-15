import Redis from 'ioredis'
import { log } from './log.js'

export function connectRedis(url: string): Redis {
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  })
  client.on('error', (err) => log.warn('redis error', err.message))
  client.on('connect', () => log.info('redis connected'))
  return client
}
