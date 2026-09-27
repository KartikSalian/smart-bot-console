import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { requireAuth } from '../middleware.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CALLS_PATH = join(__dirname, '../../../public/sample_data/calls.json')
const REAL_CALLS_PATH = join(__dirname, '../../../public/sample_data/real_calls.json')

const AGENT_ID_BY_EMAIL: Record<string, string> = {
  'agent@smartbot.local': 'ag-niamh',
  'callum.agent@smartbot.local': 'ag-callum',
  'priya.agent@smartbot.local': 'ag-priya',
}

const router = Router()

// Synthetic demo data — used by the Live agent-assist replay only.
router.get('/', requireAuth, (_req, res) => {
  const raw = readFileSync(CALLS_PATH, 'utf-8')
  res.type('application/json').send(raw)
})

// Real, model-scored calls (Harper Valley Bank audio through the live SERTS endpoint) — supervisor Overview/Call summaries.
router.get('/real', requireAuth, (_req, res) => {
  const raw = readFileSync(REAL_CALLS_PATH, 'utf-8')
  res.type('application/json').send(raw)
})

// Same real dataset, scoped server-side to the logged-in agent's own calls.
router.get('/mine', requireAuth, (req, res) => {
  const agentId = AGENT_ID_BY_EMAIL[req.user!.email]
  if (!agentId) {
    return res.status(403).json({ error: 'No calls associated with this account' })
  }
  const raw = readFileSync(REAL_CALLS_PATH, 'utf-8')
  const calls = JSON.parse(raw) as Array<{ agent: { id: string } }>
  const mine = calls.filter((c) => c.agent.id === agentId)
  res.json(mine)
})

export default router
