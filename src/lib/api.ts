/**
 * Central HTTP client for the Globe web frontend.
 *
 * Every GET goes through cachedGet() which implements:
 *   1. Stale cache → shown immediately while validating in background
 *   2. In-flight deduplication → concurrent callers share one Promise
 *   3. ETag / If-None-Match → 304 Not Modified skips DB on the backend
 *   4. 200 OK → parse, update cache (new ETag + fresh TTL)
 *   5. Network error → return stale cache if available, else rethrow
 *
 * POST / PUT / PATCH / DELETE are thin wrappers — no caching.
 */

import { API_BASE, getToken } from '@/lib/auth'
import { cacheGetStale, cacheSet, TTL } from '@/lib/cache'
import { deduplicate } from '@/lib/request-dedup'

// ── TTL routing ───────────────────────────────────────────────────────────────

function ttlForUrl(url: string): number {
  if (/\/(regions|provinces|cities|barangays)/.test(url)) return TTL.LONG
  if (/\/map-pins|\/poles\/map|\/map$/.test(url))          return TTL.MAP
  if (/\/teardowns|\/pole-reports/.test(url))              return TTL.SHORT
  return TTL.DEFAULT
}

// ── Auth headers ──────────────────────────────────────────────────────────────

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

// ── Core GET with ETag + cache + dedup ────────────────────────────────────────

export async function apiGet<T = any>(path: string): Promise<T> {
  const fullUrl = path.startsWith('http') ? path : `${API_BASE}${path}`
  const cacheKey = `apicache:${path}`
  const ttlMs = ttlForUrl(path)

  const stale = cacheGetStale<T>(cacheKey)

  return deduplicate(fullUrl, async () => {
    const extraHeaders: Record<string, string> = {}
    if (stale?.etag) extraHeaders['If-None-Match'] = stale.etag

    let response: Response
    try {
      response = await fetch(fullUrl, {
        method: 'GET',
        headers: buildHeaders(extraHeaders),
      })
    } catch (networkErr) {
      if (stale) return stale.data
      throw networkErr
    }

    // 304 Not Modified — server confirms nothing changed
    if (response.status === 304) {
      return stale!.data
    }

    if (!response.ok) {
      // 401 = token expired / invalid — clear session and redirect to login
      if (response.status === 401) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        window.location.href = '/login'
        throw new Error('Session expired. Please log in again.')
      }
      if (stale) return stale.data
      const text = await response.text()
      let msg = 'Request failed'
      try { msg = JSON.parse(text)?.message ?? msg } catch { /* noop */ }
      throw new Error(msg)
    }

    const data: T = await response.json()
    const newEtag = response.headers.get('ETag')
    cacheSet(cacheKey, data, ttlMs, newEtag)
    return data
  })
}

// ── Mutation helpers (no caching) ─────────────────────────────────────────────

async function mutate(method: string, path: string, body?: unknown): Promise<any> {
  const fullUrl = path.startsWith('http') ? path : `${API_BASE}${path}`
  const isFormData = body instanceof FormData
  const headers = buildHeaders(isFormData ? { 'Content-Type': undefined as any } : {})
  if (isFormData) delete headers['Content-Type']

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  })

  const text = await res.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { data = { message: text } }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
      throw new Error('Session expired.')
    }
    const err: any = new Error(data?.message ?? 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const apiPost   = (path: string, body: unknown) => mutate('POST',   path, body)
export const apiPut    = (path: string, body: unknown) => mutate('PUT',    path, body)
export const apiPatch  = (path: string, body: unknown) => mutate('PATCH',  path, body)
export const apiDelete = (path: string)                => mutate('DELETE', path)
