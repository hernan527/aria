import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { api } from '../lib/api'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import {
  Bot, Cpu, Activity, Plus, Trash2, ExternalLink,
  MoreVertical, Power, ScrollText, SlidersHorizontal,
  Paperclip, UserCheck, HelpCircle, Plane,
  ShieldCheck, Car, PiggyBank, Zap, Play, Sparkles,
} from 'lucide-react'

const TEMPLATE_META = {
  'lead-qualifier':        { icon: UserCheck,  color: '#6b7fff', label: 'Calificador de Leads'  },
  'faq':                   { icon: HelpCircle, color: '#34d399', label: 'Preguntas Frecuentes'  },
  'travel':                { icon: Plane,      color: '#f59e0b', label: 'Agencia de Viajes'     },
  'broker':                { icon: ShieldCheck,color: '#a78bfa', label: 'Broker de Salud'       },
  'concesionaria-directa': { icon: Car,        color: '#f97316', label: 'Concesionaria'         },
  'concesionaria-plan':    { icon: PiggyBank,  color: '#ec4899', label: 'Plan Ahorro'           },
}

// ── Dify bot card ─────────────────────────────────────────────────────────────

function DifyBotCard({ isActive, llmCfg, onToggleActive }) {
  return (
    <div className="card-sm flex flex-col gap-3 relative"
      style={{ border: isActive ? '1px solid #6b7fff60' : undefined }}>
      {/* Icono + nombre */}
      <div className="flex items-center gap-3 pr-8">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg,#6b7fff,#a78bfa)', boxShadow: '0 0 16px #6b7fff30' }}>
          <Sparkles size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">ARIA Bot (Dify)</p>
          <p className="text-xs text-white/35">Dify self-hosted</p>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/6">
          <p className="text-[10px] text-white/35 mb-0.5">Motor</p>
          <p className="text-xs text-white/70 font-medium">Dify</p>
        </div>
        <div className="px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/6">
          <p className="text-[10px] text-white/35 mb-0.5">Handoff</p>
          <p className="text-xs text-white/70 font-medium">Activado</p>
        </div>
      </div>

      {/* Estado + acción */}
      <div className="flex items-center justify-between">
        <Badge variant={isActive ? 'success' : 'default'}>
          {isActive ? 'Activo' : 'Inactivo'}
        </Badge>
        <button
          onClick={() => onToggleActive('__dify__')}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${
            isActive
              ? 'text-red-400 hover:text-red-300 hover:bg-red-500/8'
              : 'text-aria-400 hover:text-aria-300 hover:bg-aria-500/8'
          }`}>
          <Power size={11} />
          {isActive ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}

// ── Bot card con menú tres puntos ─────────────────────────────────────────────

function BotCard({ bot, meta, projectId, onDelete, onToggleActive, activeBotId }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()
  const tpl = meta?.template_id ? TEMPLATE_META[meta.template_id] : null
  const TplIcon = tpl?.icon || Bot
  const isActive = activeBotId === bot._id

  useEffect(() => {
    function handler(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function goTo(tab) {
    setMenuOpen(false)
    navigate(`/agents/${bot._id}`, { state: { tab } })
  }

  return (
    <div className="card-sm flex flex-col gap-3 relative">
      {/* Menú tres puntos */}
      <div ref={menuRef} className="absolute top-3 right-3">
        <button onClick={() => setMenuOpen(v => !v)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/8 transition-colors">
          <MoreVertical size={15} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 w-48 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            <button
              onClick={() => { setMenuOpen(false); onToggleActive(bot._id) }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors text-left">
              <Power size={13} className={isActive ? 'text-green-400' : ''} />
              {isActive ? 'Desactivar' : 'Activar'}
            </button>
            <div className="h-px bg-white/8 mx-3" />
            <button onClick={() => { setMenuOpen(false); navigate(`/agents/${bot._id}`) }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-aria-400 hover:text-aria-300 hover:bg-aria-500/8 transition-colors text-left font-medium">
              <Play size={13} /> Probarlo
            </button>
            <div className="h-px bg-white/8 mx-3" />
            <button onClick={() => goTo('instrucciones')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors text-left">
              <ScrollText size={13} /> Instrucciones
            </button>
            <button onClick={() => goTo('configuracion')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors text-left">
              <SlidersHorizontal size={13} /> Configuración
            </button>
            <button onClick={() => goTo('adjuntos')}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors text-left">
              <Paperclip size={13} /> Adjuntos
            </button>
            <div className="h-px bg-white/8 mx-3" />
            <button
              onClick={() => { setMenuOpen(false); onDelete(bot._id) }}
              className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/8 transition-colors text-left">
              <Trash2 size={13} /> Archivar
            </button>
          </div>
        )}
      </div>

      {/* Icono + nombre */}
      <div className="flex items-center gap-3 pr-8">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={tpl
            ? { backgroundColor: tpl.color + '20', border: `1px solid ${tpl.color}40` }
            : { background: 'linear-gradient(135deg,#7c3aed,#6366f1)' }}>
          <TplIcon size={20} style={tpl ? { color: tpl.color } : { color: '#fff' }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{bot.name || bot._id}</p>
          {tpl && <p className="text-xs text-white/35">{tpl.label}</p>}
        </div>
      </div>

      {/* Detalles de metadata */}
      {meta && (
        <div className="grid grid-cols-2 gap-1.5">
          {meta.tone && (
            <div className="px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/6">
              <p className="text-[10px] text-white/35 mb-0.5">Tono</p>
              <p className="text-xs text-white/70 font-medium">{meta.tone}</p>
            </div>
          )}
          {meta.nationality && (
            <div className="px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/6">
              <p className="text-[10px] text-white/35 mb-0.5">Nacionalidad</p>
              <p className="text-xs text-white/70 font-medium">{meta.nationality}</p>
            </div>
          )}
          {meta.company_name && (
            <div className="col-span-2 px-2.5 py-1.5 rounded-lg bg-white/4 border border-white/6">
              <p className="text-[10px] text-white/35 mb-0.5">Empresa</p>
              <p className="text-xs text-white/70 font-medium truncate">{meta.company_name}</p>
            </div>
          )}
        </div>
      )}

      {/* Estado */}
      <div className="flex items-center justify-between">
        <Badge variant={meta?.active ? 'success' : 'default'}>
          {meta?.active ? 'Activo' : 'Inactivo'}
        </Badge>
        {!meta && (
          <span className="text-[10px] text-white/25">Sin configuración ARIA</span>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Agents() {
  const navigate    = useNavigate()
  const { project } = useAuth()
  const projectId   = project?._id || project?.id

  const [refreshKey,  setRefreshKey]  = useState(0)
  const [activeBotId, setActiveBotId] = useState(null)
  const [savingBot,   setSavingBot]   = useState(false)

  const { data: difyAgents, loading: loadingDify } = useApi(() => api.getDifyAgents(), [refreshKey])
  const { data: metadata,   loading: loadingMeta  } = useApi(() => api.getAgentMetadata(), [refreshKey])
  const { data: chSettings                        } = useApi(() => api.getChannelSettings(), [refreshKey])

  useEffect(() => {
    if (chSettings?.default_bot_id !== undefined) {
      setActiveBotId(chSettings.default_bot_id || null)
    }
  }, [chSettings])

  const loading  = loadingDify || loadingMeta
  // dify_agents usa id; normalizar a _id para BotCard
  const botList  = (Array.isArray(difyAgents) ? difyAgents : []).map(a => ({ ...a, _id: a.id }))
  const metaMap  = Array.isArray(metadata)
    ? Object.fromEntries(metadata.map(m => [m.bot_id, m]))
    : {}

  async function handleSetActiveBot(botId) {
    setSavingBot(true)
    try {
      const next = botId === activeBotId ? null : botId
      await api.setActiveBotId(next)
      setActiveBotId(next)
    } catch {}
    setSavingBot(false)
  }

  const handleDelete = async (botId) => {
    if (!confirm('¿Eliminar este agente IA? Esta acción no se puede deshacer.')) return
    try {
      await api.deleteAgent(botId)
      setRefreshKey(k => k + 1)
    } catch (e) {
      alert('Error al eliminar: ' + e.message)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Agentes</h1>
          <p className="text-sm text-white/40 mt-0.5">Agentes IA creados en ARIA (powered by Dify)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/agents/quick')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg,#6b7fff,#a78bfa)' }}>
            <Sparkles size={16} /> Crear con IA
          </button>
          <button onClick={() => navigate('/agents/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-white/70 hover:text-white text-sm font-medium transition-colors">
            <Plus size={16} /> Wizard
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner /></div>
      ) : (
        <div className="grid gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Cpu size={16} className="text-white/40" />
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Bots IA</h2>
              <Badge variant="primary">{botList.length}</Badge>
            </div>

            {/* Bot activo */}
            {botList.length > 0 && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-white/3 border border-white/8 flex items-center gap-3">
                <Zap size={15} className={activeBotId ? 'text-aria-400' : 'text-white/25'} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white/70">Bot activo en WhatsApp</p>
                  <p className="text-[11px] text-white/35">
                    {activeBotId
                      ? (botList.find(b => b._id === activeBotId)?.name || activeBotId) + ' — responde automáticamente'
                      : 'Ninguno seleccionado — los mensajes no tienen respuesta automática'}
                  </p>
                </div>
                <select
                  value={activeBotId || ''}
                  onChange={e => handleSetActiveBot(e.target.value || null)}
                  disabled={savingBot}
                  className="bg-[#1a1a2e] text-white text-xs px-3 py-1.5 rounded-lg border border-white/10 outline-none focus:border-aria-500 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <option value="">Sin bot activo</option>
                  {botList.map(b => (
                    <option key={b._id} value={b._id}>{b.name || b._id}</option>
                  ))}
                </select>
              </div>
            )}

            {botList.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Bot size={24} className="text-white/20" />
                </div>
                <p className="text-sm text-white/30">No hay agentes IA creados</p>
                <button onClick={() => navigate('/agents/new')}
                  className="flex items-center gap-1.5 text-xs text-aria-400 hover:text-aria-300 transition-colors">
                  <Plus size={14} /> Crear primer agente
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {botList.map(bot => (
                  <BotCard
                    key={bot._id}
                    bot={bot}
                    meta={metaMap[bot._id] || null}
                    projectId={projectId}
                    onDelete={handleDelete}
                    onToggleActive={handleSetActiveBot}
                    activeBotId={activeBotId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
