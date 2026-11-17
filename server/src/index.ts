import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth.js'
import callsRoutes from './routes/calls.js'
import liveRoutes from './routes/live.js'
import externalRoutes from './routes/external.js'
import { deleteOldJobs } from './external/jobStore.js'
import { resumeUnfinishedJobs } from './external/jobQueue.js'
import { startWebhookPoller } from './external/webhookPoller.js'

const app = express()
const PORT = process.env.PORT || 4000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRoutes)
app.use('/api/calls', callsRoutes)
app.use('/api/live', liveRoutes)
app.use('/api/external', externalRoutes)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // matches the retention period stated in the external API docs
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

setInterval(() => {
  deleteOldJobs(JOB_RETENTION_MS)
    .then((count) => {
      if (count > 0) console.log(`Cleaned up ${count} old call job(s)`)
    })
    .catch((err) => console.error('Job cleanup failed:', err))
}, CLEANUP_INTERVAL_MS)

app.listen(PORT, () => {
  console.log(`Smartbot Console API listening on http://localhost:${PORT}`)
})

void resumeUnfinishedJobs().catch((err) => console.error('Failed to resume unfinished call jobs:', err))
startWebhookPoller()
