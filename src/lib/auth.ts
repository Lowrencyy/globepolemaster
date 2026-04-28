export const API_BASE = 'https://disguisedly-enarthrodial-kristi.ngrok-free.dev'
export const SKYCABLE_API = `${API_BASE}/api/v1/skycable`

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

export function isExecutive(): boolean {
  const user = getUser()
  if (user) {
    const fields = ['role', 'roles', 'role_name', 'user_role', 'type', 'user_type']
    for (const f of fields) {
      const val = user[f]
      if (typeof val === 'string' && ['executive', 'exec', 'manager'].includes(val.toLowerCase())) return true
    }
  }
  return false
}

export function canManageStatus(): boolean {
  return isAdmin() || isExecutive()
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
