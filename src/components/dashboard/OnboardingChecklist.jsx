import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { UserCheck, Bot, MessageCircle, GitMerge, Users, Check, ChevronRight } from 'lucide-react'

// Configuración inicial: 5 pasos con su estado real (lo calcula /api/onboarding)
const STEPS = [
  { key: 'account', icon: UserCheck,     title: 'Creá tu cuenta',                   desc: null,                                                          to: null },
  { key: 'agent',   icon: Bot,           title: 'Crear tu primer Agente IA',        desc: 'Configurá un asistente inteligente para tu negocio.',         to: '/agents/new' },
  { key: 'channel', icon: MessageCircle, title: 'Conectar canales de comunicación', desc: 'Creá tu primer número de WhatsApp para comenzar a conversar.', to: '/settings?tab=canales' },
  { key: 'funnel',  icon: GitMerge,      title: 'Crear tu primer embudo de ventas', desc: 'Definí las etapas y comenzá a gestionar oportunidades.',      to: '/funnels' },
  { key: 'team',    icon: Users,         title: 'Invitá a tu equipo de ventas',     desc: 'Compartí el acceso con tu equipo para trabajar en conjunto.', to: '/settings?tab=vendedores' },
]

function ProgressDonut({ done, total }) {
  const r = 26, c = 2 * Math.PI * r
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0" role="img" aria-label={`${done} de ${total} pasos completos`}>
      <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
      <circle cx="34" cy="34" r={r} fill="none" stroke="#3355ff" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(done / total) * c} ${c}`} transform="rotate(-90 34 34)" style={{ transition: 'stroke-dasharray .4s' }} />
      <text x="34" y="39" textAnchor="middle" fill="white" fontSize="15" fontWeight="700">{done}/{total}</text>
    </svg>
  )
}

export function OnboardingChecklist() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  useEffect(() => { api.getOnboarding().then(setData).catch(() => {}) }, [])
  if (!data) return null

  const pct = Math.round((data.done / data.total) * 100)
  return (
    <div className="card hover:translate-y-0 mb-6">
      <div className="flex items-center gap-4 mb-4">
        <ProgressDonut done={data.done} total={data.total} />
        <div className="min-w-0">
          <p className="text-base font-semibold text-white">Configuración inicial <span className="text-white/40 font-normal text-sm">{data.done}/{data.total}</span></p>
          <p className="text-xs text-white/45 mt-0.5">Completá estos pasos para maximizar el potencial de tu IA · {pct}% completo</p>
        </div>
      </div>
      <ol className="space-y-1.5">
        {STEPS.map((st, i) => {
          const ok = !!data.steps[st.key]
          const clickable = !ok && st.to
          return (
            <li key={st.key}>
              <button type="button" disabled={!clickable} onClick={() => clickable && navigate(st.to)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors',
                  ok ? 'border-emerald-500/15 bg-emerald-500/[0.04] cursor-default' : 'border-white/10 bg-white/[0.02] hover:border-aria-500/40')}>
                <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0',
                  ok ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/60')}>
                  {ok ? <Check size={13} /> : i + 1}
                </span>
                <st.icon size={16} className={ok ? 'text-emerald-300/70 shrink-0' : 'text-aria-300 shrink-0'} />
                <span className="flex-1 min-w-0">
                  <span className={cn('block text-sm', ok ? 'text-white/50 line-through decoration-white/20' : 'text-white')}>{st.title}</span>
                  {st.desc && !ok && <span className="block text-xs text-white/40">{st.desc}</span>}
                </span>
                {ok
                  ? <span className="text-[11px] text-emerald-300/80 shrink-0">Completo</span>
                  : clickable && <ChevronRight size={15} className="text-white/30 shrink-0" />}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
