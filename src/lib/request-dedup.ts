/**
 * In-flight GET request deduplication + debounce + throttle.
 *
 * Problem: multiple components mounting at the same time, rapid filter
 * changes, and route transitions all fire duplicate requests for the same
 * URL simultaneously — burning server connections and saturating the network.
 *
 * Solution:
 *   deduplicate — first caller fires; subsequent callers for the same key
 *     share the same Promise and resolve together.
 *   debounce    — delays execution until the caller stops firing (search/filter).
 *   throttle    — fires once immediately, drops calls within the window (refresh/focus).
 */

type AnyPromise = Promise<any>

const inFlight = new Map<string, AnyPromise>()

/**
 * Wrap a factory so concurrent calls with the same key share one in-flight
 * Promise. Auto-clears when the request settles.
 */
export function deduplicate<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>

  const promise = factory().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

export function inFlightCount(): number { return inFlight.size }
export function clearInFlight(): void   { inFlight.clear() }

/**
 * Returns a debounced version of fn that delays execution by waitMs.
 * Use for: search inputs, filter dropdowns, autocomplete.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; fn(...args) }, waitMs)
  }
}

/**
 * Returns a throttled version of fn that fires at most once per limitMs.
 * First call fires immediately; subsequent calls within the window are dropped.
 * Use for: manual sync buttons, tab focus, window resume.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limitMs: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall < limitMs) return
    lastCall = now
    fn(...args)
  }
}
