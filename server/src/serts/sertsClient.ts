import { SageMakerRuntimeClient, InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime'

const client = new SageMakerRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID ?? '').trim(),
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY ?? '').trim(),
  },
})

export interface SertsProbabilities {
  anger: number
  happy: number
  neutral: number
  sad: number
}

export interface SertsPrediction {
  uid: string
  predicted_class?: number
  predicted_label?: string
  probabilities?: SertsProbabilities
  error?: string
}

/** Sends a batch of {uid: wavBuffer} to the real SERTS SageMaker endpoint and returns per-uid predictions. */
export async function classifyChunks(chunks: Record<string, Buffer>): Promise<SertsPrediction[]> {
  const endpointName = process.env.SAGEMAKER_ENDPOINT_NAME
  if (!endpointName) {
    throw new Error('SAGEMAKER_ENDPOINT_NAME is not set')
  }

  const invocations: Record<string, string> = {}
  for (const [uid, wav] of Object.entries(chunks)) {
    invocations[uid] = wav.toString('base64')
  }

  const payload = JSON.stringify({ invocations })

  const command = new InvokeEndpointCommand({
    EndpointName: endpointName,
    ContentType: 'application/json',
    Body: Buffer.from(payload),
  })

  const response = await client.send(command)
  const bodyText = Buffer.from(response.Body as Uint8Array).toString('utf-8')
  const parsed = JSON.parse(bodyText)
  return parsed.predictions as SertsPrediction[]
}
