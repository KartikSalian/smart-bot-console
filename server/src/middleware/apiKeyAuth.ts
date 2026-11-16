import type { NextFunction, Request, Response } from 'express'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      partner?: string
    }
  }
}

/** Partner name -> API key. Add one entry per external partner. */
function loadPartnerKeys(): Record<string, string> {
  const raw = process.env.EXTERNAL_API_KEYS ?? ''
  const entries: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [partner, key] = pair.split(':').map((s) => s.trim())
    if (partner && key) entries[key] = partner
  }
  return entries
}

/** Looks up a partner's own API key, e.g. to use as a webhook HMAC secret. */
export function getApiKeyForPartner(partner: string): string | undefined {
  const partnerByKey = loadPartnerKeys()
  for (const [key, p] of Object.entries(partnerByKey)) {
    if (p === partner) return key
  }
  return undefined
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('X-API-Key')
  if (!key) {
    return res.status(401).json({ error: { code: 'missing_api_key', message: 'Missing X-API-Key header' } })
  }
  const partnerByKey = loadPartnerKeys()
  const partner = partnerByKey[key]
  if (!partner) {
    return res.status(401).json({ error: { code: 'invalid_api_key', message: 'Invalid API key' } })
  }
  req.partner = partner
  next()
}
