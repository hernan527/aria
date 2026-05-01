import { MessageSquare, X } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import { useNavigate } from 'react-router-dom'

export function NotificationToast() {
  const { toasts } = useNotifications()
  const navigate   = useNavigate()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => navigate('/conversations')}
          className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl bg-[#1a1a2e] border border-aria-500/40 shadow-2xl shadow-aria-500/20 w-72 cursor-pointer hover:border-aria-400/60 transition-all animate-slide-in"
        >
          <div className="w-8 h-8 rounded-lg bg-aria-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <MessageSquare size={15} className="text-aria-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{t.from}</p>
            <p className="text-xs text-white/50 truncate mt-0.5">{t.text}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
