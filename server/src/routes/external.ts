import { randomBytes } from 'node:crypto'
import { Router, type Response } from 'express'
import { requireApiKey } from '../middleware/apiKeyAuth.js'
import { validateWav } from '../audio/wavChunker.js'
import { createJob, getJob, countActiveJobsForPartner } from '../external/jobStore.js'
import { enqueueJob } from '../external/jobQueue.js'

const router = Router()
const MAX_BODY_BYTES = 50 * 1024 * 1024 // 50MB
const MAX_QUEUED_PER_PARTNER = 5

router.use(requireApiKey)

function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } })
}

// POST /api/external/v1/calls
// Submit a recorded call for analysis. Returns immediately with a callId; poll
// GET /v1/calls/:callId for status and results, or pass X-Callback-Url to get a webhook instead.
router.post('/v1/calls', async (req, res) => {
  const partner = req.partner!
  const callbackUrl = req.header('X-Callback-Url') ?? null

  const activeCount = await countActiveJobsForPartner(partner)
  if (activeCount >= MAX_QUEUED_PER_PARTNER) {
    return sendError(res, 429, 'too_many_queued_jobs', `Max ${MAX_QUEUED_PER_PARTNER} queued/processing jobs at a time`)
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  let aborted = false

  req.on('data', (c: Buffer) => {
    if (aborted) return
    totalBytes += c.length
    if (totalBytes > MAX_BODY_BYTES) {
      aborted = true
      sendError(res, 413, 'payload_too_large', `Body exceeds ${MAX_BODY_BYTES} byte limit`)
      req.destroy()
      return
    }
    chunks.push(c)
  })

  req.on('end', async () => {
    if (aborted) return

    const contentType = req.header('Content-Type') ?? ''
    if (!contentType.includes('audio/wav') && !contentType.includes('audio/x-wav')) {
      return sendError(res, 400, 'invalid_content_type', 'Content-Type must be audio/wav')
    }

    const wav = Buffer.concat(chunks)
    const validation = validateWav(wav)
    if (!validation.valid) {
      return sendError(res, 400, 'invalid_audio_format', validation.reason ?? 'Expected mono 16kHz 16-bit WAV')
    }

    const callId = `call_${randomBytes(8).toString('hex')}`
    try {
      await createJob({ id: callId, partner, durationSec: validation.durationSec!, callbackUrl, audio: wav })
      enqueueJob(callId, wav)
      res.status(202).json({ callId, status: 'queued', durationSec: validation.durationSec })
    } catch (err) {
      console.error(`Failed to create job for partner ${partner}:`, err)
      sendError(res, 500, 'internal_error', 'Failed to queue job')
    }
  })
})

// GET /api/external/v1/calls/:callId
router.get('/v1/calls/:callId', async (req, res) => {
  const job = await getJob(req.params.callId)
  if (!job || job.partner !== req.partner) {
    return sendError(res, 404, 'unknown_call_id', 'No job found with that callId')
  }

  res.json({
    callId: job.id,
    status: job.status,
    durationSec: job.durationSec,
    progress: job.progress,
    chunks: job.chunks,
    error: job.error,
  })
})

export default router
