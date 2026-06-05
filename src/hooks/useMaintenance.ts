import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../lib/auth'

export type CompanyKey = 'skycable' | 'globe' | 'meralco'

export type MaintenanceStatus = {
  any_active: boolean
  companies: Record<CompanyKey, {
    active: boolean
    message: string | null
    started_at: string | null
    set_by: string | null
  }>
}

const POLL_MS = 60_000 // check every 1 minute

export function useMaintenance() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null)

  const check = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/v1/maintenance`)
      const data = await res.json()
      setStatus(data)
    } catch {
      // network error — don't show maintenance screen
    }
  }, [])

  useEffect(() => {
    check()
    const iv = setInterval(check, POLL_MS)
    return () => clearInterval(iv)
  }, [check])

  const isCompanyDown = (company: CompanyKey) =>
    status?.companies?.[company]?.active === true

  return { status, isCompanyDown, refetch: check }
}
