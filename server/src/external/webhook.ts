import { createHmac } from 'node:crypto'

export const MAX_WEBHOOK_ATTEMPTS = 4
// Delay before each retry after a failed attempt (index 0 = delay before attempt 2, etc).
// Long waits are tracked in the database (see webhookPoller.ts), not an in-memory timer, so a
// server restart mid-wait doesn't silently drop the retry.
export const WEBHOOK_RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000] // 1min, 5min, 30min

/** Signs and makes a single delivery attempt to a partner's callback URL. Never throws -- a
 * partner's unreachable webhook must not affect job processing. Returns whether it succeeded. */
export async function deliverWebhookOnce(url: string, secret: string, payload: unknown): Promise<boolean> {
  const body = JSON.stringify(payload)
  const signature = createHmac('sha256', secret).update(body).digest('hex')

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
    if (res.ok) return true
    console.error(`Webhook to ${url} returned ${res.status}`)
    return false
  } catch (err) {
    console.error(`Webhook to ${url} failed:`, err)
    return false
  }
}
