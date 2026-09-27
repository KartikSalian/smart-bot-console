import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db.js'
import { signSession } from '../auth.js'
import { COOKIE_NAME, requireAuth } from '../middleware.js'

const router = Router()

const isProd = process.env.NODE_ENV === 'production'
// Frontend and backend live on different domains in production, so the session cookie
// must be SameSite=None (requires Secure) to be sent on cross-site requests at all.
const cookieOptions = {
  httpOnly: true,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  secure: isProd,
  maxAge: 12 * 60 * 60 * 1000,
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const result = await pool.query(
    'SELECT id, email, password_hash, role, name FROM users WHERE email = $1',
    [email.toLowerCase().trim()],
  )
  const user = result.rows[0]
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const token = signSession({ userId: user.id, email: user.email, role: user.role, name: user.name })
  res.cookie(COOKIE_NAME, token, cookieOptions)
  res.json({ user: { email: user.email, role: user.role, name: user.name } })
})

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: cookieOptions.sameSite, secure: isProd })
  res.json({ ok: true })
})

router.get('/me', requireAuth, (req, res) => {
  const { email, role, name } = req.user!
  res.json({ user: { email, role, name } })
})

export default router
