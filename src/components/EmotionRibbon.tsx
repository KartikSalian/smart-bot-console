import type { Emotion, SentimentChunk } from '../types'

const EMOTION_ORDER: Emotion[] = ['sad', 'anger', 'neutral', 'happy']
const EMOTION_COLOR: Record<Emotion, string> = {
  anger: 'var(--emotion-anger)',
  happy: 'var(--emotion-happy)',
  neutral: 'var(--emotion-neutral)',
  sad: 'var(--emotion-sad)',
}

interface Props {
  series: SentimentChunk[]
  /** Only render up to this many chunks (for live replay). Defaults to full series. */
  upToIndex?: number
  height?: number
  showLegend?: boolean
}

/** Stacked-area ribbon of the 4 emotion probabilities, filling left-to-right as the call proceeds. */
export default function EmotionRibbon({ series, upToIndex, height = 120, showLegend = true }: Props) {
  const visible = upToIndex === undefined ? series : series.slice(0, upToIndex + 1)
  if (visible.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', color: 'var(--faint)' }}>No data yet</div>
  }

  const width = 600
  const maxT = series[series.length - 1]?.tSec || 1
  const xFor = (tSec: number) => (tSec / maxT) * width

  const stackedPoints: Record<Emotion, { x: number; yTop: number; yBottom: number }[]> = {
    anger: [],
    happy: [],
    neutral: [],
    sad: [],
  }

  visible.forEach((chunk) => {
    let acc = 0
    const x = xFor(chunk.tSec)
    for (const emotion of EMOTION_ORDER) {
      const yBottom = acc
      acc += chunk[emotion]
      const yTop = acc
      stackedPoints[emotion].push({ x, yTop, yBottom })
    }
  })

  const yFor = (v: number) => height - v * height

  const pathFor = (emotion: Emotion) => {
    const pts = stackedPoints[emotion]
    if (pts.length === 0) return ''
    const top = pts.map((p) => `${p.x},${yFor(p.yTop)}`).join(' L ')
    const bottomRev = [...pts].reverse().map((p) => `${p.x},${yFor(p.yBottom)}`).join(' L ')
    return `M ${top} L ${bottomRev} Z`
  }

  const lastX = xFor(visible[visible.length - 1].tSec)

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {EMOTION_ORDER.map((emotion) => (
          <path key={emotion} d={pathFor(emotion)} fill={EMOTION_COLOR[emotion]} opacity={0.92} />
        ))}
        {upToIndex !== undefined && upToIndex < series.length - 1 && (
          <line x1={lastX} x2={lastX} y1={0} y2={height} stroke="var(--navy)" strokeWidth={1.5} />
        )}
      </svg>
      {showLegend && (
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--soft)' }}>
          {EMOTION_ORDER.map((emotion) => (
            <span key={emotion} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: EMOTION_COLOR[emotion],
                  display: 'inline-block',
                }}
              />
              {emotion}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
