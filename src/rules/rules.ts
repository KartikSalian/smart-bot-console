import type { CallTrend, SentimentChunk } from '../types'

/**
 * Central rules config. Every threshold here must be explainable — the "Why:" strings
 * are surfaced verbatim in alerts and compliance flags so nothing is a black box.
 */
export const RULES = {
  vulnerability: {
    sadThreshold: 0.55,
    windowChunks: 10, // 10 * 3s = 30s
  },
  angerEscalation: {
    angerThreshold: 0.5,
    windowChunks: 5, // 5 * 3s = 15s
  },
  elevatedSadness: {
    sadThreshold: 0.4,
  },
  trend: {
    windowChunks: 4,
    escalatingSlope: -0.12,
    calmingSlope: 0.12,
  },
  confidence: {
    reviewThreshold: 0.65,
  },
} as const

export function scalarSentiment(chunk: SentimentChunk): number {
  return chunk.happy - (0.7 * chunk.sad + 1.0 * chunk.anger)
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** Sliding window over the trailing N chunks up to (and including) index `uptoIdx`. */
function trailingWindow<T>(series: T[], uptoIdx: number, size: number): T[] {
  const start = Math.max(0, uptoIdx - size + 1)
  return series.slice(start, uptoIdx + 1)
}

export interface VulnerabilityCheck {
  triggered: boolean
  reason: string | null
}

/** Checks the full series for a sustained-distress window (FG21/1 vulnerability trigger). */
export function checkVulnerability(series: SentimentChunk[]): VulnerabilityCheck {
  const { sadThreshold, windowChunks } = RULES.vulnerability
  for (let i = windowChunks - 1; i < series.length; i++) {
    const window = trailingWindow(series, i, windowChunks)
    const meanSad = mean(window.map((c) => c.sad))
    if (meanSad >= sadThreshold) {
      const startSec = window[0].tSec
      return {
        triggered: true,
        reason: `Sustained sadness (mean sad ${meanSad.toFixed(2)} ≥ ${sadThreshold} for ${windowChunks * 3}s at ${startSec}s)`,
      }
    }
  }
  return { triggered: false, reason: null }
}

export interface LiveAlert {
  level: 'critical' | 'warn'
  title: string
  message: string
  why: string
}

/** Live, per-moment alerts for the agent-assist panel, evaluated on chunks seen so far. */
export function getLiveAlert(seriesSoFar: SentimentChunk[]): LiveAlert | null {
  if (seriesSoFar.length === 0) return null

  const lastIdx = seriesSoFar.length - 1
  const { angerThreshold, windowChunks: angerWindow } = RULES.angerEscalation
  const angerSlice = trailingWindow(seriesSoFar, lastIdx, angerWindow)
  const meanAnger = mean(angerSlice.map((c) => c.anger))

  const { sadThreshold: vulnSadThreshold, windowChunks: vulnWindow } = RULES.vulnerability
  const vulnSlice = trailingWindow(seriesSoFar, lastIdx, vulnWindow)
  const meanVulnSad = mean(vulnSlice.map((c) => c.sad))

  if (vulnSlice.length === vulnWindow && meanVulnSad >= vulnSadThreshold) {
    return {
      level: 'critical',
      title: 'Vulnerability alert (FG21/1)',
      message: 'Acknowledge how they feel, slow your pace, follow the vulnerable-customer process.',
      why: `Mean sadness ${meanVulnSad.toFixed(2)} ≥ ${vulnSadThreshold} over the last ${vulnWindow * 3}s`,
    }
  }

  if (angerSlice.length === angerWindow && meanAnger >= angerThreshold) {
    return {
      level: 'critical',
      title: 'De-escalate',
      message: 'Let them finish, lower your tone, acknowledge the frustration.',
      why: `Mean anger ${meanAnger.toFixed(2)} ≥ ${angerThreshold} over the last ${angerWindow * 3}s`,
    }
  }

  const currentSad = seriesSoFar[lastIdx].sad
  if (currentSad >= RULES.elevatedSadness.sadThreshold) {
    return {
      level: 'warn',
      title: 'Elevated sadness',
      message: 'Check in on how they are feeling before moving on.',
      why: `Current sadness ${currentSad.toFixed(2)} ≥ ${RULES.elevatedSadness.sadThreshold}`,
    }
  }

  return null
}

/** Trend = slope of scalar sentiment over the last N chunks. */
export function getTrend(seriesSoFar: SentimentChunk[]): CallTrend {
  const { windowChunks, escalatingSlope, calmingSlope } = RULES.trend
  if (seriesSoFar.length < 2) return 'Steady'

  const lastIdx = seriesSoFar.length - 1
  const window = trailingWindow(seriesSoFar, lastIdx, windowChunks)
  if (window.length < 2) return 'Steady'

  const scalars = window.map(scalarSentiment)
  const first = scalars[0]
  const last = scalars[scalars.length - 1]
  const dt = window[window.length - 1].tSec - window[0].tSec
  const slope = dt > 0 ? (last - first) / (dt / 3) : 0

  if (slope < escalatingSlope) return 'Escalating'
  if (slope > calmingSlope) return 'Calming'
  return 'Steady'
}

export function needsHumanReview(overallConfidence: number, vulnerabilityFlag: boolean): boolean {
  return overallConfidence < RULES.confidence.reviewThreshold || vulnerabilityFlag
}
