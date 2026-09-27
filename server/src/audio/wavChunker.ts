interface WavInfo {
  sampleRate: number
  numChannels: number
  bitsPerSample: number
  dataOffset: number
  dataLength: number
}

function parseWavHeader(buf: Buffer): WavInfo {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a valid RIFF/WAVE file')
  }

  let offset = 12
  let fmt: { sampleRate: number; numChannels: number; bitsPerSample: number } | null = null
  let dataOffset = -1
  let dataLength = -1

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    const chunkBodyStart = offset + 8

    if (chunkId === 'fmt ') {
      fmt = {
        numChannels: buf.readUInt16LE(chunkBodyStart + 2),
        sampleRate: buf.readUInt32LE(chunkBodyStart + 4),
        bitsPerSample: buf.readUInt16LE(chunkBodyStart + 14),
      }
    } else if (chunkId === 'data') {
      dataOffset = chunkBodyStart
      dataLength = chunkSize
    }

    offset = chunkBodyStart + chunkSize + (chunkSize % 2)
  }

  if (!fmt || dataOffset === -1) {
    throw new Error('Missing fmt or data chunk')
  }

  return { ...fmt, dataOffset, dataLength }
}

function buildWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const header = Buffer.alloc(44)

  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataLength, 40)

  return header
}

export interface AudioChunk {
  tSec: number
  wav: Buffer
}

/** Splits a WAV file's raw PCM data into fixed-duration WAV chunks, each a standalone valid WAV file. */
export function chunkWav(buf: Buffer, chunkDurationSec: number): AudioChunk[] {
  const info = parseWavHeader(buf)
  const blockAlign = (info.numChannels * info.bitsPerSample) / 8
  const bytesPerChunk = Math.floor(info.sampleRate * chunkDurationSec) * blockAlign

  const chunks: AudioChunk[] = []
  let pos = 0
  let tSec = 0

  while (pos < info.dataLength) {
    const end = Math.min(pos + bytesPerChunk, info.dataLength)
    const pcmSlice = buf.subarray(info.dataOffset + pos, info.dataOffset + end)
    if (pcmSlice.length === 0) break

    const header = buildWavHeader(pcmSlice.length, info.sampleRate, info.numChannels, info.bitsPerSample)
    chunks.push({ tSec, wav: Buffer.concat([header, pcmSlice]) })

    pos = end
    tSec += chunkDurationSec
  }

  return chunks
}
