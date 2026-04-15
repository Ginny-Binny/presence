type Entry<T> = { value: T; expiresAt: number }

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>()

  get(key: string): T | null {
    const e = this.store.get(key)
    if (!e) return null
    if (Date.now() > e.expiresAt) { this.store.delete(key); return null }
    return e.value
  }

  // Returns the entry even if expired. Useful for stale-while-error fallback.
  getStale(key: string): T | null {
    return this.store.get(key)?.value ?? null
  }

  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
}
