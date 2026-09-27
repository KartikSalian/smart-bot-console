import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildRealSentimentSeries, type RealSentimentChunk } from './buildRealCall.js'
import { checkVulnerability, scalarSentiment } from '../rules/rules.js'

const AUDIO_DIR = join(process.cwd(), 'sample_audio')
const OUT_PATH = join(process.cwd(), '../public/sample_data/real_calls.json')

const SIDS = [
  '0002f70f7386445b', '004860b1ab2e4c88', '0091a706bc604188', '00d676d7058c49bb', '00f7dce6fc3849a2',
  '010d38f5ada54e0d', '010eaccb7a23436f', '0126ffdce48049a9', '0188295665114e74', '01cefd6f5c044a6f',
  '01f7ec3700424bc0', '020e48edcf0940a4', '021cd80ca7cc464b', '0224c92b64d144d4', '02b03e407894474b',
  '02e41649e7c441fd', '02fd023b18d246d0', '0317f95f3d7441c5', '034a32d3b6e4435a', '035edd1d09c1433e',
  '0377245f73a54480', '0395f6997a8e4836', '03a17cc36d474151', '03aad8e17c8d4d81', '03df1bec638a46e6',
  '03fccf2cf2254435', '040f493852fe4553', '04a1020bb9bc4a45', '04a13b358adb4eff', '056d09d7b63046e3',
]

const AGENTS = [
  { id: 'ag-niamh', name: 'Niamh (Agent)', script: 'Script A', email: 'agent@smartbot.local' },
  { id: 'ag-callum', name: 'Callum R. (Agent)', script: 'Script B', email: 'callum.agent@smartbot.local' },
  { id: 'ag-priya', name: 'Priya S. (Agent)', script: 'Script C', email: 'priya.agent@smartbot.local' },
]

const CATEGORY_MAP: Record<string, string> = {
  'replace card': 'Access',
  'check balance': 'Billing',
  'transfer money': 'Billing',
  'schedule appointment': 'Other',
  'get branch hours': 'Other',
  'reset password': 'Access',
  'order checks': 'Product',
  'pay bill': 'Billing',
}

interface TranscriptSegment {
  channel_index: number
  dialog_acts: string[]
  duration_ms: number
  human_transcript: string
  speaker_role: 'agent' | 'caller'
  start_ms: number
}

interface Metadata {
  agent: { responses: Array<{ data?: { task_type?: string } }> }
  caller: { responses: Array<unknown> }
  tasks: Array<{ task_type: string }>
}

function getWavDurationSec(buf: Buffer): number {
  const byteRate = buf.readUInt32LE(28)
  const dataLength = buf.length - 44
  return byteRate > 0 ? dataLength / byteRate : 0
}

function maskCustomerRef(sid: string): string {
  return `CUST-${sid.slice(0, 4).toUpperCase()}`
}

async function buildCall(sid: string, index: number) {
  const callerWav = readFileSync(join(AUDIO_DIR, `${sid}_caller.wav`))
  const transcript: TranscriptSegment[] = JSON.parse(
    readFileSync(join(AUDIO_DIR, `${sid}_transcript.json`), 'utf-8'),
  )
  const metadata: Metadata = JSON.parse(readFileSync(join(AUDIO_DIR, `${sid}_metadata.json`), 'utf-8'))

  console.log(`\n[${index + 1}/${SIDS.length}] ${sid} — running real inference...`)
  const series: RealSentimentChunk[] = await buildRealSentimentSeries(callerWav)

  if (series.length === 0) {
    console.warn(`  No usable chunks for ${sid}, skipping.`)
    return null
  }

  const scalars = series.map(scalarSentiment)
  const start = scalars.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, scalars.length)
  const end = scalars.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, scalars.length)

  const emotionTotals = { anger: 0, happy: 0, neutral: 0, sad: 0 }
  for (const c of series) {
    emotionTotals.anger += c.anger
    emotionTotals.happy += c.happy
    emotionTotals.neutral += c.neutral
    emotionTotals.sad += c.sad
  }
  const dominantEmotion = (Object.keys(emotionTotals) as Array<keyof typeof emotionTotals>).reduce((best, e) =>
    emotionTotals[e] > emotionTotals[best] ? e : best,
  )

  const meanMaxProb = series.reduce((sum, c) => sum + Math.max(c.anger, c.happy, c.neutral, c.sad), 0) / series.length

  const vuln = checkVulnerability(series)

  const taskType = metadata.tasks?.[0]?.task_type ?? 'other'
  const category = CATEGORY_MAP[taskType] ?? 'Other'

  const questions_asked = transcript
    .filter((s) => s.speaker_role === 'caller' && s.dialog_acts?.some((a) => a.includes('question')))
    .map((s) => ({
      text: s.human_transcript,
      transcript_ref: { startSec: Math.round(s.start_ms / 1000), endSec: Math.round((s.start_ms + s.duration_ms) / 1000) },
    }))

  const actions_completed = transcript
    .filter(
      (s) =>
        s.speaker_role === 'agent' &&
        s.dialog_acts?.some((a) => ['gridspace_data_response', 'gridspace_confirm_data', 'gridspace_procedure_explanation'].includes(a)),
    )
    .map((s) => ({
      text: s.human_transcript,
      transcript_ref: { startSec: Math.round(s.start_ms / 1000), endSec: Math.round((s.start_ms + s.duration_ms) / 1000) },
    }))

  const lastSegment = transcript[transcript.length - 1]
  const resolved = (metadata.caller?.responses?.length ?? 0) > 0

  const agent = AGENTS[Math.floor(index / 10)]

  const durationSec = Math.round(getWavDurationSec(callerWav))
  const startedAt = new Date(Date.now() - (SIDS.length - index) * 15 * 60 * 1000).toISOString()

  return {
    callId: `H-${String(index + 1).padStart(3, '0')}`,
    platform: 'standalone',
    startedAt,
    durationSec,
    agent: { id: agent.id, name: agent.name, script: agent.script },
    customerRef: maskCustomerRef(sid),

    call_reason: { category, statedReason: taskType.charAt(0).toUpperCase() + taskType.slice(1) },
    questions_asked,
    actions_completed,
    issues: [
      {
        category,
        status: resolved ? 'resolved' : 'unresolved',
        transcript_ref: {
          startSec: Math.round((lastSegment?.start_ms ?? 0) / 1000),
          endSec: Math.round(((lastSegment?.start_ms ?? 0) + (lastSegment?.duration_ms ?? 0)) / 1000),
        },
      },
    ],

    sentiment_trajectory: {
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
      delta: Number((end - start).toFixed(2)),
      dominantEmotion,
      series,
    },

    compliance_flags: {
      vulnerability: vuln.triggered,
      vulnerability_reason: vuln.reason,
      repeat_contact: false,
    },

    confidence: {
      overall: Number(meanMaxProb.toFixed(2)),
      low_confidence_fields: [] as string[],
      needs_review: meanMaxProb < 0.65 || vuln.triggered,
    },

    transcript: transcript.map((s) => ({
      tSec: Math.round(s.start_ms / 1000),
      speaker: s.speaker_role === 'caller' ? 'customer' : 'agent',
      text: s.human_transcript,
    })),
  }
}

async function main() {
  const calls = []
  for (let i = 0; i < SIDS.length; i++) {
    const call = await buildCall(SIDS[i], i)
    if (call) calls.push(call)
  }

  writeFileSync(OUT_PATH, JSON.stringify(calls, null, 2))
  console.log(`\nWrote ${calls.length} real calls to ${OUT_PATH}`)
}

main().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
