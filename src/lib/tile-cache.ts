/**
 * Browser map-tile caching layer.
 *
 * Two levels:
 *   1. Module-level in-memory Map<url, blobUrl>
 *      — survives SPA navigations within the same tab (instant, no I/O)
 *   2. Browser Cache API (`caches`) at "tile-cache-v1"
 *      — persists across page reloads / hard refreshes
 *
 * On first request for a tile:
 *   Check Cache API → if hit, create blob URL, store in memory, return.
 *   If miss, fetch from network, store in Cache API + memory, return blob URL.
 *
 * On subsequent requests (same session):
 *   Return from in-memory Map immediately — zero latency, zero network.
 *
 * On re-open (new tab):
 *   Cache API hit → create blob URL in ~1ms — no network round trip.
 *
 * Concurrent requests for the same tile are deduplicated via the in-flight Map.
 */

const CACHE_NAME = 'tile-cache-v1'

// In-memory mirror: tile URL → object URL (lives as long as the tab)
const _mem: Map<string, string> = new Map()

// In-flight promises — deduplicate simultaneous requests for the same tile
const _inFlight: Map<string, Promise<string>> = new Map()

/**
 * Fetch a tile and return a `blob:` URL that can be used as an `<img src>`.
 * Resolves instantly if the tile is already in memory or Cache API.
 * Falls back to the original URL string on any error (graceful degradation).
 */
export async function fetchTile(tileUrl: string): Promise<string> {
  // Level 1: in-memory (zero-latency)
  const hit = _mem.get(tileUrl)
  if (hit) return hit

  // Deduplicate concurrent requests
  const inflight = _inFlight.get(tileUrl)
  if (inflight) return inflight

  const promise = _fetchAndCache(tileUrl)
    .catch(() => tileUrl)           // fallback: let <img> try natively
    .finally(() => _inFlight.delete(tileUrl))

  _inFlight.set(tileUrl, promise)
  return promise
}

async function _fetchAndCache(url: string): Promise<string> {
  // Level 2: Cache API (persists across page reloads)
  if ('caches' in window) {
    try {
      const cache  = await caches.open(CACHE_NAME)
      const cached = await cache.match(url)
      if (cached) {
        const blob    = await cached.blob()
        const blobUrl = URL.createObjectURL(blob)
        _mem.set(url, blobUrl)
        return blobUrl
      }
    } catch { /* caches unavailable in insecure context — fall through */ }
  }

  // Level 3: Network fetch
  const res = await fetch(url, {
    // ArcGIS tiles don't need auth; skip ngrok warning header for external domains
    ...(url.includes('arcgisonline') || url.includes('openstreetmap') || url.includes('carto')
      ? {}
      : { headers: { } }),
  })

  if (!res.ok) throw new Error(`Tile HTTP ${res.status}`)

  // Store in Cache API for next reload
  if ('caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(url, res.clone())
    } catch { /* storage quota exceeded — ignore */ }
  }

  const blob    = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  _mem.set(url, blobUrl)
  return blobUrl
}

/**
 * Build a full ArcGIS satellite tile URL from z/y/x coordinates.
 */
export function arcgisTileUrl(z: number, y: number, x: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

/**
 * Evict all cached tiles (call on logout or after major map update).
 */
export async function clearTileCache(): Promise<void> {
  _mem.clear()
  if ('caches' in window) {
    try { await caches.delete(CACHE_NAME) } catch { /* noop */ }
  }
}
