import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { Role } from './authApi'

const HOME_FOR_ROLE: Record<Role, string> = {
  supervisor: '/',
  agent: '/live',
}

export function RequireAuth({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--soft)' }}>Loading…</div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={HOME_FOR_ROLE[user.role]} replace />
  }

  return <>{children}</>
}
