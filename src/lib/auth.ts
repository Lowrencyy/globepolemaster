export const API_BASE = 'https://disguisedly-enarthrodial-kristi.ngrok-free.dev'
export const SKYCABLE_API = `${API_BASE}/api/v1/skycable`
export const GLOBE_API = `${API_BASE}/api/v1/globe`

export interface LoginResponse {
  token?: string
  access_token?: string
  user?: Record<string, unknown>
  message?: string
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/api/v1/skycable/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Login failed')
  return data
}

export function saveToken(token: string) {
  localStorage.setItem('auth_token', token)
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

export function removeToken() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function saveUser(user: Record<string, unknown>) {
  localStorage.setItem('auth_user', JSON.stringify(user))
}

export function getUser(): Record<string, unknown> | null {
  const raw = localStorage.getItem('auth_user')
  return raw ? JSON.parse(raw) : null
}

function checkRoleValue(val: unknown): boolean {
  if (!val) return false
  if (typeof val === 'string') return ['admin', 'super_admin', 'administrator'].includes(val.toLowerCase())
  if (Array.isArray(val)) return val.some(v => checkRoleValue(v))
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>
    return checkRoleValue(o.name ?? o.slug ?? o.role ?? '')
  }
  return false
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function getRole(): string {
  const user = getUser()
  if (user) {
    const fields = ['role', 'role_name', 'user_role', 'type', 'user_type']
    for (const f of fields) {
      if (user[f] && typeof user[f] === 'string') return (user[f] as string).toLowerCase()
    }
  }
  return 'field_staff'
}

function roleIs(role: string, ...values: string[]): boolean {
  const user = getUser()
  if (user) {
    const fields = ['role', 'roles', 'role_name', 'user_role', 'type', 'user_type']
    for (const f of fields) {
      const val = user[f]
      if (typeof val === 'string' && values.includes(val.toLowerCase())) return true
    }
  }
  return false
}

// ── Role checks ────────────────────────────────────────────────────────────

export function isExecutive(): boolean {
  return roleIs('executive', 'executive', 'exec', 'manager')
}

/** Skycable / Globe client — read-only project view */
export function isClient(): boolean {
  return roleIs('client', 'client', 'viewer', 'customer', 'skycable_client', 'globe_client')
}

/** Subcontractor company-level admin */
export function isSubcontractor(): boolean {
  return roleIs('subcontractor', 'subcontractor', 'subcon', 'subcontractor_admin')
}

/** Project manager — subcon staff that can also access warehouse */
export function isProjectManager(): boolean {
  return roleIs('pm', 'project_manager', 'pm', 'project manager')
}

/** Warehouse in-charge — manages inventory */
export function isWarehouseIncharge(): boolean {
  return roleIs('warehouse', 'warehouse_incharge', 'warehouse_incharge', 'warehouse')
}

/** Any subcontractor-side user (subcon admin, PM, warehouse, field staff) */
export function isSubconSide(): boolean {
  return isSubcontractor() || isProjectManager() || isWarehouseIncharge()
    || roleIs('field', 'field_staff', 'lineman', 'technician')
}

/** TelcoVantage internal team (admin or executive) */
export function isTelcoVantage(): boolean {
  return isAdmin() || isExecutive()
}

/**
 * Resolved role string — use this for if/else branching.
 * Priority order: admin > executive > client > project_manager > warehouse_incharge > subcontractor > field_staff
 */
export type AppRole =
  | 'admin'
  | 'executive'
  | 'client'
  | 'project_manager'
  | 'warehouse_incharge'
  | 'subcontractor'
  | 'field_staff'

export function getAppRole(): AppRole {
  if (isAdmin())            return 'admin'
  if (isExecutive())        return 'executive'
  if (isClient())           return 'client'
  if (isProjectManager())   return 'project_manager'
  if (isWarehouseIncharge()) return 'warehouse_incharge'
  if (isSubcontractor())    return 'subcontractor'
  return 'field_staff'
}

/** Home route for each role after login */
export function getHomeRoute(): string {
  const role = getAppRole()
  if (role === 'admin' || role === 'executive') return '/dashboard'
  if (role === 'client')                         return '/client-dashboard'
  if (isSubconSide())                            return '/subcon-dashboard'
  return '/sites'
}

export function canManageStatus(): boolean {
  return isAdmin() || isExecutive()
}

/** True if the user can access user management pages */
export function canManageUsers(): boolean {
  return isAdmin()
}

/** True if the user can manage subcontractor users (not system users) */
export function canManageSubconUsers(): boolean {
  return isAdmin() || isExecutive()
}

/** True if the user can access warehouse/inventory */
export function canAccessWarehouse(): boolean {
  return isAdmin() || isExecutive() || isProjectManager() || isWarehouseIncharge()
}

/** Subcontractor ID of the logged-in user (null if internal/client) */
export function getSubcontractorId(): number | null {
  const user = getUser()
  const id = user?.subcontractor_id
  return id && typeof id === 'number' ? id : null
}

/** Team ID of the logged-in user */
export function getTeamId(): number | null {
  const user = getUser()
  const id = user?.team_id
  return id && typeof id === 'number' ? id : null
}

/** Subcontractor name from saved user */
export function getSubcontractorName(): string {
  const user = getUser()
  return String(user?.subcontractor_name ?? user?.company ?? 'Your Company')
}

export function isAdmin(): boolean {
  // Try saved user object first
  const user = getUser()
  if (user) {
    const fields = ['role', 'roles', 'role_name', 'user_role', 'type', 'user_type']
    for (const f of fields) {
      if (checkRoleValue(user[f])) return true
    }
  }

  // Fall back to JWT payload
  const token = getToken()
  if (token) {
    const payload = decodeJwtPayload(token)
    if (payload) {
      const fields = ['role', 'roles', 'role_name', 'user_role', 'type', 'user_type']
      for (const f of fields) {
        if (checkRoleValue(payload[f])) return true
      }
    }
  }

  return false
}
