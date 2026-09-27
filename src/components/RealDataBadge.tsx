export default function RealDataBadge() {
  return (
    <span
      className="synthetic-badge"
      style={{ background: 'rgba(47, 158, 115, 0.12)', borderColor: 'rgba(47, 158, 115, 0.3)', color: 'var(--green)' }}
      title="Real audio, scored live by the deployed SERTS model. Call reason/questions/actions are derived from real annotated transcripts, not an LLM."
    >
      Real model output
    </span>
  )
}
