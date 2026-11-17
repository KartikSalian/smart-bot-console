import { buildRealSentimentSeries } from '../real-data/buildRealCall.js'
import { completeJob, failJob, getUnfinishedJobs, markWebhookPending, updateJobProgress } from './jobStore.js'

// The queue itself only holds job ids -- the audio stays in the database (call_jobs.audio) until
// a job completes or fails, which is what lets a queued/in-progress job survive a server restart
// (see resumeUnfinishedJobs, called once at startup).
const queue: { callId: string; audio: Buffer }[] = []
let workerRunning = false

export function enqueueJob(callId: string, wav: Buffer): void {
  queue.push({ callId, audio: wav })
  void runWorker()
}

/** Call once at server startup: re-queues any job left queued/processing from before a restart. */
export async function resumeUnfinishedJobs(): Promise<void> {
  const jobs = await getUnfinishedJobs()
  if (jobs.length === 0) return
  console.log(`Resuming ${jobs.length} unfinished call job(s) from before restart`)
  for (const job of jobs) {
    queue.push({ callId: job.id, audio: job.audio })
  }
  void runWorker()
}

async function runWorker(): Promise<void> {
  if (workerRunning) return
  workerRunning = true

  while (queue.length > 0) {
    const job = queue.shift()!
    await processJob(job.callId, job.audio)
  }

  workerRunning = false
}

async function processJob(callId: string, wav: Buffer): Promise<void> {
  try {
    const series = await buildRealSentimentSeries(wav, (soFar, completed, total) => {
      // Fire-and-forget progress updates -- don't let a slow DB write stall the model calls.
      void updateJobProgress(callId, completed / total, [...soFar].sort((a, b) => a.tSec - b.tSec)).catch((err) =>
        console.error(`Progress update failed for ${callId}:`, err),
      )
    })

    await completeJob(callId, series)
    await markWebhookPending(callId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Job ${callId} failed:`, err)
    await failJob(callId, message)
    await markWebhookPending(callId)
  }
}
