import jwt from 'jsonwebtoken'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set')
}
const JWT_SECRET: string = process.env.JWT_SECRET

export type Role = 'agent' | 'supervisor'

export interface SessionPayload {
  userId: number
  email: string
  role: Role
  name: string
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' })
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, JWT_SECRET) as SessionPayload
}
