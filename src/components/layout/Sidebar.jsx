import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuth } from '../../hooks/useAuth'
import { useNotifications } from '../../hooks/useNotifications'
import {
  LayoutDashboard, Bot, MessageSquare,
  Users, CheckSquare, PlayCircle, Settings,
  ChevronLeft, ChevronRight, Zap, LogOut,
  Sparkles, GitMerge,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents',        icon: Bot,             label: 'Agentes' },
  { to: '/conversations', icon: MessageSquare,   label: 'Conversaciones' },
  { to: '/funnels',       icon: GitMerge,        label: 'Embudos' },
  { to: '/contacts',      icon: Users,           label: 'Contactos' },
  { to: '/tasks',         icon: CheckSquare,     label: 'Tareas' },
  { to: '/tutorials',     icon: PlayCircle,      label: 'Tutoriales' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, project, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { unread, clearUnread } = useNotifications()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const displayName = user?.name || user?.email || 'Usuario'
  const initial     = displayName[0]?.toUpperCase() || 'A'

  return (
    <aside
      className={cn(
        'relative flex flex-col bg-surface-50 border-r border-white/5 transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 px-4 py-5 border-b border-white/5', collapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-aria-500 to-aria-700 flex items-center justify-center shrink-0 shadow-lg shadow-aria-500/20">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight text-white">ARIA</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isConversations = to === '/conversations'
          const showBadge = isConversations && unread > 0 && location.pathname !== '/conversations'
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => isConversations && clearUnread()}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative',
                  isActive
                    ? 'bg-aria-500/15 text-aria-300 shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/5',
                  collapsed && 'justify-center px-0',
                )
              }
              title={collapsed ? label : undefined}
            >
              <span className="relative shrink-0">
                <Icon size={18} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-aria-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && showBadge && (
                <span className="ml-auto w-5 h-5 rounded-full bg-aria-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Plan container */}
      {!collapsed && (
        <div className="mx-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-aria-500/10 to-aria-700/10 border border-aria-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-aria-400" />
            <span className="text-xs font-semibold text-aria-300">Growth</span>
          </div>
          <div className="text-xs text-white/40 mb-2">14 días restantes en prueba</div>
          <button
            onClick={() => navigate('/settings?tab=plan')}
            className="w-full text-xs font-semibold py-1.5 rounded-lg bg-aria-500 hover:bg-aria-600 text-white transition-colors"
          >
            Actualizar plan
          </button>
        </div>
      )}

      {/* Configuración */}
      <div className="px-2 pb-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              isActive
                ? 'bg-aria-500/15 text-aria-300'
                : 'text-white/50 hover:text-white hover:bg-white/5',
              collapsed && 'justify-center px-0',
            )
          }
          title={collapsed ? 'Configuración' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </NavLink>
      </div>

      {/* User + logout */}
      <div className={cn('border-t border-white/5 p-3 flex items-center gap-2.5', collapsed && 'justify-center')}>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-aria-400 to-aria-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
          {initial}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-white/30 truncate">{project?.name || project?._id || 'Workspace'}</p>
            </div>
            <button onClick={handleLogout} className="text-white/30 hover:text-white transition-colors" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-surface-100 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  )
}
