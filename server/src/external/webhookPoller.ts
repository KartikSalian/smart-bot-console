import { getApiKeyForPartner } from '../middleware/apiKeyAuth.js'
import { getDueWebhooks, markWebhookDelivered, recordWebhookFailure } from './jobStore.js'
import { deliverWebhookOnce, MAX_WEBHOOK_ATTEMPTS, WEBHOOK_RETRY_DELAYS_MS } from './webhook.js'

const POLL_INTERVAL_MS = 15_000

/** Checks the database for webhook deliveries due now and attempts each once. Scheduling (not
 * waiting) lives in the DB, so a restart between polls just picks up where it left off. */
export async function pollDueWebhooks(): Promise<void> {
  const due = await getDueWebhooks()

  for (const job of due) {
    const secret = getApiKeyForPartner(job.partner)
    if (!secret) {
      console.error(`No API key found for partner ${job.partner}, giving up on webhook for ${job.id}`)
      await recordWebhookFailure(job.id, job.attempts, null)
      continue
    }

    const attemptNumber = job.attempts + 1
    const ok = await deliverWebhookOnce(job.callbackUrl, secret, {
      callId: job.id,
      status: job.status,
      durationSec: job.durationSec,
      chunks: job.chunks,
      error: job.error,
    })

    if (ok) {
      await markWebhookDelivered(job.id)
      continue
    }

    if (attemptNumber >= MAX_WEBHOOK_ATTEMPTS) {
      console.error(`Webhook for ${job.id} did not succeed after ${attemptNumber} attempts, giving up`)
      await recordWebhookFailure(job.id, attemptNumber, null)
    } else {
      const delay = WEBHOOK_RETRY_DELAYS_MS[attemptNumber - 1]
      await recordWebhookFailure(job.id, attemptNumber, delay)
    }
  }
}

/** Call once at server startup. Runs an immediate check, then polls on an interval. */
export function startWebhookPoller(): void {
  void pollDueWebhooks().catch((err) => console.error('Webhook poll failed:', err))
  setInterval(() => {
    void pollDueWebhooks().catch((err) => console.error('Webhook poll failed:', err))
  }, POLL_INTERVAL_MS)
}
