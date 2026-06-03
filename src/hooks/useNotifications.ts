import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'

export interface AppNotification {
  id: number
  type: string
  title: string
  body: string
  data: Record<string, any> | null
  read_at: string | null
  created_at: string
}

const POLL_MS = 30_000 // poll every 30s

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [loading,       setLoading]       = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    try {
      const res = await apiGet<{ notifications: AppNotification[]; unread_count: number }>(
        '/api/v1/skycable/notifications'
      )
      setNotifications(res.notifications ?? [])
      setUnreadCount(res.unread_count ?? 0)
    } catch {
      // silently fail — don't crash the navbar
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    timerRef.current = setInterval(fetch, POLL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetch])

  const markRead = useCallback(async (id: number) => {
    try {
      await apiPost(`/api/v1/skycable/notifications/${id}/read`, {})
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch {}
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await apiPost('/api/v1/skycable/notifications/read-all', {})
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
      setUnreadCount(0)
    } catch {}
  }, [])

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh: fetch }
}
