import { Router } from 'express'
import { requireAuth } from '../middleware.js'
import { createSession, getSession, addChunkResult } from '../live/sessionStore.js'
import { classifyChunks } from '../serts/sertsClient.js'

const router = Router()

// Agent starts a live call session. Requires login.
router.post('/sessions', requireAuth, (req, res) => {
  const session = createSession(req.user!.email)
  res.json({ sessionId: session.id })
})

// Poll for all results so far. No auth — the customer device needs to be able to see
// nothing sensitive, this just returns scores, and knowing the sessionId is the access control.
router.get('/sessions/:id', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found or expired' })
  res.json({ id: session.id, chunks: session.chunks })
})

// Submit one ~3s audio chunk from either device. No auth — the customer device isn't logged in,
// knowing the sessionId (a short random code shared via the join link) is the access control.
router.post('/sessions/:id/chunks', (req, res) => {
  const session = getSession(req.params.id)
  if (!session) return res.status(404).json({ error: 'Session not found or expired' })

  const rawRole = req.query.role
  const tSec = Number(req.query.tSec)
  if (rawRole !== 'agent' && rawRole !== 'customer') {
    return res.status(400).json({ error: 'role must be "agent" or "customer"' })
  }
  if (!Number.isFinite(tSec)) {
    return res.status(400).json({ error: 'tSec must be a number' })
  }
  const role: 'agent' | 'customer' = rawRole

  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', async () => {
    try {
      const wav = Buffer.concat(chunks)
      const predictions = await classifyChunks({ chunk: wav })
      const p = predictions[0]
      if (!p?.probabilities) {
        return res.status(502).json({ error: p?.error ?? 'Model returned no result' })
      }

      const result = { role, tSec, ...p.probabilities }
      addChunkResult(session.id, result)
      res.json(result)
    } catch (err) {
      console.error('Live chunk classification failed:', err)
      res.status(502).json({ error: 'Model call failed' })
    }
  })
})

export default router
