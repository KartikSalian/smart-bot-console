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
  console.log(`Sliced ${SID}_caller.wav into ${chunks.length} chunks of ~3s each.`)

  const invocations: Record<string, Buffer> = {}
  for (const chunk of chunks) {
    invocations[`t${chunk.tSec}`] = chunk.wav
  }

  console.log(`Calling real SageMaker endpoint (${process.env.SAGEMAKER_ENDPOINT_NAME})...`)
  const predictions = await classifyChunks(invocations)

  console.log('\nReal model predictions, in order:')
  predictions
    .sort((a, b) => parseInt(a.uid.slice(1)) - parseInt(b.uid.slice(1)))
    .forEach((p) => {
      if (p.error) {
        console.log(`  ${p.uid}: ERROR - ${p.error}`)
      } else {
        const probs = p.probabilities!
        console.log(
          `  ${p.uid}: ${p.predicted_label} | anger=${probs.anger.toFixed(3)} happy=${probs.happy.toFixed(3)} neutral=${probs.neutral.toFixed(3)} sad=${probs.sad.toFixed(3)}`,
        )
      }
    })
}

run().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
