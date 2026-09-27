import type { NextFunction, Request, Response } from 'express'
import { verifySession, type SessionPayload } from './auth.js'

const COOKIE_NAME = process.env.COOKIE_NAME || 'smartbot_session'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  try {
    req.user = verifySession(token)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
}

export { COOKIE_NAME }
