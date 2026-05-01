import { useState, useEffect, useCallback, useRef } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Spinner } from '../components/ui/Spinner'
import {
  Mail, Phone, Tag, RefreshCw, Trophy, ThumbsDown, Circle,
  ChevronDown, Plus, Settings2, Trash2, X, Check, Pencil,
} from 'lucide-react'

// ── Status lead ───────────────────────────────────────────────────────────────
const STATUS_CYCLE = { open: 'won', won: 'lost', lost: 'open' }
const STATUS_LABEL = { open: 'Abierto', won: 'Ganado', lost: 'Perdido' }
const STATUS_STYLE = {
  open: 'bg-white/8 text-white/40 hover:bg-white/12',
  won:  'bg-green-500/20 text-green-400 hover:bg-green-500/30',
  lost: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
}
const STATUS_ICON  = { open: <Circle size={9}/>, won: <Trophy size={9}/>, lost: <ThumbsDown size={9}/> }

const COLOR_PRESETS = ['#6366f1','#3b82f6','#06b6d4','#10b981','#22c55e','#f59e0b','#f97316','#ef4444','#ec4899','#8b5cf6']

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff/86400000)
  if (days > 0) return `${days}d`
  const hrs = Math.floor(diff/3600000)
  if (hrs > 0) return `${hrs}h`
  return `${Math.floor(diff/60000)}m`
}

function cName(c) { return c.fullname || c.name || c.fullName || '—' }

// ── Funnel selector dropdown ──────────────────────────────────────────────────
function FunnelSelector({ funnels, selected, onSelect, onNew }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const current = funnels.find(f => f.id === selected) || funnels[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-sm text-white transition-colors"
      >
        <span className="font-medium">{current?.name || 'Seleccionar'}</span>
        <ChevronDown size={14} className={`text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-[#12122a] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
          {funnels.map(f => (
            <button
              key={f.id}
              onClick={() => { onSelect(f.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                f.id === selected ? 'text-indigo-300 bg-indigo-500/10' : 'text-white/70 hover:bg-white/5'
              }`}
            >
              {f.id === selected && <Check size={12} className="shrink-0" />}
              {f.id !== selected && <div className="w-3" />}
              {f.name}
            </button>
          ))}
          <div className="border-t border-white/5 mt-1 pt-1">
            <button
              onClick={() => { onNew(); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-white/40 hover:bg-white/5 hover:text-white/60 transition-colors flex items-center gap-2"
            >
              <Plus size={12} />Nuevo funnel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal editar funnel ───────────────────────────────────────────────────────
function FunnelModal({ funnel, onSave, onClose }) {
  const [name,   setName]   = useState(funnel?.name || '')
  const [stages, setStages] = useState(funnel?.stages || [
    { id: 'prospecto',  label: 'Prospecto',  color: '#6366f1' },
    { id: 'calificado', label: 'Calificado', color: '#3b82f6' },
    { id: 'propuesta',  label: 'Propuesta',  color: '#f59e0b' },
    { id: 'cerrado',    label: 'Ganado',     color: '#22c55e' },
  ])
  const [saving, setSaving] = useState(false)

  function updateStage(idx, field, val) {
    setStages(s => s.map((st, i) => i === idx ? { ...st, [field]: val } : st))
  }
  function addStage() {
    setStages(s => [...s, { id: `stage_${Date.now()}`, label: 'Nueva etapa', color: '#6366f1' }])
  }
  function removeStage(idx) {
    setStages(s => s.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!name.trim() || stages.length === 0) return
    setSaving(true)
    await onSave({ name: name.trim(), stages })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f0f23] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">{funnel ? 'Editar funnel' : 'Nuevo funnel'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-white/40"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Name */}
          <div>
            <label className="text-xs text-white/50 mb-1 block">Nombre del funnel</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
              placeholder="Ej: Ventas, Soporte, Onboarding…"
            />
          </div>

          {/* Stages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/50">Etapas</label>
              <button onClick={addStage} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <Plus size={11} />Agregar
              </button>
            </div>
            <div className="space-y-2">
              {stages.map((st, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {/* Color picker */}
                  <div className="relative group">
                    <div className="w-6 h-6 rounded-full cursor-pointer border border-white/20" style={{ backgroundColor: st.color }} />
                    <div className="absolute top-full left-0 mt-1 hidden group-hover:flex flex-wrap gap-1 bg-[#1a1a2e] border border-white/10 rounded-xl p-2 w-36 z-10 shadow-xl">
                      {COLOR_PRESETS.map(c => (
                        <button key={c} onClick={() => updateStage(idx, 'color', c)}
                          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${st.color === c ? 'border-white' : 'border-transparent'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  {/* Label */}
                  <input
                    value={st.label}
                    onChange={e => updateStage(idx, 'label', e.target.value)}
                    className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-indigo-500/50"
                  />
                  <button onClick={() => removeStage(idx)} className="p-1 text-white/20 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-white/50 hover:text-white/70 transition-colors">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Funnels() {
  const { project } = useAuth()
  const navigate    = useNavigate()
  const projectId   = project?._id || project?.id

  const [funnels,      setFunnels]      = useState([])
  const [selectedId,   setSelectedId]   = useState(null)
  const [contacts,     setContacts]     = useState([])
  const [labels,       setLabels]       = useState([])
  const [activeLabel,  setActiveLabel]  = useState(null)  // filtro por etiqueta
  const [stageMap,     setStageMap]     = useState({})   // { leadId: { stage, lead_status } }
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [showModal,    setShowModal]    = useState(false)
  const [editingFunnel,setEditingFunnel]= useState(null)  // null = new

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!projectId) return
    setLoading(true); setError(null)
    try {
      const [fData, cData, sData, lData] = await Promise.all([
        api.getFunnels(),
        api.getContacts(projectId, { limit: 300 }),
        api.getFunnelStages(),
        api.getLabels(projectId),
      ])
      setFunnels(fData || [])
      if (fData?.length && !selectedId) setSelectedId(fData[0].id)
      const list = (Array.isArray(cData) ? cData : (cData?.leads || []))
        .filter(c => !c.attributes?.aria_test_contact)
      setContacts(list)
      setStageMap(sData || {})
      setLabels(Array.isArray(lData) ? lData : (lData?.data || lData?.labels || []))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [projectId])

  useEffect(() => { loadAll() }, [loadAll])

  const currentFunnel = funnels.find(f => f.id === selectedId) || funnels[0]
  const stages        = currentFunnel?.stages || []

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  async function onDragEnd({ draggableId, destination }) {
    if (!destination) return
    const newStage = destination.droppableId
    const cur      = stageMap[draggableId] || { stage: stages[0]?.id || 'prospecto', lead_status: 'open' }
    if (cur.stage === newStage) return

    const next = { ...stageMap, [draggableId]: { ...cur, stage: newStage } }
    setStageMap(next)
    setSaving(true)
    try { await api.setFunnelStage(draggableId, newStage, cur.lead_status) }
    catch { setStageMap(stageMap) }
    setSaving(false)
  }

  // ── Lead status ─────────────────────────────────────────────────────────────
  async function handleStatus(leadId, newStatus) {
    const cur  = stageMap[leadId] || { stage: stages[0]?.id || 'prospecto', lead_status: 'open' }
    const next = { ...stageMap, [leadId]: { ...cur, lead_status: newStatus } }
    setStageMap(next)
    try { await api.setFunnelStage(leadId, cur.stage, newStatus) }
    catch { setStageMap(stageMap) }
  }

  // ── Funnel CRUD ─────────────────────────────────────────────────────────────
  async function handleSaveFunnel(payload) {
    if (editingFunnel) {
      await api.updateFunnel(editingFunnel.id, payload)
    } else {
      const created = await api.createFunnel(payload)
      setSelectedId(created.id)
    }
    setShowModal(false)
    loadAll()
  }

  async function handleDeleteFunnel(f) {
    if (!confirm(`¿Eliminar el funnel "${f.name}"?`)) return
    await api.deleteFunnel(f.id)
    setSelectedId(null)
    loadAll()
  }

  // ── Labels ───────────────────────────────────────────────────────────────────
  const labelColorMap = Object.fromEntries(labels.map(l => [l.title || l.name || '', l.color || '#6366f1']))

  // ── Filter contacts by stage (+ etiqueta activa) ──────────────────────────────
  const getStage = (id) => {
    const s = stageMap[id]?.stage
    return s || (stages[0]?.id)
  }
  const byStage = (stageId) => contacts.filter(c => {
    if (getStage(c._id || c.id) !== stageId) return false
    if (activeLabel) return (c.tags || []).includes(activeLabel)
    return true
  })

  if (!projectId) return (
    <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Sin proyecto</div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-white/5 flex items-center gap-3 shrink-0">
        <FunnelSelector
          funnels={funnels}
          selected={selectedId}
          onSelect={setSelectedId}
          onNew={() => { setEditingFunnel(null); setShowModal(true) }}
        />

        {/* Edit + delete current funnel */}
        {currentFunnel && (
          <>
            <button
              onClick={() => { setEditingFunnel(currentFunnel); setShowModal(true) }}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
              title="Editar funnel"
            >
              <Settings2 size={14} />
            </button>
            {funnels.length > 1 && (
              <button
                onClick={() => handleDeleteFunnel(currentFunnel)}
                className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-red-400 transition-colors"
                title="Eliminar funnel"
              >
                <Trash2 size={14} />
              </button>
            )}
          </>
        )}

        {/* Filtro por etiqueta */}
        {labels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {activeLabel && (
              <button onClick={() => setActiveLabel(null)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 hover:text-white transition-colors flex items-center gap-1">
                <X size={9} /> Todos
              </button>
            )}
            {labels.map(l => {
              const title = l.title || l.name || ''
              const color = l.color || '#6366f1'
              const active = activeLabel === title
              return (
                <button key={l._id || l.id} onClick={() => setActiveLabel(active ? null : title)}
                  className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 transition-all border"
                  style={{
                    background: active ? color + '33' : 'transparent',
                    borderColor: active ? color : 'rgba(255,255,255,0.1)',
                    color: active ? color : 'rgba(255,255,255,0.4)',
                  }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  {title}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex-1" />

        {!loading && <span className="text-xs text-white/25">{contacts.length} contactos</span>}
        {saving && (
          <span className="text-xs text-indigo-400 flex items-center gap-1">
            <RefreshCw size={10} className="animate-spin" />guardando…
          </span>
        )}
        <button onClick={loadAll} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="px-6 py-1.5 border-b border-white/5 flex items-center gap-4 text-[11px] text-white/25">
        <span className="flex items-center gap-1"><Circle size={8} />Abierto</span>
        <span className="flex items-center gap-1 text-green-400/60"><Trophy size={8} />Ganado</span>
        <span className="flex items-center gap-1 text-red-400/60"><ThumbsDown size={8} />Perdido</span>
        <span className="ml-auto">Arrastrá para mover · Clic en el estado para cambiarlo</span>
      </div>

      {/* ── Board ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm">{error}</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 h-full" style={{ minWidth: 'max-content' }}>
              {stages.map(stage => {
                const cards = byStage(stage.id)
                const won   = cards.filter(c => stageMap[c._id||c.id]?.lead_status === 'won').length

                return (
                  <div key={stage.id}
                    className="flex flex-col rounded-xl border bg-black/20 min-w-[230px] w-56"
                    style={{ borderColor: stage.color + '40' }}>
                    {/* Column header */}
                    <div className="px-3 py-2.5 border-b border-white/5 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="text-xs font-semibold text-white/80 flex-1 uppercase tracking-wider">{stage.label}</span>
                      <span className="text-xs text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">{cards.length}</span>
                      {won > 0 && (
                        <span className="text-[10px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Trophy size={8} />{won}
                        </span>
                      )}
                    </div>

                    {/* Cards */}
                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 p-2 min-h-[80px] rounded-b-xl transition-colors ${snapshot.isDraggingOver ? 'bg-white/5' : ''}`}
                        >
                          {cards.length === 0 && !snapshot.isDraggingOver && (
                            <div className="flex items-center justify-center h-14 text-[10px] text-white/12 border border-dashed border-white/8 rounded-lg">
                              Soltar aquí
                            </div>
                          )}
                          {cards.map((c, i) => {
                            const leadInfo = stageMap[c._id||c.id] || { stage: stage.id, lead_status: 'open' }
                            const ls       = leadInfo.lead_status || 'open'

                            return (
                              <Draggable key={c._id||c.id} draggableId={c._id||c.id} index={i}>
                                {(prov, snap) => (
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    {...prov.dragHandleProps}
                                    className={`bg-white/5 border rounded-xl p-3 mb-2 select-none transition-all ${
                                      snap.isDragging
                                        ? 'border-indigo-400/60 shadow-xl ring-1 ring-indigo-400/30 bg-white/10 cursor-grabbing'
                                        : 'border-white/8 hover:border-white/15 hover:bg-white/7 cursor-grab'
                                    }`}
                                  >
                                    {/* Avatar + info */}
                                    <div className="flex items-start gap-2 mb-2">
                                      <div className="w-7 h-7 rounded-full bg-indigo-500/25 flex items-center justify-center text-[11px] font-bold text-indigo-300 shrink-0">
                                        {(cName(c)[0]||'?').toUpperCase()}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <button
                                          onClick={() => navigate('/conversations')}
                                          className="text-[13px] font-semibold text-white/90 hover:text-indigo-300 transition-colors truncate text-left w-full leading-tight"
                                        >
                                          {cName(c)}
                                        </button>
                                        {c.email && (
                                          <p className="text-[10px] text-white/30 truncate flex items-center gap-0.5 mt-0.5">
                                            <Mail size={8} className="shrink-0" />{c.email}
                                          </p>
                                        )}
                                        {c.phone && (
                                          <p className="text-[10px] text-white/30 truncate flex items-center gap-0.5 mt-0.5">
                                            <Phone size={8} className="shrink-0" />{c.phone}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Tags con colores de Tiledesk */}
                                    {c.tags?.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mb-2">
                                        {c.tags.slice(0,3).map((t,ti) => {
                                          const color = labelColorMap[t] || '#6366f1'
                                          return (
                                            <span key={ti}
                                              className="text-[9px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
                                              style={{ background: color + '22', color }}>
                                              <Tag size={7}/>{t}
                                            </span>
                                          )
                                        })}
                                        {c.tags.length > 3 && (
                                          <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-white/20">+{c.tags.length-3}</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Status + time */}
                                    <div className="flex items-center justify-between">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleStatus(c._id||c.id, STATUS_CYCLE[ls]) }}
                                        className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${STATUS_STYLE[ls]}`}
                                      >
                                        {STATUS_ICON[ls]}{STATUS_LABEL[ls]}
                                      </button>
                                      <span className="text-[10px] text-white/20">{timeAgo(c.updatedAt||c.createdAt)}</span>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            )
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </div>
        </DragDropContext>
      )}

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      {showModal && (
        <FunnelModal
          funnel={editingFunnel}
          onSave={handleSaveFunnel}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
