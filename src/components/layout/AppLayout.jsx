import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AssistantWidget } from './AssistantWidget'

export function AppLayout() {
  return (
    <div className="relative flex h-screen overflow-hidden bg-surface">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] bg-aria-600/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/3 -right-40 w-[480px] h-[480px] bg-purple-600/8 blur-[130px] rounded-full" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[400px] bg-cyan-500/6 blur-[130px] rounded-full" />
      </div>
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <AssistantWidget />
    </div>
  )
}
