import { Link, useLocation, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { dataProvider } from '../data/dataProvider'
import type { Call } from '../types'
import EmotionRibbon from '../components/EmotionRibbon'
import StatusTag from '../components/StatusTag'
import RealDataBadge from '../components/RealDataBadge'
import { formatDateTime, formatDelta, formatDuration } from '../lib/format'

export default function CallDetail() {
  const { callId } = useParams<{ callId: string }>()
  const location = useLocation()
  const backTo = location.pathname.startsWith('/my-calls') ? '/my-calls' : '/calls'
  const backLabel = backTo === '/my-calls' ? 'My calls' : 'Call summaries'
  const [call, setCall] = useState<Call | null | undefined>(undefined)

  useEffect(() => {
    if (!callId) return
    dataProvider.getRealCall(callId).then((c) => setCall(c ?? null))
  }, [callId])

  if (call === undefined) {
    return (
      <div className="content">
        <p style={{ color: 'var(--soft)' }}>Loading call…</p>
      </div>
    )
  }

  if (call === null) {
    return (
      <div className="content">
        <p style={{ color: 'var(--soft)' }}>Call not found.</p>
        <Link to={backTo}>Back to {backLabel.toLowerCase()}</Link>
      </div>
    )
  }

  const { sentiment_trajectory: st } = call

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <Link to={backTo} style={{ fontSize: 12.5, color: 'var(--soft)', textDecoration: 'none' }}>
            ← {backLabel}
          </Link>
          <h1 style={{ marginTop: 6 }}>{call.callId}</h1>
          <div style={{ color: 'var(--soft)', fontSize: 13, marginTop: 4 }}>
            {formatDateTime(call.startedAt)} · {call.agent.name} · {formatDuration(call.durationSec)}
          </div>
        </div>
        <RealDataBadge />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Call summary</h3>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600 }}>
                Reason
              </div>
              <div style={{ marginTop: 2 }}>
                {call.call_reason.category} — {call.call_reason.statedReason}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Questions asked
              </div>
              {call.questions_asked.map((q, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                  <span>{q.text}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                    {q.transcript_ref.startSec}s–{q.transcript_ref.endSec}s
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Actions completed
              </div>
              {call.actions_completed.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                  <span>{a.text}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                    {a.transcript_ref.startSec}s–{a.transcript_ref.endSec}s
                  </span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                Issues
              </div>
              {call.issues.map((issue, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <StatusTag
                    label={issue.status}
                    tone={issue.status === 'resolved' ? 'good' : issue.status === 'escalated' ? 'critical' : 'warn'}
                  />
                  <span>{issue.category}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                    at {issue.transcript_ref.startSec}s
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Confidence</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--navy)' }}>
                {Math.round(call.confidence.overall * 100)}%
              </span>
              {call.confidence.needs_review && <StatusTag label="Routed to human review" tone="warn" />}
            </div>
            {call.confidence.low_confidence_fields.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--soft)' }}>
                Low confidence on: {call.confidence.low_confidence_fields.join(', ')}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Transcript</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {call.transcript.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                  <span style={{ color: 'var(--faint)', minWidth: 34 }}>{line.tSec}s</span>
                  <span style={{ fontWeight: 600, minWidth: 60, color: line.speaker === 'agent' ? 'var(--navy-2)' : 'var(--soft)' }}>
                    {line.speaker}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {call.compliance_flags.vulnerability && (
            <div className="card" style={{ borderColor: 'var(--red)', background: 'rgba(214, 74, 63, 0.05)' }}>
              <h3 style={{ color: 'var(--red)', marginBottom: 6 }}>Vulnerability flag (FG21/1)</h3>
              <p style={{ margin: 0, fontSize: 13 }}>{call.compliance_flags.vulnerability_reason}</p>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Sentiment trajectory</h3>
            <EmotionRibbon series={st.series} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--faint)', fontSize: 11.5 }}>Start</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{st.start.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--faint)', fontSize: 11.5 }}>End</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{st.end.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--faint)', fontSize: 11.5 }}>Δ</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, color: st.delta < 0 ? 'var(--red)' : 'var(--green)' }}>
                  {formatDelta(st.delta)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--faint)', fontSize: 11.5 }}>Dominant</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, textTransform: 'capitalize' }}>
                  {st.dominantEmotion}
                </div>
              </div>
            </div>
          </div>

          {call.compliance_flags.repeat_contact && (
            <div className="card">
              <StatusTag label="Repeat contact" tone="warn" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
