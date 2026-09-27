import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildRealSentimentSeries } from './buildRealCall.js'

const SID = process.argv[2] ?? '0002f70f7386445b'
const AUDIO_DIR = join(process.cwd(), 'sample_audio')

async function run() {
  const callerWav = readFileSync(join(AUDIO_DIR, `${SID}_caller.wav`))
  console.log(`Processing ${SID} (caller channel) through the real SERTS model...\n`)

  const start = Date.now()
  const series = await buildRealSentimentSeries(callerWav)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`\nDone in ${elapsed}s. ${series.length} real chunks:\n`)
  series.forEach((c) => {
    console.log(
      `  t=${c.tSec.toString().padStart(3)}s  anger=${c.anger.toFixed(3)}  happy=${c.happy.toFixed(3)}  neutral=${c.neutral.toFixed(3)}  sad=${c.sad.toFixed(3)}`,
    )
  })
}

run().catch((err) => {
  console.error('FAILED:', err.message ?? err)
  process.exit(1)
})
