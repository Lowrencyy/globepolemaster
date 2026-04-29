const TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> { data: T; ts: number }

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.ts > TTL_MS) { sessionStorage.removeItem(key); return null }
    return entry.data
  } catch { return null }
}

export function cacheSet<T>(key: string, data: T) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch { /* storage full */ }
}

export function cacheDel(key: string) {
  try { sessionStorage.removeItem(key) } catch {}
}
