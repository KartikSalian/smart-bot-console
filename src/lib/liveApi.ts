import { API_BASE } from '../config'

export interface LiveChunkResult {
  role: 'agent' | 'customer'
  tSec: number
  anger: number
  happy: number
  neutral: number
  sad: number
}

export async function startLiveSession(): Promise<string> {
  const res = await fetch(`${API_BASE}/live/sessions`, { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new Error('Failed to start live session')
  const data = await res.json()
  return data.sessionId as string
}

export async function submitChunk(
  sessionId: string,
  role: 'agent' | 'customer',
  tSec: number,
  wav: Blob,
): Promise<LiveChunkResult> {
  const res = await fetch(`${API_BASE}/live/sessions/${sessionId}/chunks?role=${role}&tSec=${tSec}`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: wav,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Chunk submission failed (${res.status})`)
  }
  return res.json()
}

export async function getSessionResults(sessionId: string): Promise<LiveChunkResult[]> {
  const res = await fetch(`${API_BASE}/live/sessions/${sessionId}`)
  if (!res.ok) throw new Error('Failed to fetch session results')
  const data = await res.json()
  return data.chunks as LiveChunkResult[]
}
