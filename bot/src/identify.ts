// Intents: GUILDS (1<<0) + GUILD_PRESENCES (1<<8). Presence intent must also be
// toggled ON in the Discord developer portal or the gateway closes with 4014.
export const INTENTS = (1 << 0) | (1 << 8)

export function buildIdentify(token: string) {
  return {
    op: 2,
    d: {
      token,
      intents: INTENTS,
      properties: {
        os: process.platform,
        browser: 'psyduck-status',
        device: 'psyduck-status',
      },
      presence: { status: 'online', afk: false, since: 0, activities: [] },
    },
  }
}

export function buildResume(token: string, sessionId: string, seq: number | null) {
  return { op: 6, d: { token, session_id: sessionId, seq } }
}
