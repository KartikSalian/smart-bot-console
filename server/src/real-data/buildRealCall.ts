import { chunkWav, type AudioChunk } from '../audio/wavChunker.js'
import { classifyChunks, type SertsPrediction } from '../serts/sertsClient.js'

const CHUNKS_PER_REQUEST = 3

function batch<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export interface RealSentimentChunk {
  tSec: number
  anger: number
  happy: number
  neutral: number
  sad: number
}

/** Chunks a full call's caller audio into 3s pieces and runs each batch through the real SERTS endpoint. */
export async function buildRealSentimentSeries(callerWav: Buffer): Promise<RealSentimentChunk[]> {
  const chunks = chunkWav(callerWav, 3)
  const batches = batch(chunks, CHUNKS_PER_REQUEST)
  const results: RealSentimentChunk[] = []

  for (const [batchIdx, group] of batches.entries()) {
    const invocations: Record<string, Buffer> = {}
    const tSecByUid = new Map<string, number>()
    group.forEach((chunk: AudioChunk, i: number) => {
      const uid = `c${i}`
      invocations[uid] = chunk.wav
      tSecByUid.set(uid, chunk.tSec)
    })

    console.log(`  Batch ${batchIdx + 1}/${batches.length} (${group.length} chunks)...`)
    const predictions: SertsPrediction[] = await classifyChunks(invocations)

    for (const p of predictions) {
      const tSec = tSecByUid.get(p.uid)
      if (tSec === undefined || p.error || !p.probabilities) {
        console.warn(`    Skipping ${p.uid}: ${p.error ?? 'no probabilities'}`)
        continue
      }
      results.push({ tSec, ...p.probabilities })
    }
  }

  return results.sort((a, b) => a.tSec - b.tSec)
}
