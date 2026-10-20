import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { startMicCapture, type MicCaptureHandle } from '../lib/micCapture'
import { submitChunk } from '../lib/liveApi'

export default function JoinCall() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [status, setStatus] = useState<'idle' | 'recording' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [chunksSent, setChunksSent] = useState(0)
  const micRef = useRef<MicCaptureHandle | null>(null)

  useEffect(() => {
    return () => {
      micRef.current?.stop()
    }
  }, [])

  async function handleJoin() {
    if (!sessionId) return
    setError(null)
    try {
      const mic = await startMicCapture(async (wav, tSec) => {
        try {
          await submitChunk(sessionId, 'customer', tSec, wav)
          setChunksSent((n) => n + 1)
        } catch (err) {
          console.error('Chunk submission failed:', err)
        }
      })
      micRef.current = mic
      setStatus('recording')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Could not access microphone')
    }
  }

  function handleLeave() {
    micRef.current?.stop()
    micRef.current = null
    setStatus('idle')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 20,
      }}
    >
      <div className="card" style={{ width: 380, padding: 28, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>Smartbot Console</h1>
        <p style={{ color: 'var(--soft)', fontSize: 13, marginBottom: 20 }}>
          You've been invited to a live call demo. Your microphone audio will be scored for
          emotion in real time.
        </p>

        {status === 'idle' && (
          <button
            onClick={handleJoin}
            style={{
              padding: '10px 20px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--navy)',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Join call
          </button>
        )}

        {status === 'recording' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
              <span
                style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Recording</span>
            </div>
            <p style={{ color: 'var(--soft)', fontSize: 13, marginBottom: 16 }}>{chunksSent} chunks sent</p>
            <button
              onClick={handleLeave}
              style={{
                padding: '9px 18px',
                borderRadius: 6,
                border: '1px solid var(--card-bd)',
                background: 'var(--panel)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Leave call
            </button>
          </>
        )}

        {status === 'error' && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  )
}
