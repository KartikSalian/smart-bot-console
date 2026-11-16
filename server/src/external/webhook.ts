import { createHmac } from 'node:crypto'

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [1_000, 5_000] // between attempts 1->2 and 2->3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Signs and POSTs the final job result to a partner's callback URL, retrying a couple of times
 * on failure. Best-effort overall: if all attempts fail, it's logged but never thrown -- a
 * partner's unreachable webhook must not affect job processing. */
export async function sendWebhook(url: string, secret: string, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload)
  const signature = createHmac('sha256', secret).update(body).digest('hex')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) return

      console.error(`Webhook to ${url} returned ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`)
    } catch (err) {
      console.error(`Webhook to ${url} failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err)
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAYS_MS[attempt - 1])
    }
  }

  console.error(`Webhook to ${url} did not succeed after ${MAX_ATTEMPTS} attempts, giving up`)
}
