import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Settings2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Kanban() {
  const [url,     setUrl]     = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.getChannelSettings()
      .then(s => setUrl(s?.kanban_url || ''))
      .catch(() => setUrl(''))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex-1 flex items-center justify-center text-white/20 text-sm">Cargando…</div>

  if (!url) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
        <Settings2 size={26} className="text-purple-400" />
      </div>
      <div>
        <p className="text-white font-semibold text-sm">Configurá kanbancw</p>
        <p className="text-white/40 text-xs mt-1 max-w-xs">Ingresá la URL en Configuración → Canales → Credenciales.</p>
      </div>
      <button onClick={() => navigate('/settings?tab=canales')}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
        <Settings2 size={14} /> Ir a Configuración
      </button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5 bg-black/20 shrink-0">
        <span className="text-[11px] text-white/25">{url}</span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/50 transition-colors">
          <ExternalLink size={11} /> Abrir en pestaña
        </a>
      </div>
      <iframe src={url} title="Kanban" className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; microphone; camera" allowFullScreen />
    </div>
  )
}
