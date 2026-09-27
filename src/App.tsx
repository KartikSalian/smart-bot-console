import { Route, Routes } from 'react-router-dom'
import Sidebar from './Sidebar'
import Overview from './pages/Overview'
import CallList from './pages/CallList'
import CallDetail from './pages/CallDetail'
import Live from './pages/Live'
import MyCalls from './pages/MyCalls'
import Login from './pages/Login'
import { RequireAuth } from './auth/RequireAuth'

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main>{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth allow={['supervisor']}>
            <AppShell>
              <Overview />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/calls"
        element={
          <RequireAuth allow={['supervisor']}>
            <AppShell>
              <CallList />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/calls/:callId"
        element={
          <RequireAuth allow={['supervisor']}>
            <AppShell>
              <CallDetail />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/live"
        element={
          <RequireAuth allow={['agent']}>
            <AppShell>
              <Live />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/my-calls"
        element={
          <RequireAuth allow={['agent']}>
            <AppShell>
              <MyCalls />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/my-calls/:callId"
        element={
          <RequireAuth allow={['agent']}>
            <AppShell>
              <CallDetail />
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
