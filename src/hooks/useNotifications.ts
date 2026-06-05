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

// Poll only the lightweight count every 60s — not the full list
const COUNT_POLL_MS = 60_000

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [loading,       setLoading]       = useState(false)
  const [listLoaded,    setListLoaded]    = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Lightweight poll — only fetches unread count for the badge
  const pollCount = useCallback(async () => {
    try {
      const res = await apiGet<{ unread_count: number }>(
        '/api/v1/skycable/notifications/unread-count'
      )
      setUnreadCount(res.unread_count ?? 0)
    } catch {
      // silently fail
    }
  }, [])

  // Full list — only called when user opens the notification panel
  const loadList = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await apiGet<{ notifications: AppNotification[]; unread_count: number }>(
        '/api/v1/skycable/notifications'
      )
      setNotifications(res.notifications ?? [])
      setUnreadCount(res.unread_count ?? 0)
      setListLoaded(true)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [loading])

  useEffect(() => {
    // Initial count fetch on mount
    pollCount()
    // Poll count only every 60s — NOT the full list
    timerRef.current = setInterval(pollCount, COUNT_POLL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [pollCount])

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

  return { notifications, unreadCount, loading, listLoaded, markRead, markAllRead, loadList, refresh: loadList }
}
