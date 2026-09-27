import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) => 'sidebar-link' + (isActive ? ' active' : '')

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Smartbot Console</div>
      <nav className="sidebar-nav">
        {user?.role === 'supervisor' && (
          <>
            <NavLink to="/" end className={linkClass}>
              Overview
            </NavLink>
            <NavLink to="/calls" className={linkClass}>
              Call summaries
            </NavLink>
          </>
        )}
        {user?.role === 'agent' && (
          <>
            <NavLink to="/live" className={linkClass}>
              Live calls
            </NavLink>
            <NavLink to="/my-calls" className={linkClass}>
              My calls
            </NavLink>
          </>
        )}
        <span className="sidebar-link disabled">Agents</span>
        <span className="sidebar-link disabled">Settings</span>
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {user && (
          <div style={{ padding: '0 8px 8px', color: '#c4cbe8' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 11.5, color: '#8b93c4', textTransform: 'capitalize' }}>{user.role}</div>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            color: '#c4cbe8',
            padding: '9px 8px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Log out
        </button>
      </div>
    </aside>
  )
}
