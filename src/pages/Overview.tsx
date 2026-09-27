import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCalls } from '../hooks/useCalls'
import RealDataBadge from '../components/RealDataBadge'
import StatusTag from '../components/StatusTag'
import { formatDelta, formatPct } from '../lib/format'
import type { IssueCategory } from '../types'

const CATEGORY_COLORS: Record<IssueCategory, string> = {
  Billing: '#7b7fd4',
  Access: '#4f7fe0',
  Complaint: '#d64a3f',
  Product: '#2f9e73',
  Cancellation: '#c2891b',
  Fraud: '#1e2a5e',
  Other: '#97a1b0',
}

export default function Overview() {
  const calls = useCalls()
  const navigate = useNavigate()

  const stats = useMemo(() => {
    if (!calls) return null

    const total = calls.length
    const unresolved = calls.filter((c) => c.issues.some((i) => i.status !== 'resolved')).length
    const avgDelta = calls.reduce((sum, c) => sum + c.sentiment_trajectory.delta, 0) / total
    const vulnCount = calls.filter((c) => c.compliance_flags.vulnerability).length
    const nonNegativeEnd = calls.filter((c) => c.sentiment_trajectory.end >= 0).length

    const byCategory: Record<string, number> = {}
    for (const c of calls) {
      byCategory[c.call_reason.category] = (byCategory[c.call_reason.category] || 0) + 1
    }
    const categoryData = Object.entries(byCategory).map(([category, count]) => ({ category, count }))

    const flagged = calls
      .filter((c) => c.confidence.needs_review)
      .sort((a, b) => a.confidence.overall - b.confidence.overall)

    return {
      total,
      unresolvedRate: total ? unresolved / total : 0,
      avgDelta,
      vulnCount,
      satisfactionRate: total ? nonNegativeEnd / total : 0,
      categoryData,
      flagged,
    }
  }, [calls])

  if (!calls || !stats) {
    return (
      <div className="content">
        <p style={{ color: 'var(--soft)' }}>Loading calls…</p>
      </div>
    )
  }

  const gaugeData = [
    { name: 'satisfied', value: stats.satisfactionRate },
    { name: 'rest', value: 1 - stats.satisfactionRate },
  ]

  return (
    <div className="content">
      <div className="page-header">
        <h1>Overview</h1>
        <RealDataBadge />
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Calls summarized</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Unresolved rate</div>
          <div className="kpi-value">{formatPct(stats.unresolvedRate)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg sentiment Δ</div>
          <div className="kpi-value">{formatDelta(stats.avgDelta)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vulnerability flags</div>
          <div className="kpi-value">{stats.vulnCount}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Call volume by category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.categoryData}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="category" tick={{ fontSize: 12, fill: 'var(--soft)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--soft)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--card)' }}
                contentStyle={{ borderRadius: 8, borderColor: 'var(--card-bd)', fontSize: 13 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {stats.categoryData.map((entry) => (
                  <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category as IssueCategory]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Caller satisfaction</h3>
          <div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={gaugeData}
                  dataKey="value"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={70}
                  outerRadius={95}
                  cx="50%"
                  cy="85%"
                  stroke="none"
                  isAnimationActive={false}
                >
                  <Cell fill="var(--green)" />
                  <Cell fill="var(--line)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', top: '58%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, color: 'var(--navy)' }}>
                {formatPct(stats.satisfactionRate)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--soft)' }}>ending non-negative</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 14 }}>Flagged calls needing review</h3>
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>Category</th>
              <th>Issue status</th>
              <th>Δ sentiment</th>
              <th>Flag</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {stats.flagged.map((c) => {
              const status = c.issues[0]?.status ?? 'resolved'
              return (
                <tr key={c.callId} className="clickable-row" onClick={() => navigate(`/calls/${c.callId}`)}>
                  <td>{c.callId}</td>
                  <td>{c.call_reason.category}</td>
                  <td>
                    <StatusTag
                      label={status}
                      tone={status === 'resolved' ? 'good' : status === 'escalated' ? 'critical' : 'warn'}
                    />
                  </td>
                  <td>{formatDelta(c.sentiment_trajectory.delta)}</td>
                  <td>
                    {c.compliance_flags.vulnerability ? (
                      <StatusTag label="Vulnerability" tone="critical" />
                    ) : (
                      <span style={{ color: 'var(--faint)' }}>—</span>
                    )}
                  </td>
                  <td style={{ color: c.confidence.overall < 0.65 ? 'var(--amber)' : 'var(--soft)' }}>
                    {formatPct(c.confidence.overall)}
                  </td>
                </tr>
              )
            })}
            {stats.flagged.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--faint)', textAlign: 'center', padding: '18px 0' }}>
                  No calls currently flagged for review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
