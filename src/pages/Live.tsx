import { useEffect, useMemo, useRef, useState } from 'react'
import { useScriptedCalls } from '../hooks/useCalls'
import EmotionRibbon from '../components/EmotionRibbon'
import TrendChip from '../components/TrendChip'
import SyntheticBadge from '../components/SyntheticBadge'
import { getLiveAlert, getTrend } from '../rules/rules'
import type { Call, Emotion } from '../types'

const EMOTION_COLOR: Record<Emotion, string> = {
  anger: 'var(--emotion-anger)',
  happy: 'var(--emotion-happy)',
  neutral: 'var(--emotion-neutral)',
  sad: 'var(--emotion-sad)',
}

function MiniBar({ call }: { call: Call }) {
  const last = call.sentiment_trajectory.series[call.sentiment_trajectory.series.length - 1]
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' }}>
      {(['sad', 'anger', 'neutral', 'happy'] as Emotion[]).map((e) => (
        <div key={e} style={{ width: `${last[e] * 100}%`, background: EMOTION_COLOR[e] }} />
      ))}
    </div>
  )
}

export default function Live() {
  const calls = useScriptedCalls()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [chunkIdx, setChunkIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<number | null>(null)

  const inProgress = useMemo(() => calls?.slice(0, 8) ?? [], [calls])
  const selected = inProgress.find((c) => c.callId === selectedId) ?? inProgress[0] ?? null

  useEffect(() => {
    if (selected && selectedId === null) setSelectedId(selected.callId)
  }, [selected, selectedId])

  useEffect(() => {
    setChunkIdx(0)
    setPlaying(false)
  }, [selectedId])

  useEffect(() => {
    if (!playing || !selected) return
    const maxIdx = selected.sentiment_trajectory.series.length - 1
    timerRef.current = window.setInterval(() => {
      setChunkIdx((i) => {
        if (i >= maxIdx) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 500)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [playing, selected])

  if (!calls) {
    return (
      <div className="content">
        <p style={{ color: 'var(--soft)' }}>Loading calls…</p>
      </div>
    )
  }

  if (!selected) {
    return (
      <div className="content">
        <p style={{ color: 'var(--soft)' }}>No calls available.</p>
      </div>
    )
  }

  const seriesSoFar = selected.sentiment_trajectory.series.slice(0, chunkIdx + 1)
  const current = seriesSoFar[seriesSoFar.length - 1]
  const dominant = (Object.keys(EMOTION_COLOR) as Emotion[]).reduce((best, e) =>
    current[e] > current[best] ? e : best,
  )
  const trend = getTrend(seriesSoFar)
  const alert = getLiveAlert(seriesSoFar)
  const visibleTranscript = selected.transcript.filter((line) => line.tSec <= current.tSec)

  return (
    <div className="content">
      <div className="page-header">
        <h1>Live agent assist</h1>
        <SyntheticBadge />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontSize: 11.5, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600, padding: '6px 8px' }}>
            In progress ({inProgress.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {inProgress.map((c) => (
              <button
                key={c.callId}
                onClick={() => setSelectedId(c.callId)}
                style={{
                  display: 'block',
                  textAlign: 'left',
                  width: '100%',
                  background: c.callId === selected.callId ? 'var(--card)' : 'transparent',
                  border: 'none',
                  borderLeft: c.compliance_flags.vulnerability ? '3px solid var(--red)' : '3px solid transparent',
                  borderRadius: 6,
                  padding: '8px 8px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
                  <span>{c.callId}</span>
                  <span style={{ color: 'var(--faint)', fontWeight: 400 }}>{c.agent.name}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--soft)', margin: '3px 0 6px' }}>{c.call_reason.category}</div>
                <MiniBar call={c} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 18 }}>{selected.callId}</h2>
                <div style={{ color: 'var(--soft)', fontSize: 13, marginTop: 2 }}>
                  {selected.agent.name} · {selected.call_reason.category}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <TrendChip trend={trend} />
                <span
                  style={{
                    textTransform: 'capitalize',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: EMOTION_COLOR[dominant],
                  }}
                >
                  {dominant}
                </span>
              </div>
            </div>

            <div style={{ margin: '16px 0 6px' }}>
              <EmotionRibbon series={selected.sentiment_trajectory.series} upToIndex={chunkIdx} height={100} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => setPlaying((p) => !p)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--card-bd)',
                  background: playing ? 'var(--navy)' : 'var(--panel)',
                  color: playing ? '#fff' : 'var(--ink)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={() => {
                  setChunkIdx(0)
                  setPlaying(false)
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--card-bd)',
                  background: 'var(--panel)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Restart
              </button>
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--faint)' }}>
                {current.tSec}s / {selected.durationSec}s (replay demo)
              </span>
            </div>
          </div>

          <div
            className="card"
            style={
              alert
                ? {
                    borderColor: alert.level === 'critical' ? 'var(--red)' : 'var(--amber)',
                    background: alert.level === 'critical' ? 'rgba(214, 74, 63, 0.05)' : 'rgba(194, 137, 27, 0.06)',
                  }
                : undefined
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
            <h3 style={{ marginBottom: 10 }}>Live transcript</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {visibleTranscript.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                  <span style={{ color: 'var(--faint)', minWidth: 34 }}>{line.tSec}s</span>
                  <span style={{ fontWeight: 600, minWidth: 60, color: line.speaker === 'agent' ? 'var(--navy-2)' : 'var(--soft)' }}>
                    {line.speaker}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))}
              {visibleTranscript.length === 0 && <span style={{ color: 'var(--faint)' }}>Waiting for call to start…</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
