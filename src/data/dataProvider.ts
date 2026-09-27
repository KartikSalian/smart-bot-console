import type { Call } from '../types'
import { API_BASE } from '../config'

export interface DataProvider {
  /** Real Harper Valley Bank calls, scored by the live SERTS model. Supervisor Overview/Call summaries. */
  getRealCalls(): Promise<Call[]>
  getRealCall(callId: string): Promise<Call | undefined>
  /** Same real dataset, scoped server-side to the logged-in agent. */
  getMyCalls(): Promise<Call[]>
  /** Synthetic scripted demo data — Live agent-assist replay only. */
  getScriptedCalls(): Promise<Call[]>
}

async function fetchJson(path: string): Promise<Call[]> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`)
  return (await res.json()) as Call[]
}

class ApiDataProvider implements DataProvider {
  private realCache: Call[] | null = null
  private myCache: Call[] | null = null
  private scriptedCache: Call[] | null = null

  async getRealCalls(): Promise<Call[]> {
    if (!this.realCache) this.realCache = await fetchJson('/calls/real')
    return this.realCache
  }

  async getRealCall(callId: string): Promise<Call | undefined> {
    const calls = await this.getRealCalls()
    return calls.find((c) => c.callId === callId)
  }

  async getMyCalls(): Promise<Call[]> {
    if (!this.myCache) this.myCache = await fetchJson('/calls/mine')
    return this.myCache
  }

  async getScriptedCalls(): Promise<Call[]> {
    if (!this.scriptedCache) this.scriptedCache = await fetchJson('/calls')
    return this.scriptedCache
  }
}

export const dataProvider: DataProvider = new ApiDataProvider()
