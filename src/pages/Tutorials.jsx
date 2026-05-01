import { PlayCircle } from 'lucide-react'

const VIDEOS = [
  {
    id: 'v1',
    title: 'Introducción a ARIA',
    description: 'Conocé las funcionalidades principales de la plataforma',
    youtubeId: null,
    duration: '5:30',
  },
  {
    id: 'v2',
    title: 'Configurar tu primer bot',
    description: 'Paso a paso para crear un agente de IA',
    youtubeId: null,
    duration: '12:00',
  },
  {
    id: 'v3',
    title: 'Dashboard y métricas',
    description: 'Cómo interpretar los datos del Dashboard',
    youtubeId: null,
    duration: '8:15',
  },
]

export default function Tutorials() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Tutoriales</h1>
        <p className="text-sm text-white/40 mt-0.5">Aprendé a sacarle el máximo provecho a ARIA</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VIDEOS.map((v) => (
          <div key={v.id} className="card group cursor-pointer hover:border-aria-500/30 transition-colors">
            <div className="aspect-video rounded-xl bg-surface-100 flex items-center justify-center mb-4 group-hover:bg-aria-500/10 transition-colors">
              {v.youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${v.youtubeId}`}
                  className="w-full h-full rounded-xl"
                  title={v.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <PlayCircle className="w-10 h-10 text-white/20 group-hover:text-aria-400 transition-colors" />
              )}
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">{v.title}</h3>
            <p className="text-xs text-white/40 mb-3">{v.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/20">{v.duration}</span>
              <span className="text-xs text-aria-400 font-medium">Ver tutorial →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
