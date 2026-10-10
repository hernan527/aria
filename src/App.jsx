import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { NotificationsProvider } from './hooks/useNotifications'
import { NotificationToast } from './components/ui/NotificationToast'
import { auth } from './lib/auth'
import { AppLayout } from './components/layout/AppLayout'
import { Spinner } from './components/ui/Spinner'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Conversations from './pages/Conversations'
import Kanban from './pages/Kanban'
import Connections from './pages/Connections'
import Atenciones from './pages/Atenciones'
import Funnels from './pages/Funnels'
import Contacts from './pages/Contacts'
import Tasks from './pages/Tasks'
import Campaigns from './pages/Campaigns'
import Axel from './pages/Axel'
import Lucas from './pages/Lucas'
import Tutorials from './pages/Tutorials'
import Settings from './pages/Settings'
import AgentWizard from './pages/AgentWizard'
import AgentDetail from './pages/AgentDetail'
import QuickCreate from './pages/QuickCreate'
import AcceptInvite from './pages/AcceptInvite'

function RequireAuth({ children }) {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    )
  }
  if (!auth.isAuthenticated()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NotificationsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<AcceptInvite />} />
            <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="agents" element={<Agents />} />
              <Route path="agents/new" element={<AgentWizard />} />
              <Route path="agents/quick" element={<QuickCreate />} />
              <Route path="agents/edit/:botId" element={<AgentWizard />} />
              <Route path="agents/:botId" element={<AgentDetail />} />
              <Route path="conversations" element={<Conversations />} />
              <Route path="atenciones" element={<Atenciones />} />
              <Route path="kanban" element={<Kanban />} />
              <Route path="connections" element={<Connections />} />
              <Route path="funnels" element={<Funnels />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="auditor" element={<Axel />} />
              <Route path="lucas" element={<Lucas />} />
              <Route path="tutorials" element={<Tutorials />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <NotificationToast />
        </NotificationsProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
