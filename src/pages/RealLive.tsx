import { useEffect, useRef, useState } from 'react'
import EmotionRibbon from '../components/EmotionRibbon'
import TrendChip from '../components/TrendChip'
import RealDataBadge from '../components/RealDataBadge'
import { startMicCapture, type MicCaptureHandle } from '../lib/micCapture'
import { startLiveSession, submitChunk, getSessionResults, type LiveChunkResult } from '../lib/liveApi'
import { getLiveAlert, getTrend } from '../rules/rules'
import type { SentimentChunk } from '../types'

export default function RealLive() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [chunks, setChunks] = useState<LiveChunkResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [skippedCount, setSkippedCount] = useState(0)
  const micRef = useRef<MicCaptureHandle | null>(null)
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      micRef.current?.stop()
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  async function handleStart() {
    setError(null)
    try {
      const id = await startLiveSession()
      setSessionId(id)

      pollRef.current = window.setInterval(async () => {
        try {
          const results = await getSessionResults(id)
          setChunks(results)
        } catch {
          // transient poll failure, try again next tick
        }
      }, 1500)

      const mic = await startMicCapture({
        onChunk: async (wav, tSec) => {
          try {
            await submitChunk(id, 'agent', tSec, wav)
          } catch (err) {
            console.error('Chunk submission failed:', err)
          }
        },
        onSkip: () => setSkippedCount((n) => n + 1),
      })
      micRef.current = mic
      setRecording(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start live call')
    }
  }

  function handleStop() {
    micRef.current?.stop()
    micRef.current = null
    if (pollRef.current) window.clearInterval(pollRef.current)
    setRecording(false)
  }

  const joinUrl = sessionId ? `${window.location.origin}/join/${sessionId}` : null
  const customerChunks: SentimentChunk[] = chunks
    .filter((c) => c.role === 'customer')
    .sort((a, b) => a.tSec - b.tSec)
  const agentChunks: SentimentChunk[] = chunks
    .filter((c) => c.role === 'agent')
    .sort((a, b) => a.tSec - b.tSec)

  const trend = customerChunks.length > 0 ? getTrend(customerChunks) : 'Steady'
  const alert = customerChunks.length > 0 ? getLiveAlert(customerChunks) : null

  return (
    <div className="content">
      <div className="page-header">
        <h1>Live call (real)</h1>
        <RealDataBadge />
      </div>

      {!sessionId && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Start a real live call</h3>
          <p style={{ color: 'var(--soft)', fontSize: 13, marginBottom: 14 }}>
            This captures real microphone audio and scores it with the live SERTS model as the
            call happens. Needs a second device for the customer side — you'll get a join link
            to share once you start.
          </p>
          <button
            onClick={handleStart}
            style={{
              padding: '9px 16px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--navy)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Start live call
          </button>
          {error && <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 13 }}>{error}</p>}
        </div>
      )}

      {sessionId && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Customer join link</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <code
                style={{
                  flex: 1,
                  background: 'var(--card)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  overflowX: 'auto',
                }}
              >
                {joinUrl}
              </code>
              <button
                onClick={() => joinUrl && navigator.clipboard.writeText(joinUrl)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--card-bd)',
                  background: 'var(--panel)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Copy
              </button>
            </div>
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8 }}>
              Open this link on the customer's device to capture their voice too.
            </p>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Call in progress</h3>
                <p style={{ color: 'var(--soft)', fontSize: 13 }}>
                  {recording ? 'Recording your mic...' : 'Stopped'} · {customerChunks.length} customer
                  chunks · {agentChunks.length} agent chunks · {skippedCount} silent chunks skipped (you)
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <TrendChip trend={trend} />
                <button
                  onClick={recording ? handleStop : handleStart}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: recording ? 'var(--red)' : 'var(--navy)',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {recording ? 'Stop' : 'Resume'}
                </button>
              </div>
            </div>
          </div>

          <div
            className="card"
            style={
              alert
                ? {
                    marginBottom: 16,
                    borderColor: alert.level === 'critical' ? 'var(--red)' : 'var(--amber)',
                    background: alert.level === 'critical' ? 'rgba(214, 74, 63, 0.05)' : 'rgba(194, 137, 27, 0.06)',
                  }
                : { marginBottom: 16 }
            }
          >
            {alert ? (
              <>
                <h3 style={{ color: alert.level === 'critical' ? 'var(--red)' : 'var(--amber)', marginBottom: 6 }}>
                  {alert.title}
                </h3>
                <p style={{ margin: '0 0 8px' }}>{alert.message}</p>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--soft)' }}>Why: {alert.why}</p>
              </>
            ) : (
              <>
                <h3 style={{ marginBottom: 6 }}>No alerts</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)' }}>Sentiment is within normal range.</p>
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Customer sentiment (real, live)</h3>
            {customerChunks.length > 0 ? (
              <EmotionRibbon series={customerChunks} height={100} />
            ) : (
              <p style={{ color: 'var(--faint)', fontSize: 13 }}>Waiting for customer audio...</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
