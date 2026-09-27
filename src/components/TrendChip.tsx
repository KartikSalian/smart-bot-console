import type { CallTrend } from '../types'

const STYLE: Record<CallTrend, { bg: string; fg: string; icon: string }> = {
  Escalating: { bg: 'rgba(214, 74, 63, 0.12)', fg: 'var(--red)', icon: '↑' },
  Calming: { bg: 'rgba(47, 158, 115, 0.12)', fg: 'var(--green)', icon: '↓' },
  Steady: { bg: 'rgba(151, 161, 176, 0.15)', fg: 'var(--soft)', icon: '→' },
}

export default function TrendChip({ trend }: { trend: CallTrend }) {
  const s = STYLE[trend]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: s.bg,
        color: s.fg,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <span>{s.icon}</span>
      {trend}
    </span>
  )
}
