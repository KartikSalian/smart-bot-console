import { chunkWav, type AudioChunk } from '../audio/wavChunker.js'
import { classifyChunks, type SertsPrediction } from '../serts/sertsClient.js'

const CHUNKS_PER_REQUEST = 3
// Matches the SageMaker endpoint's auto-scaling max instance count (see setup-autoscaling.mjs).
// Going higher just queues extra requests behind the same instances with no added throughput.
const MAX_CONCURRENT_BATCHES = 2

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

async function classifyBatch(
  group: AudioChunk[],
  batchIdx: number,
  totalBatches: number,
): Promise<RealSentimentChunk[]> {
  const invocations: Record<string, Buffer> = {}
  const tSecByUid = new Map<string, number>()
  group.forEach((chunk: AudioChunk, i: number) => {
    const uid = `c${i}`
    invocations[uid] = chunk.wav
    tSecByUid.set(uid, chunk.tSec)
  })

  console.log(`  Batch ${batchIdx + 1}/${totalBatches} (${group.length} chunks)...`)
  const predictions: SertsPrediction[] = await classifyChunks(invocations)

  const results: RealSentimentChunk[] = []
  for (const p of predictions) {
    const tSec = tSecByUid.get(p.uid)
    if (tSec === undefined || p.error || !p.probabilities) {
      console.warn(`    Skipping ${p.uid}: ${p.error ?? 'no probabilities'}`)
      continue
    }
    results.push({ tSec, ...p.probabilities })
  }
  return results
}

/**
 * Runs a limited-concurrency worker pool over `tasks`, calling `run` for each.
 * Keeps at most `limit` tasks in flight at once instead of running them all serially
 * or all at once (which would just queue behind SageMaker's instance count anyway).
 */
async function runPool<T, R>(items: T[], limit: number, run: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0

  async function worker() {
    while (true) {
      const idx = next++
      if (idx >= items.length) return
      results[idx] = await run(items[idx], idx)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/** Chunks a full call's caller audio into 3s pieces and runs batches through the real SERTS
 * endpoint concurrently (up to MAX_CONCURRENT_BATCHES in flight at once), instead of one at a time.
 * `onBatchComplete`, if given, fires after each batch finishes (not necessarily in order) with the
 * running count of completed batches — used to report progress on long-running jobs. */
export async function buildRealSentimentSeries(
  callerWav: Buffer,
  onBatchComplete?: (completedSoFar: RealSentimentChunk[], completedBatches: number, totalBatches: number) => void,
): Promise<RealSentimentChunk[]> {
  const chunks = chunkWav(callerWav, 3)
  const batches = batch(chunks, CHUNKS_PER_REQUEST)
  let completed = 0
  const completedResults: RealSentimentChunk[] = []

  const perBatchResults = await runPool(batches, MAX_CONCURRENT_BATCHES, async (group, batchIdx) => {
    const result = await classifyBatch(group, batchIdx, batches.length)
    completed++
    completedResults.push(...result)
    onBatchComplete?.(completedResults, completed, batches.length)
    return result
  })

  return perBatchResults.flat().sort((a, b) => a.tSec - b.tSec)
}
