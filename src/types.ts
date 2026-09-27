export type Emotion = 'anger' | 'happy' | 'neutral' | 'sad'

export type IssueCategory =
  | 'Billing'
  | 'Access'
  | 'Complaint'
  | 'Product'
  | 'Cancellation'
  | 'Fraud'
  | 'Other'

export type IssueStatus = 'resolved' | 'unresolved' | 'escalated'

export interface TranscriptRef {
  startSec: number
  endSec: number
}

export interface TranscriptLine {
  tSec: number
  speaker: 'agent' | 'customer'
  text: string
}

export interface QuestionAsked {
  text: string
  transcript_ref: TranscriptRef
}

export interface ActionCompleted {
  text: string
  transcript_ref: TranscriptRef
}

export interface Issue {
  category: IssueCategory
  status: IssueStatus
  transcript_ref: TranscriptRef
}

export interface SentimentChunk {
  tSec: number
  anger: number
  happy: number
  neutral: number
  sad: number
}

export interface SentimentTrajectory {
  start: number
  end: number
  delta: number
  dominantEmotion: Emotion
  series: SentimentChunk[]
}

export interface ComplianceFlags {
  vulnerability: boolean
  vulnerability_reason: string | null
  repeat_contact: boolean
}

export interface Confidence {
  overall: number
  low_confidence_fields: string[]
  needs_review: boolean
}

export interface Agent {
  id: string
  name: string
  script: string
}

export interface Call {
  callId: string
  platform: 'amazon_connect' | 'standalone'
  startedAt: string
  durationSec: number
  agent: Agent
  customerRef: string

  call_reason: {
    category: IssueCategory
    statedReason: string
  }
  questions_asked: QuestionAsked[]
  actions_completed: ActionCompleted[]
  issues: Issue[]

  sentiment_trajectory: SentimentTrajectory

  compliance_flags: ComplianceFlags
  confidence: Confidence

  transcript: TranscriptLine[]
}

export type CallTrend = 'Escalating' | 'Calming' | 'Steady'
