type Tone = 'good' | 'warn' | 'critical'

export default function StatusTag({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`tag tag-${tone}`}>{label}</span>
}
