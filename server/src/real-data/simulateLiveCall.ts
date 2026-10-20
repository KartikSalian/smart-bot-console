import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { chunkWav } from '../audio/wavChunker.js'

const BASE = process.env.SIM_BASE_URL ?? 'http://localhost:4000'
const DURATION_SEC = Number(process.argv[2] ?? 30)
const CALL_SID = process.argv[3] ?? '0002f70f7386445b'

function rms(samples: Int16Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += (samples[i] / 32768) ** 2
  return Math.sqrt(sum / samples.length)
}

function wavRms(wav: Buffer): number {
  // samples start at byte 44 (standard 44-byte PCM header), 16-bit little-endian
  const pcm = wav.subarray(44)
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2)
  return rms(samples)
}

const SILENCE_THRESHOLD = 0.015

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'agent@smartbot.local', password: 'V8AnOEbcY2Pa' }),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('No session cookie returned')
  return setCookie.split(';')[0]
}

async function createSession(cookie: string): Promise<string> {
  const res = await fetch(`${BASE}/api/live/sessions`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`)
  const data = (await res.json()) as { sessionId: string }
  return data.sessionId
}

async function sendChunk(sessionId: string, role: 'agent' | 'customer', tSec: number, wav: Buffer, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'audio/wav' }
  if (cookie) headers.Cookie = cookie
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/live/sessions/${sessionId}/chunks?role=${role}&tSec=${tSec}`, {
    method: 'POST',
    headers,
    body: wav,
  })
  const elapsed = Date.now() - t0
  const body = await res.json().catch(() => ({}))
  return { role, tSec, ok: res.ok, elapsedMs: elapsed, status: res.status, body }
}

async function main() {
  console.log(`Simulating a ${DURATION_SEC}s two-party call using real audio from ${CALL_SID}...`)
  console.log(`Target: ${BASE}\n`)

  const cookie = await login()
  const sessionId = await createSession(cookie)
  console.log('Session:', sessionId)

  const agentWav = readFileSync(`sample_audio/${CALL_SID}_agent.wav`)
  const customerWav = readFileSync(`sample_audio/${CALL_SID}_caller.wav`)
  const agentChunks = chunkWav(agentWav, 3)
  const customerChunks = chunkWav(customerWav, 3)

  const numChunks = Math.ceil(DURATION_SEC / 3)
  const results: Array<{ role: string; tSec: number; ok: boolean; elapsedMs: number; status: number; skipped?: boolean }> = []

  const startTime = Date.now()

  const tasks: Promise<void>[] = []
  for (let i = 0; i < numChunks; i++) {
    const tSec = i * 3
    const delay = tSec * 1000 // real-time pacing, matching how two live devices would actually send

    if (i < agentChunks.length) {
      const chunk = agentChunks[i]
      tasks.push(
        (async () => {
          await new Promise((r) => setTimeout(r, delay))
          if (wavRms(chunk.wav) < SILENCE_THRESHOLD) {
            results.push({ role: 'agent', tSec, ok: true, elapsedMs: 0, status: 0, skipped: true })
            return
          }
          const r = await sendChunk(sessionId, 'agent', tSec, chunk.wav)
          results.push(r)
          console.log(`[t=${((Date.now() - startTime) / 1000).toFixed(1)}s] agent chunk tSec=${tSec}: ${r.ok ? 'OK' : 'FAIL'} in ${r.elapsedMs}ms (status ${r.status})`)
        })(),
      )
    }

    if (i < customerChunks.length) {
      const chunk = customerChunks[i]
      tasks.push(
        (async () => {
          await new Promise((r) => setTimeout(r, delay + 200)) // slight offset, like two independent devices
          if (wavRms(chunk.wav) < SILENCE_THRESHOLD) {
            results.push({ role: 'customer', tSec, ok: true, elapsedMs: 0, status: 0, skipped: true })
            return
          }
          const r = await sendChunk(sessionId, 'customer', tSec, chunk.wav)
          results.push(r)
          console.log(`[t=${((Date.now() - startTime) / 1000).toFixed(1)}s] customer chunk tSec=${tSec}: ${r.ok ? 'OK' : 'FAIL'} in ${r.elapsedMs}ms (status ${r.status})`)
        })(),
      )
    }
  }

  await Promise.all(tasks)

  const sent = results.filter((r) => !r.skipped)
  const skipped = results.filter((r) => r.skipped)
  const failed = sent.filter((r) => !r.ok)

  console.log('\n--- Summary ---')
  console.log('Total chunks:', results.length, '| sent:', sent.length, '| skipped (VAD):', skipped.length, '| failed:', failed.length)
  if (sent.length > 0) {
    const times = sent.map((r) => r.elapsedMs)
    console.log('Round-trip latency — min:', Math.min(...times) + 'ms', '| max:', Math.max(...times) + 'ms', '| avg:', Math.round(times.reduce((a, b) => a + b, 0) / times.length) + 'ms')
  }
  console.log('\nWindow for CloudWatch check:', new Date(startTime).toISOString(), 'to', new Date().toISOString())
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
