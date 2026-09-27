import { useNavigate } from 'react-router-dom'
import { useMyCalls } from '../hooks/useCalls'
import RealDataBadge from '../components/RealDataBadge'
import StatusTag from '../components/StatusTag'
import { formatDateTime, formatDelta, formatDuration } from '../lib/format'

export default function MyCalls() {
  const calls = useMyCalls()
  const navigate = useNavigate()

  if (!calls) {
    return (
      <div className="content">
        <p style={{ color: 'var(--soft)' }}>Loading calls…</p>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="page-header">
        <h1>My calls</h1>
        <RealDataBadge />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>Started</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Δ sentiment</th>
              <th>Issue status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => {
              const status = c.issues[0]?.status ?? 'resolved'
              return (
                <tr key={c.callId} className="clickable-row" onClick={() => navigate(`/my-calls/${c.callId}`)}>
                  <td>{c.callId}</td>
                  <td>{formatDateTime(c.startedAt)}</td>
                  <td>{c.call_reason.category}</td>
                  <td>{formatDuration(c.durationSec)}</td>
                  <td>{formatDelta(c.sentiment_trajectory.delta)}</td>
                  <td>
                    <StatusTag
                      label={status}
                      tone={status === 'resolved' ? 'good' : status === 'escalated' ? 'critical' : 'warn'}
                    />
                  </td>
                  <td>
                    {c.confidence.needs_review ? (
                      <StatusTag label="Needs review" tone="warn" />
                    ) : (
                      <span style={{ color: 'var(--faint)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {calls.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--faint)', textAlign: 'center', padding: '18px 0' }}>
                  No calls assigned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
