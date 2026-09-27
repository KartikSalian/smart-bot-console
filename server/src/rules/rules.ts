/**
 * Mirrors src/rules/rules.ts on the frontend (§4 of the build brief).
 * Kept in sync manually since frontend/backend are separate TS projects.
 */

interface SentimentChunk {
  tSec: number
  anger: number
  happy: number
  neutral: number
  sad: number
}

const VULNERABILITY = { sadThreshold: 0.55, windowChunks: 10 }

export function scalarSentiment(chunk: SentimentChunk): number {
  return chunk.happy - (0.7 * chunk.sad + 1.0 * chunk.anger)
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export interface VulnerabilityCheck {
  triggered: boolean
  reason: string | null
}

export function checkVulnerability(series: SentimentChunk[]): VulnerabilityCheck {
  const { sadThreshold, windowChunks } = VULNERABILITY
  for (let i = windowChunks - 1; i < series.length; i++) {
    const window = series.slice(i - windowChunks + 1, i + 1)
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
