const SAMPLE_RATE = 16000
const CHUNK_SECONDS = 3

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function buildWav(samples: Int16Array, sampleRate: number): Blob {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i], true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export interface MicCaptureHandle {
  stop: () => void
}

/** Captures mic audio and calls onChunk with a real WAV blob every ~3 seconds. */
export async function startMicCapture(onChunk: (wav: Blob, tSec: number) => void): Promise<MicCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: SAMPLE_RATE } })
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  const source = audioContext.createMediaStreamSource(stream)

  const bufferSize = 4096
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)

  let collected: Float32Array[] = []
  let collectedLength = 0
  let tSec = 0
  const samplesPerChunk = SAMPLE_RATE * CHUNK_SECONDS

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    collected.push(new Float32Array(input))
    collectedLength += input.length

    if (collectedLength >= samplesPerChunk) {
      const merged = new Float32Array(collectedLength)
      let offset = 0
      for (const chunk of collected) {
        merged.set(chunk, offset)
        offset += chunk.length
      }
      const chunkSamples = merged.subarray(0, samplesPerChunk)
      const wav = buildWav(floatTo16BitPCM(chunkSamples), SAMPLE_RATE)
      onChunk(wav, tSec)
      tSec += CHUNK_SECONDS

      const remainder = merged.subarray(samplesPerChunk)
      collected = remainder.length > 0 ? [remainder] : []
      collectedLength = remainder.length
    }
  }

  // ScriptProcessorNode only fires onaudioprocess while connected into a running graph that
  // reaches the destination — but we don't want the mic audible (feedback/echo), so route
  // through a silent gain node instead of connecting directly to the speakers.
  const silentGain = audioContext.createGain()
  silentGain.gain.value = 0
  source.connect(processor)
  processor.connect(silentGain)
  silentGain.connect(audioContext.destination)

  return {
    stop: () => {
      processor.disconnect()
      silentGain.disconnect()
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      audioContext.close()
    },
  }
}
