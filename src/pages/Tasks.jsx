import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import {
  CheckSquare, Plus, Search, Calendar, Flag,
  User, X, Save, Loader2, AlertCircle, Clock,
  CheckCircle2, Circle, Trash2, ChevronDown, GitMerge,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const PRIORITY = {
  low:    { label: 'Baja',    color: 'text-gray-400',   bg: 'bg-gray-100',  dot: '#9ca3af' },
  normal: { label: 'Media',   color: 'text-blue-500',   bg: 'bg-blue-50',   dot: '#3b82f6' },
  high:   { label: 'Alta',    color: 'text-orange-500', bg: 'bg-orange-50', dot: '#f97316' },
  urgent: { label: 'Urgente', color: 'text-red-500',    bg: 'bg-red-50',    dot: '#ef4444' },
}

const STATUS = {
  pending:     { label: 'Pendiente',   color: 'text-gray-500' },
  in_progress: { label: 'En progreso', color: 'text-blue-500' },
  done:        { label: 'Completada',  color: 'text-green-500' },
}

function dueDateStatus(ts) {
  if (!ts) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const day = new Date(ts * 1000); day.setHours(0, 0, 0, 0)
  const diff = Math.round((day - now) / 86400000)
  if (diff < 0)   return { label: 'Vencida', cls: 'text-red-500 bg-red-50' }
  if (diff === 0) return { label: 'Hoy',     cls: 'text-orange-500 bg-orange-50' }
  if (diff === 1) return { label: 'Mañana',  cls: 'text-yellow-600 bg-yellow-50' }
  return { label: new Date(ts * 1000).toLocaleDateString('es', { day: 'numeric', month: 'short' }), cls: 'text-gray-500 bg-gray-100' }
}

function toISOLocal(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

// ── Select helper ─────────────────────────────────────────────────────────────
function Select({ value, onChange, options, icon }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="pl-8 pr-7 py-2 bg-gray-100 border border-transparent rounded-xl text-[12px] text-gray-600 outline-none focus:border-indigo-300 appearance-none cursor-pointer hover:bg-gray-200 transition-colors">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

// ── Contact Search ────────────────────────────────────────────────────────────
function ContactSearch({ projectId, value, onChange }) {
  const [q, setQ]             = useState(value?.fullname || '')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)
  const ref   = useRef(null)

  useEffect(() => {
    function click(e) { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  function handleInput(v) {
    setQ(v)
    if (!v.trim()) { setResults([]); onChange(null); return }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const d = await api.getContacts(projectId, { fullname: v, limit: 8 })
        setResults(Array.isArray(d) ? d : (d?.leads || []))
        setOpen(true)
      } catch {}
      setSearching(false)
    }, 350)
  }

  function select(c) {
    setQ(c.fullname || c.email || c._id)
    onChange(c)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input value={q} onChange={e => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Selecciona un contacto"
          className="w-full border border-gray-200 rounded-xl pl-8 pr-8 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-300 placeholder-gray-300" />
        {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
        {value && !searching && (
          <button onClick={() => { setQ(''); onChange(null); setResults([]) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
            <X size={13} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.map(c => (
            <button key={c._id} onClick={() => select(c)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-indigo-50 text-left transition-colors">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold shrink-0">
                {(c.fullname || c.email || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-800 truncate">{c.fullname || '—'}</p>
                <p className="text-[11px] text-gray-400 truncate">{c.phone || c.email || ''}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task Modal ────────────────────────────────────────────────────────────────
function TaskModal({ task, agents, projectId, funnels, onClose, onSaved }) {
  const isEdit = !!task

  const initDate = task?.due_date ? toISOLocal(task.due_date) : ''
  const initTime = task?.due_date
    ? new Date(task.due_date * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''

  const [form, setForm] = useState({
    title:         task?.title         || '',
    description:   task?.description   || '',
    status:        task?.status        || 'pending',
    priority:      task?.priority      || 'normal',
    assignee_id:   task?.assignee_id   || '',
    assignee_name: task?.assignee_name || '',
    funnel_id:     task?.funnel_id     || '',
    funnel_name:   task?.funnel_name   || '',
  })
  const [dueDate,  setDueDate]  = useState(initDate)
  const [dueTime,  setDueTime]  = useState(initTime)
  const [contact,  setContact]  = useState(task?.lead_id ? { _id: task.lead_id, fullname: task.lead_name } : null)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function useNow() {
    const now = new Date()
    if (!dueDate) setDueDate(now.toISOString().slice(0, 10))
    setDueTime(now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false }))
  }

  function buildDueTs() {
    if (!dueDate) return null
    const dt = new Date(`${dueDate}T${dueTime || '00:00'}`)
    return isNaN(dt) ? null : Math.floor(dt.getTime() / 1000)
  }

  async function handleSave() {
    if (!form.title.trim()) return setError('El título es obligatorio')
    setSaving(true); setError(null)
    try {
      const payload = {
        ...form,
        lead_id:   contact?._id   || null,
        lead_name: contact?.fullname || null,
        due_date:  buildDueTs(),
      }
      if (isEdit) await api.updateTask(task.id, payload)
      else        await api.createTask(payload)
      onSaved()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const Field = ({ label, children }) => (
    <div>
      <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">{label}</label>
      {children}
    </div>
  )

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-300 bg-white placeholder-gray-300 transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Editar tarea' : 'Nueva Tarea'}</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">Crea una nueva tarea para dar seguimiento</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5"><X size={17} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-red-500 text-xs">
              <AlertCircle size={13} />{error}
            </div>
          )}

          <Field label="Título *">
            <input value={form.title} onChange={e => set('title', e.target.value)} autoFocus
              placeholder="Ej: Llamar para seguimiento"
              className={inputCls} />
          </Field>

          <Field label="Descripción">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Detalles adicionales sobre la tarea..." rows={2}
              className={inputCls + ' resize-none'} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Prioridad">
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Fecha de Vencimiento">
            <div className="flex gap-2 items-center">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-300" />
              <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)}
                placeholder="--:--"
                className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-indigo-300" />
              <button onClick={useNow} title="Usar hora actual"
                className="shrink-0 px-2.5 py-2.5 rounded-xl border border-gray-200 text-[11px] text-gray-500 hover:border-indigo-300 hover:text-indigo-500 transition-colors whitespace-nowrap">
                <Clock size={14} />
              </button>
            </div>
            {(dueDate || dueTime) && (
              <button onClick={() => { setDueDate(''); setDueTime('') }} className="text-[11px] text-gray-400 hover:text-red-400 mt-1 transition-colors">
                Quitar fecha
              </button>
            )}
          </Field>

          <Field label="Asignado a">
            <select value={form.assignee_id} onChange={e => {
              const ag = agents.find(a => (a.id || a._id) === e.target.value)
              set('assignee_id', e.target.value)
              set('assignee_name', ag ? (ag.name || `${ag.firstname || ''} ${ag.lastname || ''}`.trim() || ag.email) : '')
            }} className={inputCls}>
              <option value="">Sin asignar</option>
              {agents.map(a => (
                <option key={a.id || a._id} value={a.id || a._id}>
                  {a.name || `${a.firstname || ''} ${a.lastname || ''}`.trim() || a.email}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Contacto (opcional)">
            <ContactSearch projectId={projectId} value={contact} onChange={setContact} />
          </Field>

          <Field label="Oportunidad">
            <select value={form.funnel_id} onChange={e => {
              const f = funnels.find(f => f.id === e.target.value)
              set('funnel_id', e.target.value)
              set('funnel_name', f?.name || '')
            }} className={inputCls}>
              <option value="">Sin oportunidad</option>
              {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-colors font-medium">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm shadow-indigo-200">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {isEdit ? 'Guardar cambios' : 'Crear Tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onEdit, onDelete }) {
  const p   = PRIORITY[task.priority] || PRIORITY.normal
  const due = dueDateStatus(task.due_date)
  const done = task.status === 'done'

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 group hover:bg-gray-50/60 transition-colors ${done ? 'opacity-55' : ''}`}>
      <button onClick={() => onToggle(task)} className="mt-0.5 shrink-0 transition-colors">
        {done
          ? <CheckCircle2 size={18} className="text-indigo-400" />
          : <Circle size={18} className="text-gray-300 hover:text-indigo-400" />}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
        <p className={`text-[13.5px] font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-[12px] text-gray-400 mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${p.bg} ${p.color}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.dot }} />
            {p.label}
          </span>
          {due && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${due.cls}`}>
              <Clock size={9} />{due.label}
            </span>
          )}
          {task.assignee_name && (
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
              <User size={9} />{task.assignee_name}
            </span>
          )}
          {task.lead_name && (
            <span className="text-[10px] text-gray-300">· {task.lead_name}</span>
          )}
        </div>
      </div>

      <button onClick={() => onDelete(task.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all mt-0.5 shrink-0">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { project } = useAuth()
  const projectId = project?._id || project?.id

  const [tasks,   setTasks]   = useState([])
  const [members, setMembers] = useState([])
  const [funnels, setFunnels] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)

  const [q,          setQ]          = useState('')
  const [filterDate, setFilterDate] = useState('all')
  const [filterPrio, setFilterPrio] = useState('all')
  const [filterUser, setFilterUser] = useState('all')

  const load = useCallback(async () => {
    const [t, m, f] = await Promise.allSettled([
      api.getTasks(),
      api.getWorkspaceMembers(),
      api.getFunnels(),
    ])
    if (t.status === 'fulfilled') setTasks(Array.isArray(t.value) ? t.value : [])
    if (m.status === 'fulfilled') setMembers(Array.isArray(m.value) ? m.value : [])
    if (f.status === 'fulfilled') setFunnels(Array.isArray(f.value) ? f.value : [])
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleToggle(task) {
    const updated = await api.updateTask(task.id, { status: task.status === 'done' ? 'pending' : 'done' })
    setTasks(ts => ts.map(t => t.id === task.id ? updated : t))
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta tarea?')) return
    await api.deleteTask(id)
    setTasks(ts => ts.filter(t => t.id !== id))
  }

  // Stats
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const todayTs  = Math.floor(now.getTime() / 1000)
  const todayEnd = todayTs + 86399
  const pending    = tasks.filter(t => t.status !== 'done')
  const statToday   = pending.filter(t => t.due_date >= todayTs && t.due_date <= todayEnd).length
  const statOverdue = pending.filter(t => t.due_date && t.due_date < todayTs).length
  const statPlanned = pending.filter(t => t.due_date && t.due_date > todayEnd).length

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false
      if (filterPrio !== 'all' && t.priority !== filterPrio) return false
      if (filterUser !== 'all' && t.assignee_id !== filterUser) return false
      if (filterDate === 'today')   return t.due_date >= todayTs && t.due_date <= todayEnd
      if (filterDate === 'overdue') return t.status !== 'done' && t.due_date && t.due_date < todayTs
      if (filterDate === 'planned') return t.due_date && t.due_date > todayEnd
      return true
    })
  }, [tasks, q, filterDate, filterPrio, filterUser, todayTs, todayEnd])

  const grouped = useMemo(() => ({
    pending: filtered.filter(t => t.status !== 'done' && t.status !== 'in_progress'),
    in_progress: filtered.filter(t => t.status === 'in_progress'),
    done:    filtered.filter(t => t.status === 'done'),
  }), [filtered])

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-6 py-5 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tareas</h1>
            <p className="text-xs text-gray-400 mt-0.5">Gestioná y realizá seguimiento de tus tareas</p>
          </div>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors shadow-sm shadow-indigo-200">
            <Plus size={15} /> Nueva tarea
          </button>
        </div>

        {/* Stats clickeables */}
        <div className="flex items-center gap-6 flex-wrap">
          {[
            { key: 'today',   icon: Clock,         count: statToday,   label: 'Para hoy',    active: 'text-orange-500', badge: 'text-orange-600' },
            { key: 'overdue', icon: AlertCircle,   count: statOverdue, label: 'Vencidas',    active: 'text-red-500',    badge: statOverdue > 0 ? 'text-red-500' : 'text-gray-800' },
            { key: 'planned', icon: Calendar,      count: statPlanned, label: 'Planificadas',active: 'text-indigo-500', badge: 'text-indigo-600' },
          ].map(s => {
            const Icon = s.icon
            const isActive = filterDate === s.key
            return (
              <button key={s.key} onClick={() => setFilterDate(isActive ? 'all' : s.key)}
                className={`flex items-center gap-1.5 text-sm transition-colors ${isActive ? s.active + ' font-semibold' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon size={14} />
                <span>{s.label}:</span>
                <span className={`font-bold ${isActive ? s.active : s.badge}`}>{s.count}</span>
              </button>
            )
          })}
          {filterDate !== 'all' && (
            <button onClick={() => setFilterDate('all')} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
              <X size={11} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2 flex-1 min-w-[180px]">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tareas…"
            className="flex-1 bg-transparent text-[13px] text-gray-700 outline-none placeholder-gray-400 min-w-0" />
          {q && <button onClick={() => setQ('')} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>}
        </div>

        <Select value={filterPrio} onChange={setFilterPrio} icon={<Flag size={13} />}
          options={[{ value: 'all', label: 'Todas las Prioridades' }, ...Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label }))]} />

        <Select value={filterUser} onChange={setFilterUser} icon={<User size={13} />}
          options={[{ value: 'all', label: 'Todos los Vendedores' }, ...members.map(m => ({ value: m.id, label: m.name || m.email }))]} />
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <CheckSquare size={32} className="text-gray-200" />
            <p className="text-sm text-gray-400">No hay tareas</p>
            <button onClick={() => setModal('new')} className="text-xs text-indigo-500 hover:text-indigo-600 font-medium">
              + Crear primera tarea
            </button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
            {[
              { key: 'pending',     label: 'Pendientes',    icon: <Circle size={13} className="text-gray-300" /> },
              { key: 'in_progress', label: 'En progreso',   icon: <Clock size={13} className="text-blue-400" /> },
              { key: 'done',        label: 'Completadas',   icon: <CheckCircle2 size={13} className="text-indigo-400" /> },
            ].map(({ key, label, icon }) => grouped[key].length > 0 && (
              <div key={key} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                  {icon}
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label} ({grouped[key].length})</span>
                </div>
                {grouped[key].map(t => (
                  <TaskCard key={t.id} task={t} onToggle={handleToggle} onEdit={t => setModal(t)} onDelete={handleDelete} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <TaskModal
          task={modal === 'new' ? null : modal}
          agents={members}
          funnels={funnels}
          projectId={projectId}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }} />
      )}
    </div>
  )
}
