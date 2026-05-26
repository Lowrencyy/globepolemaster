export const TTL = {
  DEFAULT:   5 * 60 * 1000,  // 5 min
  LONG:     24 * 60 * 60 * 1000, // 24 h — static data (PSGC, etc.)
  MAP:       2 * 60 * 1000,  // 2 min — map pins
  SHORT:     1 * 60 * 1000,  // 1 min — live/frequently-changing data
} as const

interface CacheEntry<T> { data: T; ts: number; ttl: number; etag?: string | null }

export function cacheGet<T>(key: string, ttlMs = TTL.DEFAULT): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const effectiveTtl = entry.ttl ?? ttlMs
    if (Date.now() - entry.ts > effectiveTtl) { sessionStorage.removeItem(key); return null }
    return entry.data
  } catch { return null }
}

/** Returns data even if expired — used for stale-while-revalidate and offline fallback. */
export function cacheGetStale<T>(key: string): { data: T; etag: string | null } | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    return { data: entry.data, etag: entry.etag ?? null }
  } catch { return null }
}

export function cacheSet<T>(key: string, data: T, ttlMs = TTL.DEFAULT, etag?: string | null) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now(), ttl: ttlMs, etag: etag ?? null }))
  } catch { /* storage full */ }
}

export function cacheDel(key: string) {
  try { sessionStorage.removeItem(key) } catch {}
}

/** Remove all entries whose keys start with prefix (e.g. after a mutation). */
export function cacheDelByPrefix(prefix: string) {
  try {
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(prefix))
    keys.forEach(k => sessionStorage.removeItem(k))
  } catch {}
}
