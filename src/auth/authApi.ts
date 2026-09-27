import { API_BASE as BASE } from '../config'

const API_BASE = `${BASE}/auth`

export type Role = 'agent' | 'supervisor'

export interface SessionUser {
  email: string
  role: Role
  name: string
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Login failed')
  }
  const data = await res.json()
  return data.user as SessionUser
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' })
}

export async function fetchMe(): Promise<SessionUser | null> {
  const res = await fetch(`${API_BASE}/me`, { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json()
  return data.user as SessionUser
}
