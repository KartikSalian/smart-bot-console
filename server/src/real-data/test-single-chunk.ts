import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chunkWav } from '../audio/wavChunker.js'
import { classifyChunks } from '../serts/sertsClient.js'

const SID = process.argv[2] ?? '0002f70f7386445b'
const AUDIO_DIR = join(process.cwd(), 'sample_audio')

async function run() {
  const callerWav = readFileSync(join(AUDIO_DIR, `${SID}_caller.wav`))
  const chunks = chunkWav(callerWav, 3)
  const first = chunks[0]

  console.log(`Sending 1 chunk (t=${first.tSec}s) to the real endpoint...`)
  const start = Date.now()
  const predictions = await classifyChunks({ t0: first.wav })
  const elapsed = Date.now() - start

  console.log(`Elapsed: ${elapsed}ms`)
  console.log(JSON.stringify(predictions, null, 2))
}

run().catch((err) => {
  console.error('FAILED:', err.message ?? err)
  process.exit(1)
})
