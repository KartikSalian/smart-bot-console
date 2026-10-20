import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        gap: 10,
      }}
    >
      <h1 style={{ fontSize: 22 }}>Page not found</h1>
      <p style={{ color: 'var(--soft)', fontSize: 14 }}>That link doesn't match anything — check the URL.</p>
      <Link to="/" style={{ color: 'var(--navy-2)', fontSize: 14, marginTop: 6 }}>
        Back to Smartbot Console
      </Link>
    </div>
  )
}
