import { pool } from '../db.js'
import type { RealSentimentChunk } from '../real-data/buildRealCall.js'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface CallJob {
  id: string
  partner: string
  status: JobStatus
  durationSec: number | null
  progress: number
  chunks: RealSentimentChunk[]
  error: string | null
  callbackUrl: string | null
}

function fromRow(row: any): CallJob {
  return {
    id: row.id,
    partner: row.partner,
    status: row.status,
    durationSec: row.duration_sec,
    progress: Number(row.progress),
    chunks: row.chunks,
    error: row.error,
    callbackUrl: row.callback_url,
  }
}

export async function createJob(params: {
  id: string
  partner: string
  durationSec: number
  callbackUrl: string | null
  audio: Buffer
}): Promise<void> {
  await pool.query(
    `INSERT INTO call_jobs (id, partner, status, duration_sec, callback_url, audio)
     VALUES ($1, $2, 'queued', $3, $4, $5)`,
    [params.id, params.partner, params.durationSec, params.callbackUrl, params.audio],
  )
}

export async function getJob(id: string): Promise<CallJob | null> {
  const { rows } = await pool.query(
    'SELECT id, partner, status, duration_sec, progress, chunks, error, callback_url FROM call_jobs WHERE id = $1',
    [id],
  )
  return rows[0] ? fromRow(rows[0]) : null
}

/** Jobs left queued or processing (e.g. from before a restart) that still have their audio stored. */
export async function getUnfinishedJobs(): Promise<{ id: string; audio: Buffer }[]> {
  const { rows } = await pool.query(
    `SELECT id, audio FROM call_jobs WHERE status IN ('queued', 'processing') AND audio IS NOT NULL`,
  )
  return rows.map((r) => ({ id: r.id, audio: r.audio }))
}

export async function updateJobProgress(id: string, progress: number, chunks: RealSentimentChunk[]): Promise<void> {
  await pool.query(
    `UPDATE call_jobs SET status = 'processing', progress = $2, chunks = $3, updated_at = now() WHERE id = $1`,
    [id, progress, JSON.stringify(chunks)],
  )
}

export async function completeJob(id: string, chunks: RealSentimentChunk[]): Promise<void> {
  await pool.query(
    `UPDATE call_jobs SET status = 'completed', progress = 1, chunks = $2, audio = NULL, updated_at = now() WHERE id = $1`,
    [id, JSON.stringify(chunks)],
  )
}

export async function failJob(id: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE call_jobs SET status = 'failed', error = $2, audio = NULL, updated_at = now() WHERE id = $1`,
    [id, error],
  )
}

export async function countActiveJobsForPartner(partner: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*) FROM call_jobs WHERE partner = $1 AND status IN ('queued', 'processing')`,
    [partner],
  )
  return Number(rows[0].count)
}

/** Deletes completed/failed jobs older than `maxAgeMs` -- call periodically, not per-request. */
export async function deleteOldJobs(maxAgeMs: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM call_jobs WHERE status IN ('completed', 'failed') AND updated_at < now() - $1::interval`,
    [`${maxAgeMs / 1000} seconds`],
  )
  return rowCount ?? 0
}
