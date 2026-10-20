import { randomBytes } from 'node:crypto'

export interface LiveChunkResult {
  role: 'agent' | 'customer'
  tSec: number
  anger: number
  happy: number
  neutral: number
  sad: number
}

export interface LiveSession {
  id: string
  createdByEmail: string
  createdAt: number
  chunks: LiveChunkResult[]
}

// In-memory only — ephemeral by design, a live call session doesn't need to survive a restart.
const sessions = new Map<string, LiveSession>()

const SESSION_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

export function createSession(createdByEmail: string): LiveSession {
  const id = randomBytes(4).toString('hex')
  const session: LiveSession = { id, createdByEmail, createdAt: Date.now(), chunks: [] }
  sessions.set(id, session)
  return session
}

export function getSession(id: string): LiveSession | undefined {
  const session = sessions.get(id)
  if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id)
    return undefined
  }
  return session
}

export function addChunkResult(id: string, result: LiveChunkResult): boolean {
  const session = getSession(id)
  if (!session) return false
  session.chunks.push(result)
  return true
}
