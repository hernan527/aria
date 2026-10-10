import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import { MetricCard } from '../components/ui/MetricCard'
import {
  Megaphone, Plus, X, ChevronLeft, ChevronRight, Check, Sparkles, Zap,
  Play, Pause, Square, Trash2, Pencil, Users, Send, MessageCircle,
  Percent, Snowflake, Loader2, RefreshCw, Wand2, Clock, Calendar,
  Bot, UserCheck, Info, AlertCircle, RotateCcw, Undo2, ShoppingBag, Rocket,
  FileText, CalendarCheck, FolderOpen, PenLine, Repeat, Search, Filter,
  Smartphone, MessagesSquare, Gauge, SlidersHorizontal, AlertTriangle,
  Heart, Briefcase, Target, PartyPopper, Paperclip, FileType2, LayoutTemplate, Shuffle,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── Constantes ────────────────────────────────────────────────────────────────
const STATUS = {
  draft:     { label: 'Borrador',   plural: 'Borradores',  variant: 'default' },
  scheduled: { label: 'Programada', plural: 'Programadas', variant: 'info' },
  active:    { label: 'Activa',     plural: 'Activas',     variant: 'success' },
  paused:    { label: 'Pausada',    plural: 'Pausadas',    variant: 'warning' },
  finished:  { label: 'Finalizada', plural: 'Finalizadas', variant: 'primary' },
}

const RECIPIENT_STATUS = {
  pending: { label: 'Pendiente', variant: 'default' },
  sending: { label: 'Enviando',  variant: 'info' },
  sent:    { label: 'Enviado',   variant: 'info' },
  replied: { label: 'Respondió', variant: 'success' },
  failed:  { label: 'Falló',     variant: 'danger' },
  skipped: { label: 'Omitido',   variant: 'warning' },
}

const TEMPERATURES = [
  { key: 'frio',          label: 'Frío',          hint: 'Lucas los calificó con poca intención' },
  { key: 'tibio',         label: 'Tibio',         hint: 'Mostraron algo de interés' },
  { key: 'caliente',      label: 'Caliente',      hint: 'Alta intención, pero se cortó' },
  { key: 'sin_calificar', label: 'Sin calificar', hint: 'Lucas todavía no los evaluó' },
]

const ALL_TEMPS = ['frio', 'tibio', 'caliente', 'sin_calificar']

// Estrategia comercial: define la audiencia base (la aplica el backend), qué filtros se
// muestran y los valores iniciales. La instrucción para la IA vive en el backend.
const STRATEGIES = [
  { key: 'reactivar', icon: RotateCcw, title: 'Reactivar conversaciones',
    desc: 'Contactos con historial que dejaron de responder',
    base: 'Contactos que ya conversaron con tu negocio (sin ventas cerradas)',
    filters: ['temperature', 'inactive', 'tags'], temperatures: ['frio', 'tibio', 'sin_calificar'], inactive_days: 7,
    objective: 'Retomar la conversación donde quedó y ver si sigue interesado' },
  { key: 'recuperar', icon: Undo2, title: 'Recuperar oportunidades',
    desc: 'Oportunidades marcadas como perdidas que valen otro intento',
    base: 'Oportunidades perdidas o descartadas en el embudo',
    filters: ['inactive', 'tags'], temperatures: ALL_TEMPS, inactive_days: 15,
    objective: 'Volver a intentar con una propuesta o condición nueva' },
  { key: 'venta_cruzada', icon: ShoppingBag, title: 'Venta cruzada',
    desc: 'Clientes actuales que podrían sumar otro servicio o producto',
    base: 'Clientes actuales (ventas ganadas en el embudo)',
    filters: ['inactive', 'tags'], temperatures: ALL_TEMPS, inactive_days: 30,
    objective: 'Ofrecer un servicio o producto complementario a lo que ya tiene' },
  { key: 'presentar_producto', icon: Rocket, title: 'Presentar producto',
    desc: 'Dar a conocer un producto o servicio nuevo a contactos existentes',
    base: 'Todos tus contactos (excepto oportunidades perdidas)',
    filters: ['temperature', 'inactive', 'tags'], temperatures: ALL_TEMPS, inactive_days: 0,
    objective: 'Presentar un producto o servicio nuevo' },
  { key: 'recordar_cotizacion', icon: FileText, title: 'Recordar cotización',
    desc: 'Cotizaciones enviadas que quedaron sin respuesta o definición',
    base: 'Oportunidades en etapa Propuesta o Negociación',
    filters: ['inactive', 'tags'], temperatures: ALL_TEMPS, inactive_days: 3,
    objective: 'Recordar la cotización enviada y ofrecer resolver dudas para avanzar' },
  { key: 'agendar_reunion', icon: CalendarCheck, title: 'Agendar una reunión',
    desc: 'Coordina llamadas o citas comerciales con tus contactos',
    base: 'Oportunidades abiertas y contactos con conversación previa',
    filters: ['temperature', 'inactive', 'tags'], temperatures: ['tibio', 'caliente', 'sin_calificar'], inactive_days: 3,
    objective: 'Coordinar una llamada o reunión breve' },
  { key: 'solicitar_documentacion', icon: FolderOpen, title: 'Solicitar documentación',
    desc: 'Pide información o documentos pendientes a clientes',
    base: 'Clientes y oportunidades activas (filtrá por etiqueta a quién le falta)',
    filters: ['tags', 'inactive'], temperatures: ALL_TEMPS, inactive_days: 0,
    objective: 'Pedir la documentación o información pendiente' },
  { key: 'personalizado', icon: PenLine, title: 'Objetivo personalizado',
    desc: 'Define tu propio objetivo desde cero',
    base: 'Todos tus contactos',
    filters: ['temperature', 'inactive', 'tags'], temperatures: ALL_TEMPS, inactive_days: 0,
    objective: '' },
]
const strategyOf = key => STRATEGIES.find(s => s.key === key)

const INACTIVE_OPTIONS = [0, 3, 7, 15, 30, 60, 90]

// days: valores de Date.getDay() (0 = domingo) que se preseleccionan al elegir la frecuencia.
const RECURRENCES = [
  { key: 'daily',   label: 'Diaria',  days: [1, 2, 3, 4, 5] },
  { key: 'weekly',  label: 'Semanal', days: [1] },
  { key: 'monthly', label: 'Mensual', days: [1] },
]
const recurrenceLabel = key => RECURRENCES.find(r => r.key === key)?.label
const WEEKDAYS = [
  { day: 1, letter: 'L', name: 'Lunes' }, { day: 2, letter: 'M', name: 'Martes' },
  { day: 3, letter: 'X', name: 'Miércoles' }, { day: 4, letter: 'J', name: 'Jueves' },
  { day: 5, letter: 'V', name: 'Viernes' }, { day: 6, letter: 'S', name: 'Sábado' },
  { day: 0, letter: 'D', name: 'Domingo' },
]
// Ritmo de goteo: mensajes cada 30 minutos. Rápido y Personalizada todavía no están habilitados.
const PACES = [
  { key: 'conservador', title: 'Conservador', recommended: true, perHalfHour: 15,
    desc: 'Ideal para números nuevos o poco usados.' },
  { key: 'equilibrado', title: 'Equilibrado', perHalfHour: 40,
    desc: 'Buen ritmo para números con historial.' },
  { key: 'rapido', title: 'Rápido', perHalfHour: 100, disabled: true,
    desc: 'Mayor velocidad, mayor riesgo de bloqueo.' },
  { key: 'personalizado', title: 'Personalizada', disabled: true,
    desc: 'Define tus propios lotes y frecuencia.' },
]
const paceOf = key => PACES.find(p => p.key === key) || PACES[0]

const TONES = [
  { key: 'cercano',     label: 'Cercano',     icon: Heart },
  { key: 'profesional', label: 'Profesional', icon: Briefcase },
  { key: 'directo',     label: 'Directo',     icon: Target },
  { key: 'entusiasta',  label: 'Entusiasta',  icon: PartyPopper },
]
const LENGTHS = [
  { key: 'breve',     label: 'Breve',     desc: '1 línea' },
  { key: 'medio',     label: 'Medio',     desc: '2-3 líneas' },
  { key: 'detallado', label: 'Detallado', desc: '4+ líneas' },
]
const TEMPLATE_VARS = ['nombre', 'nombre_pila', 'apellido', 'teléfono', 'email', 'notas']
const DEFAULT_TEMPLATE = 'Hola {{nombre}} 👋 Notamos que hace un tiempo no conversamos. Tenemos novedades que creemos te van a interesar. ¿Te gustaría que te contemos más?'
const ATTACHMENT_LIMITS = { 'image/jpeg': 5, 'image/png': 5, 'application/pdf': 50 }  // MB

const OBJECTIVE_SUGGESTIONS = [
  'Retomar la conversación y ver si sigue interesado',
  'Ofrecer una promoción por tiempo limitado',
  'Invitar a agendar una llamada o visita',
  'Avisar que hay novedades o stock nuevo',
]

const STEPS = [
  { key: 'general',  title: 'Información general' },
  { key: 'schedule', title: 'Programación' },
  { key: 'audience', title: 'Audiencia' },
  { key: 'filters',  title: 'Vista previa' },
  { key: 'pace',     title: 'Línea y ritmo' },
  { key: 'message',  title: 'Mensaje' },
  { key: 'msgpreview', title: 'Vista previa del mensaje' },
  { key: 'reply',    title: 'Respuesta' },
  { key: 'review',   title: 'Revisá y lanzá' },
]
const stepIndex = key => STEPS.findIndex(s => s.key === key)

const DEFAULT_FORM = {
  name: '',
  description: '',
  strategy: '',
  channel_mode: 'last',
  channel_instance_id: '',
  temperatures: [],
  inactive_days: 0,
  rules: [],
  manual_contacts: [],   // [{ id, name, phone }] — agregados a mano, por fuera del filtro
  tags: [],
  max_recipients: 200,
  objective: '',
  guidelines: '',
  message_mode: 'ai',
  tone: 'cercano',
  length: 'medio',
  template: DEFAULT_TEMPLATE,
  attachment: null,   // { id, filename, mimetype, size }
  pace: 'conservador',
  send_days: [1, 2, 3, 4, 5],
  interval_minutes: 3,
  daily_limit: 1000,   // el ritmo de goteo es el que limita; sin tope diario extra
  on_reply: 'seller',
  ai_screening: false,
  launch: 'now',
  schedule_date: '',
  schedule_time: '',
  recurrence: 'daily',
  recurrence_time: '09:30',
  recurrence_days: [1, 2, 3, 4, 5],
  recurrence_until: '',
  hours_start: '09:00',
  hours_end: '20:00',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function toDateInput(ts) {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function toTimeInput(ts) {
  const d = new Date(ts * 1000)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
// Fecha + hora del formulario (hora local del navegador) → epoch en segundos
function toEpoch(date, time = '00:00') {
  if (!date) return null
  return Math.floor(new Date(`${date}T${time || '00:00'}`).getTime() / 1000)
}

function formFromCampaign(c) {
  if (!c) return { ...DEFAULT_FORM }
  const a = c.audience || {}
  return {
    ...DEFAULT_FORM,
    name: c.name || '',
    description: c.description || '',
    strategy: c.strategy || 'reactivar',
    channel_mode: c.channel_mode || 'specific',
    channel_instance_id: c.channel_instance_id || '',
    temperatures: a.temperatures || [],
    inactive_days: a.inactive_days ?? 0,
    rules: Array.isArray(a.rules) ? a.rules : [],
    manual_contacts: Array.isArray(a.manual_contacts_meta) ? a.manual_contacts_meta : [],
    tags: a.tags || [],
    max_recipients: a.max_recipients ?? 200,
    objective: c.objective || '',
    guidelines: c.guidelines || '',
    message_mode: c.message_mode || 'ai',
    tone: c.tone || 'cercano',
    length: c.length || 'medio',
    template: c.template || '',
    attachment: c.attachment || null,
    pace: c.pace || 'conservador',
    send_days: Array.isArray(c.send_days) ? c.send_days : [0, 1, 2, 3, 4, 5, 6],
    interval_minutes: c.interval_minutes || 3,
    daily_limit: c.daily_limit || 1000,
    on_reply: c.on_reply === 'human' ? 'seller' : (c.on_reply || 'agent'),
    ai_screening: !!c.ai_screening,
    launch: c.recurrence ? 'recurring' : c.status === 'scheduled' ? 'schedule' : 'now',
    schedule_date: !c.recurrence && c.scheduled_at ? toDateInput(c.scheduled_at) : '',
    schedule_time: !c.recurrence && c.scheduled_at ? toTimeInput(c.scheduled_at) : '',
    recurrence: c.recurrence || 'daily',
    recurrence_time: c.recurrence_time || '09:30',
    recurrence_days: Array.isArray(c.recurrence_days) && c.recurrence_days.length ? c.recurrence_days : [1, 2, 3, 4, 5],
    recurrence_until: c.recurrence_until ? toDateInput(c.recurrence_until) : '',
    hours_start: c.hours_start || '09:00',
    hours_end: c.hours_end || '20:00',
  }
}

function audienceFromForm(f) {
  return {
    temperatures: f.temperatures,
    inactive_days: Number(f.inactive_days),
    rules: f.rules.filter(r => r.value !== '' && r.value != null),
    manual_contacts: f.manual_contacts.map(c => c.id),
    manual_contacts_meta: f.manual_contacts,
    tags: f.tags,
    max_recipients: Number(f.max_recipients),
  }
}

function payloadFromForm(f) {
  return {
    name: f.name,
    description: f.description,
    strategy: f.strategy || 'reactivar',
    channel_mode: f.channel_mode,
    channel_instance_id: f.channel_mode === 'specific' ? (f.channel_instance_id || null) : null,
    pace: f.pace,
    send_days: f.send_days,
    audience: audienceFromForm(f),
    objective: f.objective,
    guidelines: f.guidelines,
    message_mode: f.message_mode,
    tone: f.tone,
    length: f.length,
    template: f.template,
    attachment: f.attachment ? { id: f.attachment.id } : null,
    interval_minutes: Number(f.interval_minutes),
    daily_limit: Number(f.daily_limit),
    on_reply: f.on_reply,
    ai_screening: !!f.ai_screening,
    hours_start: f.hours_start,
    hours_end: f.hours_end,
    scheduled_at: f.launch === 'schedule' ? toEpoch(f.schedule_date, f.schedule_time) : null,
    recurrence: f.launch === 'recurring' ? f.recurrence : null,
    recurrence_time: f.recurrence_time,
    recurrence_days: f.recurrence_days,
    // "Finaliza el" incluye ese día completo
    recurrence_until: f.launch === 'recurring' && f.recurrence_until ? toEpoch(f.recurrence_until, '23:59') + 59 : null,
  }
}

// Al elegir estrategia se cargan sus valores iniciales; el objetivo solo se pisa si el
// usuario no lo escribió (vacío o igual al sugerido por la estrategia anterior).
function applyStrategy(form, key) {
  const st = strategyOf(key)
  const prev = strategyOf(form.strategy)
  const keepObjective = form.objective.trim() && form.objective !== prev?.objective
  return {
    strategy: key,
    rules: form.rules?.length || !st.inactive_days
      ? (form.rules || [])
      : [{ field: 'last_interaction', op: 'more', value: st.inactive_days }],
    objective: keepObjective ? form.objective : st.objective,
  }
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function rate(replied, sent) {
  return sent ? `${Math.round((replied / sent) * 1000) / 10}%` : '—'
}

// Duración estimada: envíos limitados por intervalo, ventana horaria y tope diario.
function estimateDuration(count, f) {
  if (!count) return null
  const [sh, sm] = f.hours_start.split(':').map(Number)
  const [eh, em] = f.hours_end.split(':').map(Number)
  const windowMin = Math.max((eh * 60 + em) - (sh * 60 + sm), 1)
  const minutesEach = 30 / paceOf(f.pace).perHalfHour
  const perDay = Math.max(Math.min(Math.floor(windowMin / minutesEach), Number(f.daily_limit)), 1)
  const days = Math.ceil(count / perDay)
  if (days <= 1) {
    const mins = Math.ceil(count * minutesEach)
    return mins < 60 ? `≈ ${mins} min` : `≈ ${Math.round(mins / 6) / 10} h`
  }
  return `≈ ${days} días (${perDay} por día)`
}

// ── UI base ───────────────────────────────────────────────────────────────────
function Modal({ children, onClose, wide }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        onMouseDown={e => e.stopPropagation()}
        className={cn('w-full bg-surface-50 border border-white/10 rounded-2xl shadow-2xl animate-slide-in flex flex-col max-h-[92vh]', wide ? 'max-w-3xl' : 'max-w-xl')}
      >
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/5">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/5" aria-label="Cerrar">
        <X size={18} />
      </button>
    </div>
  )
}

function Field({ label, hint, children, required }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">
        {label}{required && <span className="text-aria-400"> *</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-aria-500/60 transition-colors'

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors inline-flex items-center',
        active ? 'bg-aria-500/20 border-aria-500/50 text-aria-200' : 'bg-white/5 border-white/10 text-white/50 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

function OptionCard({ active, onClick, icon: Icon, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-xl border transition-all flex gap-3',
        active ? 'bg-aria-500/10 border-aria-500/50' : 'bg-white/[0.03] border-white/10 hover:border-white/20',
      )}
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', active ? 'bg-aria-500/20 text-aria-300' : 'bg-white/5 text-white/40')}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-white/45 mt-0.5">{desc}</p>
      </div>
      {active && <Check size={16} className="ml-auto text-aria-400 shrink-0" />}
    </button>
  )
}

// ── Audiencia en vivo ─────────────────────────────────────────────────────────
function useAudiencePreview(form) {
  const [state, setState] = useState({ loading: false, count: null, sample: [] })
  const key = JSON.stringify({ audience: audienceFromForm(form), strategy: form.strategy || 'reactivar' })
  useEffect(() => {
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    const t = setTimeout(async () => {
      try {
        const { audience, strategy } = JSON.parse(key)
        const d = await api.previewCampaignAudience(audience, strategy)
        if (!cancelled) setState({ loading: false, count: d.count, filterCount: d.filter_count ?? d.count, manualCount: d.manual_count ?? 0, filterIds: d.filter_ids || [], sample: d.sample || [] })
      } catch {
        if (!cancelled) setState({ loading: false, count: null, sample: [] })
      }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [key])
  return state
}

function AudienceCount({ preview }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-aria-500/10 border border-aria-500/20 text-sm">
      <Users size={15} className="text-aria-300" />
      {preview.loading
        ? <span className="text-white/50 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Calculando audiencia…</span>
        : preview.count == null
          ? <span className="text-white/50">No se pudo calcular la audiencia</span>
          : <span className="text-white"><b>{preview.count}</b> <span className="text-white/50">contactos cumplen los criterios</span></span>}
    </div>
  )
}

// ── Pasos del asistente ───────────────────────────────────────────────────────
function StepGeneral({ form, set }) {
  return (
    <div className="space-y-4">
      <Field label="Nombre de la campaña" required>
        <input autoFocus className={inputCls} value={form.name} maxLength={120}
          onChange={e => set({ name: e.target.value })} placeholder="Ej: Reactivación, oportunidades perdidas, Q3" />
      </Field>
      <Field label="Descripción (Opcional)">
        <textarea rows={3} className={inputCls} value={form.description} maxLength={2000}
          onChange={e => set({ description: e.target.value })}
          placeholder="Describí brevemente el objetivo de esta campaña" />
      </Field>
      <div className="pt-2">
        <p className="text-sm font-semibold text-white">Estrategia comercial <span className="text-aria-400">*</span></p>
        <p className="text-xs text-white/45 mt-0.5 mb-3">
          La estrategia representa la intención comercial de la campaña. Define la audiencia base, los filtros disponibles y especializa la generación del mensaje con IA.
        </p>
        <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STRATEGIES.map(st => (
            <OptionCard key={st.key} active={form.strategy === st.key}
              onClick={() => set(applyStrategy(form, st.key))}
              icon={st.icon} title={st.title} desc={st.desc} />
          ))}
          {form.strategy === 'personalizado' && (
            <div className="sm:col-span-2 p-4 rounded-xl border border-aria-500/30 bg-aria-500/5">
              <Field label="Escribí tu objetivo" required
                hint="Este texto queda como objetivo de la campaña y orienta la generación del mensaje con IA.">
                <textarea autoFocus rows={2} className={inputCls} value={form.objective} maxLength={2000}
                  onChange={e => set({ objective: e.target.value })}
                  placeholder="Ej: invitar a la demo del módulo de facturación" />
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const RULE_FIELDS = {
  last_interaction: { label: 'Última interacción', ops: [['more', 'hace más de (días)'], ['less', 'hace menos de (días)']] },
  opp_status:       { label: 'Estado de la oportunidad', ops: [['is', 'es'], ['is_not', 'no es']] },
  opp_stage:        { label: 'Etapa de la oportunidad', ops: [['is', 'es'], ['is_not', 'no es']] },
  tag:              { label: 'Tag', ops: [['has', 'tiene'], ['has_not', 'no tiene']] },
}
const OPP_STATUSES = [['open', 'Abierta'], ['won', 'Ganada'], ['lost', 'Perdida'], ['none', 'Sin oportunidad']]

function newRule(field, { stages, labels }) {
  const value = field === 'last_interaction' ? 30
    : field === 'opp_status' ? 'open'
    : field === 'opp_stage' ? (stages[0]?.id || '')
    : (labels[0]?.title || '')
  return { field, op: RULE_FIELDS[field].ops[0][0], value, join: 'and' }
}

const selectSm = 'bg-surface border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-aria-500/60'

function RuleBuilder({ rules, onChange, stages, labels }) {
  const update = (i, patch) => onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const remove = i => onChange(rules.filter((_, k) => k !== i))
  const valueOptions = field => field === 'opp_status' ? OPP_STATUSES
    : field === 'opp_stage' ? stages.map(st => [st.id, st.label])
    : labels.map(l => [l.title, l.title])
  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="space-y-2">
          {i > 0 && (
            <select aria-label="Condición entre filtros" className={cn(selectSm, 'w-16 font-semibold')} value={r.join}
              onChange={e => update(i, { join: e.target.value })}>
              <option value="and">Y</option>
              <option value="or">O</option>
            </select>
          )}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-white/10 bg-white/[0.02]">
            <select aria-label="Campo" className={cn(selectSm, 'flex-1 min-w-[150px]')} value={r.field}
              onChange={e => update(i, { ...newRule(e.target.value, { stages, labels }), join: r.join })}>
              {Object.entries(RULE_FIELDS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
            <select aria-label="Operador" className={cn(selectSm, 'min-w-[140px]')} value={r.op}
              onChange={e => update(i, { op: e.target.value })}>
              {RULE_FIELDS[r.field].ops.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            {r.field === 'last_interaction' ? (
              <input aria-label="Días" type="number" min={0} className={cn(selectSm, 'w-20')} value={r.value}
                onChange={e => update(i, { value: e.target.value === '' ? '' : Number(e.target.value) })} />
            ) : (
              <select aria-label="Valor" className={cn(selectSm, 'flex-1 min-w-[120px]')} value={r.value}
                onChange={e => update(i, { value: e.target.value })}>
                {valueOptions(r.field).length === 0 && <option value="">{r.field === 'tag' ? 'Sin tags creados' : 'Sin etapas'}</option>}
                {valueOptions(r.field).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            )}
            <button type="button" onClick={() => remove(i)} aria-label="Eliminar filtro"
              className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rules, newRule('last_interaction', { stages, labels })])}
        className="flex items-center gap-1.5 text-xs font-medium text-aria-300 hover:text-aria-200 px-1 py-1">
        <Plus size={13} /> Agregar filtro
      </button>
    </div>
  )
}

function StepAudience({ form, set, preview, labels, stages }) {
  const st = strategyOf(form.strategy) || STRATEGIES[0]
  const [picking, setPicking] = useState(false)
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Filtrá tu base de contactos</p>
        <p className="text-xs text-white/45 mt-0.5">
          Definí condiciones para acotar a quién alcanzar. Al ejecutar, Tobías busca sobre tus contactos y te muestra el universo resultante.
        </p>
      </div>
      {/* Estrategia elegida en el paso 1 — se puede cambiar acá mismo */}
      <button type="button" onClick={() => setPicking(p => !p)} aria-expanded={picking}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-aria-500/40 text-left transition-colors group">
        <RefreshCw size={15} className="text-aria-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white">Objetivo: <b>{st.title}</b></p>
          <p className="text-[11px] text-white/40 truncate">{st.base}</p>
        </div>
        <span className="text-xs font-medium text-aria-300 group-hover:text-aria-200 shrink-0">{picking ? 'Cerrar' : 'Cambiar'}</span>
      </button>
      {picking && (
        <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STRATEGIES.map(s => (
            <OptionCard key={s.key} active={form.strategy === s.key}
              onClick={() => { set(applyStrategy(form, s.key)); if (s.key !== 'personalizado') setPicking(false) }}
              icon={s.icon} title={s.title} desc={s.desc} />
          ))}
          {form.strategy === 'personalizado' && (
            <div className="sm:col-span-2 p-4 rounded-xl border border-aria-500/30 bg-aria-500/5">
              <Field label="Escribí tu objetivo" required
                hint="Este texto queda como objetivo de la campaña y orienta la generación del mensaje con IA.">
                <textarea autoFocus rows={2} className={inputCls} value={form.objective} maxLength={2000}
                  onChange={e => set({ objective: e.target.value })}
                  placeholder="Ej: invitar a la demo del módulo de facturación" />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="pt-1">
        <p className="text-sm font-semibold text-white">Filtros <span className="text-white/35 font-normal">(opcional)</span></p>
        <p className="text-xs text-white/45 mt-0.5 mb-3">
          Condiciones sobre tus contactos (conversaciones, estado de la oportunidad, tags, última interacción…). Sin filtros, se considera toda tu base elegible.
        </p>
        <RuleBuilder rules={form.rules} onChange={rules => set({ rules })} stages={stages} labels={labels} />
      </div>

      <AudienceSearch form={form} />
      <p className="text-[11px] text-white/35 flex gap-1.5">
        <Info size={12} className="shrink-0 mt-0.5" />
        Se excluyen automáticamente: contactos con una conversación abierta, contactos de prueba y quienes recibieron otra campaña en los últimos 7 días.
      </p>
    </div>
  )
}

// "Al ejecutar, Tobías busca sobre tus contactos": la búsqueda corre al tocar el botón y el
// resultado se descarta si después se cambian los filtros o la estrategia.
function AudienceSearch({ form }) {
  const key = JSON.stringify({ a: audienceFromForm(form), s: form.strategy })
  const [result, setResult] = useState(null)   // { key, count } | { key, error }
  const [loading, setLoading] = useState(false)
  async function search() {
    setLoading(true)
    try {
      const d = await api.previewCampaignAudience(audienceFromForm(form), form.strategy || 'reactivar')
      setResult({ key, count: d.count })
    } catch (e) { setResult({ key, error: e.message }) }
    setLoading(false)
  }
  const current = result?.key === key ? result : null
  return (
    <div className="space-y-2">
      <button type="button" onClick={search} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-aria-500/40 bg-aria-500/10 hover:bg-aria-500/20 text-sm font-medium text-aria-200 transition-colors disabled:opacity-60">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        Buscar contactos
      </button>
      {current && (current.error
        ? <p className="text-xs text-red-300">{current.error}</p>
        : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-300">
            <Check size={15} className="shrink-0" />
            <span>Se encontraron <b>{current.count}</b> contacto{current.count === 1 ? '' : 's'}. Continuá para revisarlos o depurarlos con IA.</span>
          </div>
        ))}
    </div>
  )
}

// Contactos puntuales que se suman por fuera del filtro: lista de toda la base (incluidos los que
// el filtro dejó afuera) con casillas; los que ya entran por el filtro se marcan y no se tildan.
function ManualContacts({ value, onChange, filterIds = [] }) {
  const [all, setAll] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    let alive = true
    api.getContacts(null, { limit: 1000 })
      .then(d => alive && setAll((Array.isArray(d) ? d : []).filter(c => c.phone)))
      .catch(() => alive && setAll([]))
    return () => { alive = false }
  }, [])
  const selected = new Set(value.map(c => c.id))
  const inFilter = new Set(filterIds)
  const toggle = c => onChange(selected.has(c.id)
    ? value.filter(x => x.id !== c.id)
    : [...value, { id: c.id, name: c.name, phone: c.phone }])
  const needle = q.trim().toLowerCase()
  const list = (all || []).filter(c => !needle ||
    [c.name, c.phone, c.company].some(v => (v || '').toLowerCase().includes(needle)))
  return (
    <div>
      <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">Agregar a mano</p>
      <p className="text-xs text-white/45 mt-0.5 mb-2">Sumá contactos puntuales por fuera del filtro.</p>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
          <Search size={14} className="text-white/30 shrink-0" />
          <input className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-white/25 outline-none" value={q}
            onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, teléfono o empresa" aria-label="Buscar contacto" />
          <span className="text-[11px] text-white/40 shrink-0">
            {value.length === 0 ? 'No hay seleccionados' : `${value.length} seleccionado${value.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
          {all == null ? (
            <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-white/40" /></div>
          ) : list.length === 0 ? (
            <p className="px-3 py-4 text-xs text-white/40 text-center">{needle ? 'Sin resultados' : 'No hay contactos con teléfono'}</p>
          ) : list.map(c => {
            const filtered = inFilter.has(c.id)
            const checked = filtered || selected.has(c.id)
            return (
              <label key={c.id} className={cn('flex items-center gap-3 px-3 py-2 text-xs', filtered ? 'opacity-60' : 'cursor-pointer hover:bg-white/[0.03]')}>
                <input type="checkbox" className="accent-[#3355ff] w-3.5 h-3.5 shrink-0" checked={checked} disabled={filtered}
                  onChange={() => toggle(c)} />
                <span className="flex-1 min-w-0 truncate text-white/85">{c.name || c.phone}</span>
                {filtered
                  ? <span className="text-[10px] text-emerald-300/80 shrink-0">En el filtro</span>
                  : <span className="text-white/35 shrink-0">{c.phone}</span>}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StepFilters({ form, set, preview, goTo }) {
  const st = strategyOf(form.strategy) || STRATEGIES[0]
  const recurring = form.launch === 'recurring'
  const count = preview.filterCount ?? preview.count ?? 0
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Resultado</p>
        <p className="text-xs text-white/45 mt-0.5">
          {preview.loading ? 'Buscando contactos…' : <>Hoy tu filtro devolvió <b className="text-white/70">{count}</b> contacto{count === 1 ? '' : 's'}.</>}
          {recurring
            ? ' La serie vuelve a correr este filtro en cada corrida, así que esta lista es solo una vista previa.'
            : ' La lista final se arma al lanzar la campaña.'}
        </p>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="w-11 h-11 rounded-xl bg-aria-500/15 flex items-center justify-center shrink-0">
          <Users size={20} className="text-aria-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-bold text-white leading-none">
            {preview.loading ? <Loader2 size={22} className="animate-spin text-white/50" /> : count}
          </p>
          <p className="text-xs text-white/45 mt-1">contactos del filtro</p>
        </div>
        <button type="button" onClick={() => goTo(stepIndex('audience'))}
          className="flex items-center gap-1.5 text-xs font-medium text-white/55 hover:text-aria-300 shrink-0 px-2 py-1.5 rounded-lg hover:bg-white/5">
          <Filter size={14} /> Filtros
        </button>
      </div>
      {!preview.loading && preview.count != null && count === 0 && (
        <p className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          La búsqueda no devolvió contactos. Volvé al paso anterior y probá con otros filtros.
        </p>
      )}

      <label className="flex items-start gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02] cursor-pointer hover:border-white/20 transition-colors">
        <input type="checkbox" className="sr-only peer" checked={!!form.ai_screening}
          onChange={e => set({ ai_screening: e.target.checked })} />
        <span aria-hidden className={cn('mt-0.5 w-9 h-5 rounded-full relative shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-aria-500',
          form.ai_screening ? 'bg-aria-500' : 'bg-white/15')}>
          <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', form.ai_screening ? 'left-[18px]' : 'left-0.5')} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-white">
            <Sparkles size={14} className="text-aria-300" /> {recurring ? 'Depurar cada corrida con IA' : 'Depurar con IA'}
          </span>
          <span className="block text-xs text-white/45 mt-0.5">
            {recurring ? 'En cada corrida Tobías' : 'Tobías'} analiza los contactos que devuelva el filtro según tu objetivo {st.title} y deja solo los que valen la pena.
          </span>
        </span>
      </label>

      {preview.sample.length > 0 && (
        <div className="rounded-xl border border-white/5 divide-y divide-white/5">
          {preview.sample.map(c => (
            <div key={c.contact_id} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-white/80 truncate">{c.name || c.phone}</span>
              <span className="text-white/35 shrink-0 ml-3">{c.phone}</span>
            </div>
          ))}
          {count > preview.sample.length && (
            <p className="px-3 py-2 text-[11px] text-white/35">y {count - preview.sample.length} más…</p>
          )}
        </div>
      )}

      <ManualContacts value={form.manual_contacts} onChange={manual_contacts => set({ manual_contacts })} filterIds={preview.filterIds} />

      <Field label="Máximo de destinatarios por corrida" hint="Si el filtro devuelve más, Tobías prioriza a los que tienen mejor score. Los agregados a mano no cuentan para este máximo.">
        <input type="number" min={1} max={1000} className={inputCls} value={form.max_recipients}
          onChange={e => set({ max_recipients: e.target.value })} />
      </Field>
    </div>
  )
}

function StepGoal({ form, set }) {
  return (
    <div className="space-y-4">
      <Field label="¿Qué querés lograr con esta campaña?" required hint="Tobías lo usa para orientar cada mensaje.">
        <textarea rows={4} className={inputCls} value={form.objective} maxLength={2000}
          onChange={e => set({ objective: e.target.value })}
          placeholder="Ej: Retomar la charla con quienes pidieron cotización y ofrecer 15% off si contratan este mes" />
      </Field>
      <div className="flex flex-wrap gap-2">
        {OBJECTIVE_SUGGESTIONS.map(s => (
          <Chip key={s} active={form.objective === s} onClick={() => set({ objective: s })}>{s}</Chip>
        ))}
      </div>
    </div>
  )
}

function AttachmentField({ value, onChange }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  async function pick(file) {
    if (!file) return
    const maxMb = ATTACHMENT_LIMITS[file.type]
    if (!maxMb) return setError('Solo JPG, PNG o PDF')
    if (file.size > maxMb * 1024 * 1024) return setError(`El archivo supera ${maxMb} MB`)
    setUploading(true); setError('')
    try { onChange(await api.uploadCampaignAttachment(file)) }
    catch (e) { setError(e.message) }
    setUploading(false)
  }
  return (
    <div>
      <p className="text-xs font-medium text-white/70 mb-1.5">Adjunto (opcional)</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
        onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      {value ? (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03]">
          <FileType2 size={16} className="text-aria-300 shrink-0" />
          <span className="flex-1 min-w-0 truncate text-sm text-white/85">{value.filename}</span>
          <span className="text-[11px] text-white/35 shrink-0">{(value.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Quitar adjunto"
            className="p-1 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5"><X size={14} /></button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/15 text-sm text-white/55 hover:text-white hover:border-white/30 transition-colors disabled:opacity-60">
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          + Agregar imagen o PDF
        </button>
      )}
      <p className="text-[11px] text-white/35 mt-1">JPG o PNG hasta 5.0 MB · PDF hasta 50.0 MB. Se envía junto al mensaje.</p>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

function StepMessage({ form, set }) {
  const templateRef = useRef(null)
  const isTemplate = form.message_mode === 'template'
  // Inserta la variable donde está el cursor de la plantilla
  function insertVar(key) {
    const el = templateRef.current
    const token = `{{${key}}}`
    if (!el) return set({ template: form.template + token })
    const { selectionStart: a, selectionEnd: b } = el
    set({ template: form.template.slice(0, a) + token + form.template.slice(b) })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length) })
  }
  const modeBtn = active => cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all',
    active ? 'bg-aria-500 text-white shadow-sm' : 'text-white/50 hover:text-white')
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Configurá el mensaje</p>
        <p className="text-xs text-white/45 mt-0.5">
          Escribí una plantilla con variables o dejá que la IA lo genere a partir de unos ajustes guiados.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-surface border border-white/5">
        <button role="tab" aria-selected={!isTemplate} type="button" className={modeBtn(!isTemplate)}
          onClick={() => set({ message_mode: 'ai' })}>
          <Sparkles size={14} /> Asistido por IA
        </button>
        <button role="tab" aria-selected={isTemplate} type="button" className={modeBtn(isTemplate)}
          onClick={() => set({ message_mode: 'template' })}>
          <LayoutTemplate size={14} /> Plantilla
        </button>
      </div>

      {!isTemplate ? (
        <>
          <div>
            <p className="text-xs font-medium text-white/70 mb-2">Tono</p>
            <div role="radiogroup" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TONES.map(t => (
                <button key={t.key} type="button" role="radio" aria-checked={form.tone === t.key} onClick={() => set({ tone: t.key })}
                  className={cn('flex flex-col items-center gap-1.5 py-3 rounded-xl border text-sm transition-all',
                    form.tone === t.key ? 'bg-aria-500/10 border-aria-500/50 text-white' : 'bg-white/[0.03] border-white/10 text-white/60 hover:border-white/20 hover:text-white')}>
                  <t.icon size={17} className={form.tone === t.key ? 'text-aria-300' : 'text-white/40'} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-white/70 mb-2">Longitud</p>
            <div role="radiogroup" className="grid grid-cols-3 gap-2">
              {LENGTHS.map(l => (
                <button key={l.key} type="button" role="radio" aria-checked={form.length === l.key} onClick={() => set({ length: l.key })}
                  className={cn('py-3 rounded-xl border text-center transition-all',
                    form.length === l.key ? 'bg-aria-500/10 border-aria-500/50' : 'bg-white/[0.03] border-white/10 hover:border-white/20')}>
                  <p className="text-sm font-medium text-white">{l.label}</p>
                  <p className="text-[11px] text-white/45">{l.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <Field label="Instrucciones adicionales (opcional)">
            <textarea rows={3} className={inputCls} value={form.guidelines} maxLength={2000}
              onChange={e => set({ guidelines: e.target.value })}
              placeholder="Ej: Menciona que tenemos una promoción vigente hasta fin de mes" />
          </Field>
        </>
      ) : (
        <div>
          <Field label="Mensaje" required>
            <textarea ref={templateRef} rows={5} className={inputCls} value={form.template} maxLength={4000}
              onChange={e => set({ template: e.target.value })} />
          </Field>
          <p className="text-[11px] text-white/40 mt-2 mb-1.5">Variables disponibles (Click para insertar)</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARS.map(k => (
              <button key={k} type="button" onClick={() => insertVar(k)}
                className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[11px] text-white/70 hover:text-white hover:border-aria-500/40 font-mono">
                {`{{${k}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <AttachmentField value={form.attachment} onChange={attachment => set({ attachment })} />

    </div>
  )
}

function StepMessagePreview({ form }) {
  const [sample, setSample] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isTemplate = form.message_mode === 'template'
  async function generate() {
    setLoading(true); setError('')
    try {
      setSample(await api.sampleCampaignMessage({
        strategy: form.strategy, objective: form.objective, guidelines: form.guidelines, audience: audienceFromForm(form),
        tone: form.tone, length: form.length, message_mode: form.message_mode, template: form.template,
      }))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }
  useEffect(() => { generate() }, [])  // se genera al entrar al paso
  const contactName = sample?.contact?.name || sample?.contact?.phone || 'Contacto de ejemplo'
  const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const att = form.attachment
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Vista previa</p>
        <p className="text-xs text-white/45 mt-0.5">Así se verá tu mensaje en WhatsApp.</p>
      </div>

      <div className="mx-auto w-full max-w-sm rounded-2xl overflow-hidden border border-white/10 shadow-xl">
        <div className="flex items-center gap-3 px-4 py-3 bg-[#008069]">
          <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center text-sm font-semibold text-white">
            {contactName[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{contactName}</p>
            <p className="text-[11px] text-white/75">en línea</p>
          </div>
        </div>
        <div className="min-h-[240px] px-3 py-4 bg-[#efeae2] flex flex-col justify-end">
          {loading ? (
            <div className="self-end flex items-center gap-2 px-3 py-2 rounded-lg bg-[#d9fdd3] text-xs text-[#111b21]/70">
              <Loader2 size={13} className="animate-spin" /> {isTemplate ? 'Armando el mensaje…' : 'Tobías está redactando…'}
            </div>
          ) : error ? (
            <p className="text-xs text-red-600 text-center">{error}</p>
          ) : sample && (
            <div className="self-end max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2 pt-2 pb-1 shadow-sm">
              {att && (
                <div className="flex items-center gap-2 mb-1.5 px-2 py-2 rounded-md bg-black/5 text-xs text-[#111b21]/80">
                  <Paperclip size={13} className="shrink-0" />
                  <span className="truncate">{att.filename}</span>
                </div>
              )}
              <p className="px-1 text-sm text-[#111b21] whitespace-pre-wrap break-words">{sample.message}</p>
              <p className="text-right text-[10px] text-[#667781] mt-0.5 px-1">{time} <span className="text-[#53bdeb]">✓✓</span></p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <button type="button" onClick={generate} disabled={loading}
          className="btn-ghost border border-white/10 flex items-center gap-2 disabled:opacity-40">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {isTemplate ? 'Actualizar vista previa' : 'Generar otro ejemplo'}
        </button>
      </div>
      {!isTemplate && (
        <p className="text-[11px] text-white/35 text-center">
          Es un ejemplo: Tobías redacta un mensaje distinto para cada contacto según su historial.
        </p>
      )}
    </div>
  )
}

function StepPace({ form, set, preview, instances }) {
  const est = estimateDuration(preview.count, form)
  const toggleDay = d => set({
    send_days: form.send_days.includes(d) ? form.send_days.filter(x => x !== d) : [...form.send_days, d],
  })
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Línea y ritmo de envío</p>
        <p className="text-xs text-white/45 mt-0.5">
          Elegí desde qué número sale la campaña y a qué ritmo. Un ritmo controlado protege tu número de bloqueos de WhatsApp.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-white/70 mb-2">¿Desde qué número sale?</p>
        <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <OptionCard active={form.channel_mode === 'last'} onClick={() => set({ channel_mode: 'last' })} icon={MessagesSquare}
            title={<>Último número que le escribió al contacto <Badge variant="primary" className="ml-1">Recomendado</Badge></>}
            desc="Cada contacto recibe el mensaje desde la última línea con la que venía hablando, para no romper el hilo." />
          <OptionCard active={form.channel_mode === 'specific'} onClick={() => set({ channel_mode: 'specific' })} icon={Smartphone}
            title="Un número específico" desc="Enviar toda la campaña desde una misma línea." />
        </div>
        {form.channel_mode === 'specific' && (
          <select className={cn(inputCls, 'mt-2')} value={form.channel_instance_id} aria-label="Número de WhatsApp"
            onChange={e => set({ channel_instance_id: e.target.value })}>
            <option value="">Primer número conectado</option>
            {instances.map(i => (
              <option key={i.id} value={i.id}>
                {i.instance_name || i.session_name}{i.phone_number ? ` · ${i.phone_number}` : ''} ({i.provider === 'evolution' ? 'EvolutionGo' : 'WAHA'})
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-white/70 mb-2"><Clock size={13} /> Ritmo de envío (goteo)</p>
        <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PACES.map(p => (
            <button key={p.key} type="button" disabled={p.disabled} onClick={() => set({ pace: p.key })}
              className={cn('text-left p-4 rounded-xl border transition-all',
                form.pace === p.key ? 'bg-aria-500/10 border-aria-500/50' : 'bg-white/[0.03] border-white/10 hover:border-white/20',
                p.disabled && 'opacity-40 cursor-not-allowed hover:border-white/10')}>
              <div className="flex items-center gap-2">
                {p.key === 'personalizado' ? <SlidersHorizontal size={15} className="text-white/50" /> : <Gauge size={15} className="text-white/50" />}
                <span className="text-sm font-medium text-white">{p.title}</span>
                {p.recommended && <Badge variant="primary">Recomendado</Badge>}
                {p.disabled && <Badge variant="default">Próximamente</Badge>}
                {form.pace === p.key && <Check size={15} className="ml-auto text-aria-400" />}
              </div>
              <p className="text-xs text-white/45 mt-1">{p.desc}</p>
              {p.perHalfHour && <p className="text-xs font-semibold text-white/80 mt-2">{p.perHalfHour} msg / 30 min</p>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-white/70 mb-2"><Clock size={13} /> Horario de envío</p>
        <p className="text-xs text-white/45 mb-2">Enviar solo entre</p>
        <div className="flex items-center gap-3">
          <input type="time" className={inputCls} value={form.hours_start} aria-label="Desde" onChange={e => set({ hours_start: e.target.value })} />
          <span className="text-white/40 text-sm">y</span>
          <input type="time" className={inputCls} value={form.hours_end} aria-label="Hasta" onChange={e => set({ hours_end: e.target.value })} />
        </div>
        <div className="flex gap-1.5 mt-3">
          {WEEKDAYS.map(w => (
            <button key={w.day} type="button" title={w.name} aria-label={w.name} aria-pressed={form.send_days.includes(w.day)}
              onClick={() => toggleDay(w.day)}
              className={cn('w-9 h-9 rounded-lg text-xs font-semibold border transition-colors',
                form.send_days.includes(w.day)
                  ? 'bg-aria-500 border-aria-500 text-white'
                  : 'bg-white/5 border-white/10 text-white/45 hover:text-white')}>
              {w.letter}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-white/35 mt-1.5">Hora de Argentina. Fuera de estos días y horario Tobías espera.</p>
      </div>

      <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <span>
          WhatsApp penaliza los envíos masivos y repetitivos. Tobías aplica calentamiento progresivo y pausas aleatorias de forma automática para reducir el riesgo de bloqueo. Recomendamos que la audiencia no sea un número grande.
        </span>
      </div>

      {est && (
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Clock size={14} className="text-aria-300" /> Duración estimada para {preview.count} contactos: <b className="text-white">{est}</b>
        </div>
      )}
    </div>
  )
}

const REPLY_OPTIONS = [
  { key: 'seller', icon: UserCheck, recommended: true, title: 'Derivar a su último vendedor',
    desc: 'La conversación pasa al último vendedor que atendió este contacto.' },
  { key: 'agent', icon: Bot, title: 'Asignar a su último Agente IA',
    desc: 'El último Agente IA que trabajó al contacto retoma la conversación para calificar y agendar.' },
  { key: 'assignment', icon: Shuffle, disabled: true, title: 'Enviar al proceso de asignación',
    desc: 'El contacto vuelve al flujo de asignación de leads como si fuera nuevo.' },
]
const replyOf = key => REPLY_OPTIONS.find(o => o.key === key) || REPLY_OPTIONS[0]

function StepReply({ form, set }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">¿Qué pasa cuando responden?</p>
        <p className="text-xs text-white/45 mt-0.5">
          Cuando un contacto responde, ese es el momento de mayor valor. Definí quién continúa la conversación.
        </p>
      </div>
      <div role="radiogroup" className="space-y-2">
        {REPLY_OPTIONS.map(o => (
          <button key={o.key} type="button" role="radio" aria-checked={form.on_reply === o.key} disabled={o.disabled}
            onClick={() => set({ on_reply: o.key })}
            className={cn('w-full text-left p-4 rounded-xl border transition-all flex gap-3',
              form.on_reply === o.key ? 'bg-aria-500/10 border-aria-500/50' : 'bg-white/[0.03] border-white/10 hover:border-white/20',
              o.disabled && 'opacity-40 cursor-not-allowed hover:border-white/10')}>
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              form.on_reply === o.key ? 'bg-aria-500/20 text-aria-300' : 'bg-white/5 text-white/40')}>
              <o.icon size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white flex flex-wrap items-center gap-2">
                {o.title}
                {o.recommended && <Badge variant="primary">Recomendado</Badge>}
                {o.disabled && <Badge variant="default">Próximamente</Badge>}
              </p>
              <p className="text-xs text-white/45 mt-0.5">{o.desc}</p>
            </div>
            {form.on_reply === o.key && <Check size={16} className="ml-auto text-aria-400 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// Riesgo de spam por frecuencia de contacto: cuántas veces por semana le llega un mensaje
// de la serie a la misma persona. 1/semana ≈ 19 (seguro); a diario ≈ 77 (riesgoso).
function lineSafety(f) {
  const n = f.recurrence_days.length
  const perWeek = f.recurrence === 'monthly' ? n / 4.33 : n
  const score = Math.round(100 * (1 - Math.exp(-0.21 * perWeek)))
  const freq = f.recurrence === 'monthly'
    ? `${n} envío${n === 1 ? '' : 's'} por mes a cada contacto`
    : `${n} envío${n === 1 ? '' : 's'} por semana a cada contacto`
  if (score < 35) return { score, freq, label: 'Seguro', color: '#10b981', text: 'Frecuencia saludable. Bajo riesgo para la línea.' }
  if (score < 60) return { score, freq, label: 'Moderado', color: '#f59e0b', text: 'Frecuencia alta. Vigilá las respuestas y los bloqueos.' }
  return { score, freq, label: 'Riesgoso', color: '#ef4444', text: 'Demasiados envíos al mismo contacto. Riesgo de bloqueo de la línea.' }
}

function SafetyGauge({ form }) {
  const s = lineSafety(form)
  const r = 34, c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
      <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0" role="img" aria-label={`Riesgo de spam ${s.score} de 100`}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={s.color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(s.score / 100) * c} ${c}`} transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dasharray .3s, stroke .3s' }} />
        <text x="44" y="44" textAnchor="middle" fill="white" fontSize="20" fontWeight="700">{s.score}</text>
        <text x="44" y="58" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9" fontWeight="600" letterSpacing="1">SPAM</text>
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</p>
        <p className="text-xs text-white/70">· {s.freq}</p>
        <p className="text-xs text-white/45 mt-1">{s.text}</p>
      </div>
    </div>
  )
}

function StepSchedule({ form, set, onAdvance }) {
  const toggleDay = d => set({
    recurrence_days: form.recurrence_days.includes(d) ? form.recurrence_days.filter(x => x !== d) : [...form.recurrence_days, d],
  })
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-white">Programación</p>
        <p className="text-xs text-white/45 mt-0.5">
          Decidí cuándo debe comenzar la campaña. El ritmo de envío que configuraste se aplica a partir de este momento.
        </p>
      </div>
      <div role="radiogroup" className="space-y-2">
        <OptionCard active={form.launch === 'now'} onClick={() => { set({ launch: 'now' }); onAdvance() }} icon={Zap}
          title="Comenzar ahora" desc="La campaña arranca de inmediato con el ritmo configurado." />
        <OptionCard active={form.launch === 'schedule'} onClick={() => set({ launch: 'schedule' })} icon={Calendar}
          title="Programar" desc="Elegí una fecha y hora de inicio." />
        <OptionCard active={form.launch === 'recurring'} onClick={() => set({ launch: 'recurring' })} icon={Repeat}
          title="Recurrente" desc="Repetí la campaña según una frecuencia con audiencia nueva en cada corrida." />
      </div>

      {form.launch === 'schedule' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fecha" required>
            <input type="date" className={inputCls} value={form.schedule_date}
              min={toDateInput(Date.now() / 1000)} onChange={e => set({ schedule_date: e.target.value })} />
          </Field>
          <Field label="Hora" required>
            <input type="time" className={inputCls} value={form.schedule_time}
              onChange={e => set({ schedule_time: e.target.value })} />
          </Field>
        </div>
      )}

      {form.launch === 'recurring' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Frecuencia">
              <select className={inputCls} value={form.recurrence}
                onChange={e => set({ recurrence: e.target.value, recurrence_days: RECURRENCES.find(r => r.key === e.target.value).days })}>
                {RECURRENCES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Cada corrida a partir de las:">
              <input type="time" className={inputCls} value={form.recurrence_time}
                onChange={e => set({ recurrence_time: e.target.value })} />
            </Field>
          </div>
          <div>
            <p className="text-xs font-medium text-white/70 mb-1.5">Días</p>
            <div className="flex gap-1.5">
              {WEEKDAYS.map(w => (
                <button key={w.day} type="button" title={w.name} aria-label={w.name} aria-pressed={form.recurrence_days.includes(w.day)}
                  onClick={() => toggleDay(w.day)}
                  className={cn('w-9 h-9 rounded-lg text-xs font-semibold border transition-colors',
                    form.recurrence_days.includes(w.day)
                      ? 'bg-aria-500 border-aria-500 text-white'
                      : 'bg-white/5 border-white/10 text-white/45 hover:text-white')}>
                  {w.letter}
                </button>
              ))}
            </div>
            {form.recurrence === 'monthly' && (
              <p className="text-[11px] text-white/35 mt-1.5">Mensual: corre la primera semana de cada mes, en los días marcados.</p>
            )}
          </div>
          <Field label="Finaliza el (opcional):" hint="Vacío = la serie corre indefinidamente hasta que la pauses.">
            <input type="date" className={inputCls} value={form.recurrence_until}
              min={toDateInput(Date.now() / 1000)} onChange={e => set({ recurrence_until: e.target.value })} />
          </Field>
          {form.recurrence_days.length > 0 && <SafetyGauge form={form} />}
          <p className="text-[11px] text-white/35">
            En cada corrida se busca la audiencia de nuevo con los filtros que elegiste y se excluye a quien todavía tiene un mensaje en cola. Cada corrida se ve como una campaña propia, con sus métricas.
          </p>
        </div>
      )}
    </div>
  )
}

function scheduleSummary(f) {
  if (f.launch === 'schedule') {
    return f.schedule_date ? new Date(`${f.schedule_date}T${f.schedule_time || '00:00'}`).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  }
  if (f.launch === 'recurring') {
    const days = WEEKDAYS.filter(w => f.recurrence_days.includes(w.day)).map(w => w.letter).join(' ')
    const until = f.recurrence_until ? ` · hasta el ${new Date(`${f.recurrence_until}T12:00`).toLocaleDateString('es')}` : ' · sin fecha de fin'
    return `Recurrente · ${recurrenceLabel(f.recurrence)} · ${days} · desde las ${f.recurrence_time}${until}`
  }
  return 'Ahora'
}

function rulesSummary(rules, stages) {
  const valid = rules.filter(r => r.value !== '' && r.value != null)
  if (!valid.length) return 'Sin filtros (toda la base elegible)'
  return valid.map((r, i) => {
    const op = RULE_FIELDS[r.field].ops.find(([k]) => k === r.op)?.[1] || ''
    const val = r.field === 'opp_status' ? OPP_STATUSES.find(([k]) => k === r.value)?.[1]
      : r.field === 'opp_stage' ? (stages.find(st => st.id === r.value)?.label || r.value)
      : r.value
    const text = r.field === 'last_interaction'
      ? `${RULE_FIELDS[r.field].label} ${op.replace('(días)', '').trim()} ${val} días`
      : `${RULE_FIELDS[r.field].label} ${op} ${val}`
    return i === 0 ? text : `${r.join === 'or' ? 'O' : 'Y'} ${text}`
  }).join(' ')
}

// Créditos de IA estimados: 1 por contacto cuando la IA redacta (o depura una plantilla).
function estimateCredits(form, count) {
  const usesAi = form.message_mode !== 'template' || form.ai_screening
  return usesAi ? (count || 0) : 0
}

function StepReview({ form, preview, instances, goTo, stages }) {
  const inst = form.channel_mode === 'specific' ? instances.find(i => i.id === form.channel_instance_id) : null
  const st = strategyOf(form.strategy)
  const count = preview.count ?? 0
  const credits = estimateCredits(form, count)
  const days = WEEKDAYS.filter(w => form.send_days.includes(w.day)).map(w => w.letter).join(' ')
  const launchLabel = form.launch === 'schedule' ? 'Se programa para la fecha elegida'
    : form.launch === 'recurring' ? 'Se activa la serie recurrente' : 'Arranca apenas la lances'
  // Un renglón por paso: [clave, resumen]
  const summaries = {
    general: [form.name || 'Sin nombre', st?.title, form.description].filter(Boolean).join(' · '),
    schedule: scheduleSummary(form),
    audience: `${st?.base || '—'} · ${rulesSummary(form.rules, stages)}`,
    filters: [
      `${preview.filterCount ?? count} del filtro`,
      form.manual_contacts.length ? `${form.manual_contacts.length} agregados a mano` : null,
      form.ai_screening ? 'Depuración con IA' : null,
    ].filter(Boolean).join(' · '),
    pace: [
      form.channel_mode === 'last' ? 'Último número que le escribió' : (inst ? (inst.instance_name || inst.session_name) : 'Primer número conectado'),
      `${paceOf(form.pace).title} (${paceOf(form.pace).perHalfHour} msg/30 min)`,
      `${form.hours_start}–${form.hours_end} ${days}`,
    ].join(' · '),
    message: [
      form.message_mode === 'template'
        ? 'Plantilla'
        : `Asistido por IA · ${TONES.find(t => t.key === form.tone)?.label} · ${LENGTHS.find(l => l.key === form.length)?.label}`,
      form.attachment ? `Adjunto: ${form.attachment.filename}` : null,
    ].filter(Boolean).join(' · '),
    msgpreview: form.message_mode === 'template'
      ? (form.template || '—')
      : 'Tobías redacta un mensaje distinto para cada contacto',
    reply: replyOf(form.on_reply).title,
    review: launchLabel,
  }
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Revisá y lanzá</p>
        <p className="text-xs text-white/45 mt-0.5">
          Este es el resumen final. Podés volver a cualquier paso para ajustar antes de iniciar.
        </p>
      </div>

      <div className="flex items-center gap-4 p-5 rounded-2xl border border-aria-500/25 bg-gradient-to-br from-aria-500/15 to-purple-500/10">
        <div className="w-12 h-12 rounded-xl bg-aria-500/20 flex items-center justify-center shrink-0">
          <Send size={22} className="text-aria-200 -rotate-12" />
        </div>
        <div className="min-w-0">
          <p className="text-4xl font-bold text-white leading-none">
            {preview.loading ? <Loader2 size={26} className="animate-spin text-white/50" /> : count}
          </p>
          <p className="text-sm text-white/60 mt-1">contactos recibirán esta campaña</p>
          {form.launch === 'recurring' && (
            <p className="text-[11px] text-white/40 mt-0.5">En la primera corrida. Cada corrida vuelve a buscar la audiencia.</p>
          )}
        </div>
      </div>

      <p className="flex items-center gap-2 px-1 text-sm text-white/70">
        <Sparkles size={15} className="text-aria-300 shrink-0" />
        <span><b className="text-white">{credits}</b> crédito{credits === 1 ? '' : 's'} de IA se consumirán{form.launch === 'recurring' ? ' por corrida' : ''}</span>
      </p>

      <div className="space-y-2">
        {STEPS.map((stp, i) => {
          const isLast = stp.key === 'review'
          return (
            <button key={stp.key} type="button" disabled={isLast} onClick={() => goTo(i)}
              className={cn('w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                isLast ? 'border-aria-500/30 bg-aria-500/5 cursor-default' : 'border-white/10 bg-white/[0.03] hover:border-aria-500/40 group')}>
              <span className={cn('w-7 h-7 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0',
                isLast ? 'bg-aria-500 text-white' : 'bg-aria-500/15 text-aria-200')}>
                {isLast ? <Check size={13} /> : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-white">{stp.title}</span>
                <span className="block text-xs text-white/45 truncate">{summaries[stp.key]}</span>
              </span>
              {!isLast && (
                <span className="flex items-center gap-1 text-xs text-white/35 group-hover:text-aria-300 shrink-0">
                  <Pencil size={13} /> Editar
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const STEP_COMPONENTS = {
  general: StepGeneral, schedule: StepSchedule, audience: StepAudience, filters: StepFilters, msgpreview: StepMessagePreview,
  message: StepMessage, pace: StepPace, reply: StepReply, review: StepReview,
}

// ── Asistente guiado (9 pasos) ────────────────────────────────────────────────
function GuidedWizard({ campaign, instances, labels, stages, onClose, onSaved }) {
  const [form, setForm] = useState(() => formFromCampaign(campaign))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const preview = useAudiencePreview(form)
  const canLaunch = !campaign || ['draft', 'scheduled'].includes(campaign.status)

  function validate(i) {
    const key = STEPS[i].key
    if (key === 'general') {
      if (!form.name.trim()) return 'Poné un nombre a la campaña'
      if (!form.strategy) return 'Elegí una estrategia comercial'
      if (form.strategy === 'personalizado' && !form.objective.trim()) return 'Escribí tu objetivo'
    }
    if (key === 'schedule' && form.launch === 'schedule') {
      if (!form.schedule_date || !form.schedule_time) return 'Elegí fecha y hora de inicio'
      if (toEpoch(form.schedule_date, form.schedule_time) * 1000 <= Date.now()) return 'La fecha y hora tienen que ser futuras'
    }
    if (key === 'schedule' && form.launch === 'recurring') {
      if (!form.recurrence_time) return 'Elegí a partir de qué hora corre cada corrida'
      if (form.recurrence_days.length === 0) return 'Elegí al menos un día'
    }
    if (key === 'message' && form.message_mode === 'template' && !form.template.trim()) return 'Escribí la plantilla del mensaje'
    if (key === 'pace' && form.hours_start >= form.hours_end) return 'El horario de fin tiene que ser posterior al de inicio'
    if (key === 'pace' && form.send_days.length === 0) return 'Elegí al menos un día de envío'
    return ''
  }

  // Hacia atrás se navega libre; hacia adelante, solo si los pasos intermedios son válidos.
  function goTo(i) {
    for (let k = Math.min(step, i); k < i; k++) {
      const err = validate(k)
      if (err) { setStep(k); setError(err); return }
    }
    setError(''); setStep(i)
  }

  async function save(launch) {
    for (let k = 0; k < STEPS.length; k++) {
      const err = launch === 'draft' ? (k === 0 ? validate(0) : '') : validate(k)
      if (err) { setStep(k); setError(err); return }
    }
    setSaving(true); setError('')
    try {
      const payload = { ...payloadFromForm(form), launch }
      onSaved(campaign ? await api.updateCampaign(campaign.id, payload) : await api.createCampaign(payload))
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  const isLast = step === STEPS.length - 1
  const StepBody = STEP_COMPONENTS[STEPS[step].key]
  // "Comenzar ahora" no tiene más nada que configurar en Programación: avanza solo.
  const onAdvance = () => { setError(''); setStep(st => Math.min(st + 1, STEPS.length - 1)) }

  return (
    <Modal onClose={onClose} wide>
      <ModalHeader
        title={campaign ? 'Editar campaña' : 'Nueva campaña'}
        subtitle={`Paso ${step + 1} de ${STEPS.length} · ${STEPS[step].title}`}
        onClose={onClose}
      />

      {/* Barra de avance */}
      <div className="px-6 pt-4">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.key} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
              <button
                onClick={() => goTo(i)}
                title={s.title}
                className={cn(
                  'w-7 h-7 rounded-full text-[11px] font-semibold flex items-center justify-center shrink-0 transition-colors',
                  i < step && 'bg-aria-500 text-white',
                  i === step && 'bg-aria-500/20 text-aria-200 ring-2 ring-aria-500',
                  i > step && 'bg-white/5 text-white/35 hover:text-white/70',
                )}
              >
                {i < step ? <Check size={13} /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-1 rounded-full bg-white/10 overflow-hidden">
                  <div className={cn('h-full bg-aria-500 transition-all duration-300', i < step ? 'w-full' : 'w-0')} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-aria-500 to-purple-500 transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="px-6 py-5 overflow-y-auto flex-1">
        <StepBody form={form} set={set} instances={instances} labels={labels} stages={stages} preview={preview} goTo={goTo} onAdvance={onAdvance} />
      </div>

      {error && (
        <div className="mx-6 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/5">
        <button onClick={() => (step === 0 ? onClose() : (setError(''), setStep(step - 1)))} className="btn-ghost flex items-center gap-1.5">
          {step === 0 ? <><X size={15} /> Cancelar</> : <><ChevronLeft size={15} /> Atrás</>}
        </button>
        <div className="flex items-center gap-2">
          {isLast && (!campaign || campaign.status === 'draft') && (
            <button onClick={() => save('draft')} disabled={saving} className="btn-ghost border border-white/10">
              Guardar borrador
            </button>
          )}
          {isLast ? (
            canLaunch ? (
              <button onClick={() => save(form.launch)} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : form.launch === 'schedule' ? <Calendar size={14} /> : form.launch === 'recurring' ? <Repeat size={14} /> : <Play size={14} />}
                {form.launch === 'schedule' ? 'Programar campaña' : form.launch === 'recurring' ? 'Activar campaña recurrente' : 'Lanzar campaña'}
              </button>
            ) : (
              <button onClick={() => save('draft')} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} Guardar cambios
              </button>
            )
          ) : (
            <button onClick={() => goTo(step + 1)} className="btn-primary flex items-center gap-1.5">
              Siguiente <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Creación simple (una pantalla) ────────────────────────────────────────────
// Lo esencial (nombre, objetivo, filtros, adjunto); el resto va con los valores recomendados.
const SIMPLE_AUTO = [
  { icon: Sparkles,       label: 'Mensaje',       value: 'Generado por IA, personalizado por contacto' },
  { icon: Gauge,          label: 'Ritmo',         value: 'Conservador · protege la línea de bloqueos' },
  { icon: MessagesSquare, label: 'Línea',         value: 'El último número que habló con cada contacto' },
  { icon: UserCheck,      label: 'Al responder',  value: 'Deriva a su último vendedor' },
  { icon: Zap,            label: 'Programación',  value: 'Comenzar ahora' },
]

function SimpleCreate({ labels, stages, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...DEFAULT_FORM, ...applyStrategy(DEFAULT_FORM, 'reactivar'),
    message_mode: 'ai', pace: 'conservador', channel_mode: 'last', on_reply: 'seller', launch: 'now',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const preview = useAudiencePreview(form)
  const count = preview.count ?? 0

  async function create() {
    if (!form.name.trim()) return setError('Poné un nombre a la campaña')
    setSaving(true); setError('')
    try { onSaved(await api.createCampaign({ ...payloadFromForm(form), launch: 'now' })) }
    catch (e) { setError(e.message) }
    setSaving(false)
  }

  return (
    <Modal onClose={onClose} wide>
      <ModalHeader title="Nueva campaña · Simple"
        subtitle="Elegís lo esencial; Tobías se encarga del resto con los ajustes recomendados." onClose={onClose} />
      <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nombre de la campaña" required>
            <input autoFocus className={inputCls} value={form.name} maxLength={120}
              onChange={e => set({ name: e.target.value })} placeholder="Ej: Reactivación rápida" />
          </Field>
          <Field label="Objetivo">
            <select className={inputCls} value={form.strategy} onChange={e => set(applyStrategy(form, e.target.value))}>
              {STRATEGIES.filter(st => st.key !== 'personalizado').map(st => <option key={st.key} value={st.key}>{st.title}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Filtros <span className="text-white/35 font-normal">(opcional)</span></p>
          <p className="text-xs text-white/45 mt-0.5 mb-3">
            Condiciones sobre tus contactos (conversaciones, estado de la oportunidad, tags, última interacción…). Sin filtros, se considera toda tu base elegible.
          </p>
          <RuleBuilder rules={form.rules} onChange={rules => set({ rules })} stages={stages} labels={labels} />
        </div>

        <div className="flex items-center gap-4 p-4 rounded-2xl border border-aria-500/25 bg-gradient-to-br from-aria-500/15 to-purple-500/10">
          <div className="w-11 h-11 rounded-xl bg-aria-500/20 flex items-center justify-center shrink-0">
            <Send size={20} className="text-aria-200 -rotate-12" />
          </div>
          <p className="text-sm text-white/60">
            <span className="text-3xl font-bold text-white mr-2 align-middle">
              {preview.loading ? <Loader2 size={22} className="inline animate-spin text-white/50" /> : count}
            </span>
            contacto{count === 1 ? '' : 's'} recibirá{count === 1 ? '' : 'n'} la campaña
          </p>
        </div>

        <div className="rounded-xl border border-white/5 divide-y divide-white/5">
          {SIMPLE_AUTO.map(a => (
            <div key={a.label} className="flex items-center gap-3 px-4 py-2.5">
              <a.icon size={15} className="text-aria-300 shrink-0" />
              <p className="flex-1 min-w-0 text-sm text-white/80 truncate">
                <b className="text-white font-medium">{a.label}</b> · {a.value}
              </p>
              <Badge variant="primary">Auto</Badge>
            </div>
          ))}
        </div>

        <AttachmentField value={form.attachment} onChange={attachment => set({ attachment })} />
      </div>

      {error && (
        <div className="mx-6 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle size={13} /> {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/5">
        <button onClick={onClose} className="btn-ghost flex items-center gap-1.5"><X size={15} /> Cancelar</button>
        <button onClick={create} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Crear campaña
        </button>
      </div>
    </Modal>
  )
}

// ── Elección del modo de creación ─────────────────────────────────────────────
function ModeChooser({ onClose, onPick }) {
  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Nueva campaña" subtitle="Elegí cómo querés crearla" onClose={onClose} />
      <div className="p-6 space-y-3">
        <button onClick={() => onPick('guided')}
          className="w-full text-left p-5 rounded-xl border border-aria-500/40 bg-aria-500/10 hover:bg-aria-500/15 transition-colors flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-aria-500/20 text-aria-300 flex items-center justify-center shrink-0"><Sparkles size={18} /></div>
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-2">Creación guiada <Badge variant="primary">Recomendado</Badge></p>
            <p className="text-xs text-white/50 mt-1">Paso a paso con todo el control: audiencia, mensaje, ritmo, respuesta y programación.</p>
          </div>
          <ChevronRight size={16} className="ml-auto self-center text-white/40 shrink-0" />
        </button>
        <button onClick={() => onPick('simple')}
          className="w-full text-left p-5 rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/20 transition-colors flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/5 text-white/50 flex items-center justify-center shrink-0"><Zap size={18} /></div>
          <div>
            <p className="text-sm font-semibold text-white">Creación simple</p>
            <p className="text-xs text-white/50 mt-1">Una sola pantalla con lo esencial. Ideal para lanzar rápido con valores recomendados.</p>
          </div>
          <ChevronRight size={16} className="ml-auto self-center text-white/40 shrink-0" />
        </button>
      </div>
    </Modal>
  )
}

// ── Detalle (destinatarios) ───────────────────────────────────────────────────
function CampaignDetail({ campaign, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => api.getCampaignRecipients(campaign.id).then(r => alive && setRows(r)).catch(() => alive && setRows([]))
    load()
    const t = campaign.status === 'active' ? setInterval(load, 15000) : null
    return () => { alive = false; t && clearInterval(t) }
  }, [campaign.id, campaign.status])

  return (
    <Modal onClose={onClose} wide>
      <ModalHeader title={campaign.name} subtitle={[STATUS[campaign.status]?.label, strategyOf(campaign.strategy)?.title, `${campaign.total} destinatarios`].filter(Boolean).join(' · ')} onClose={onClose} />
      <div className="px-6 py-4 overflow-y-auto flex-1">
        {campaign.description && <p className="text-xs text-white/50 mb-2">{campaign.description}</p>}
        {campaign.objective && <p className="text-xs text-white/50 mb-4"><b className="text-white/70">Objetivo:</b> {campaign.objective}</p>}
        {campaign.recurrence && (
          <p className="text-xs text-white/50 mb-4 flex gap-1.5"><Repeat size={13} className="shrink-0 mt-0.5" />
            Serie recurrente: cada corrida aparece en la lista como una campaña propia, con sus destinatarios y métricas.
            {campaign.status === 'scheduled' && ` Próxima corrida: ${fmtDate(campaign.scheduled_at)}.`}
          </p>
        )}
        {rows == null ? <div className="flex justify-center py-10"><Spinner /></div>
          : rows.length === 0 ? <p className="text-sm text-white/40 text-center py-10">Todavía no hay destinatarios: se arma la lista al lanzar la campaña.</p>
          : (
            <div className="divide-y divide-white/5">
              {rows.map(r => (
                <div key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white/85 truncate">{r.name || r.phone}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.sent_at && <span className="text-[11px] text-white/30">{fmtDate(r.replied_at || r.sent_at)}</span>}
                      <Badge variant={RECIPIENT_STATUS[r.status]?.variant}>{RECIPIENT_STATUS[r.status]?.label || r.status}</Badge>
                    </div>
                  </div>
                  {r.message && <p className="text-xs text-white/50 mt-1.5 whitespace-pre-wrap">{r.message}</p>}
                  {r.error && <p className="text-[11px] text-red-300/70 mt-1">{r.error}</p>}
                </div>
              ))}
            </div>
          )}
      </div>
    </Modal>
  )
}

// ── Tab: Campañas ─────────────────────────────────────────────────────────────
function CampaignRow({ c, onOpen, onEdit, onAction, onDelete, busy }) {
  const progress = c.total ? Math.round(((c.total - c.pending) / c.total) * 100) : 0
  const isSeries = !!c.recurrence
  const btn = 'p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5 disabled:opacity-30'
  return (
    <div className="card-sm flex flex-col md:flex-row md:items-center gap-4 hover:border-white/10 cursor-pointer" onClick={() => onOpen(c)}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white truncate">{c.name}</p>
          <Badge variant={STATUS[c.status]?.variant}>{STATUS[c.status]?.label}</Badge>
          {c.recurrence && <Badge variant="info"><Repeat size={10} /> {recurrenceLabel(c.recurrence)}</Badge>}
          {strategyOf(c.strategy) && <span className="hidden sm:inline text-[11px] text-white/35 truncate">{strategyOf(c.strategy).title}</span>}
        </div>
        <p className="text-[11px] text-white/35 mt-1 truncate">
          {c.status === 'scheduled'
            ? `${c.recurrence ? 'Próxima corrida' : 'Empieza'} ${fmtDate(c.scheduled_at)}`
            : c.started_at ? `Inició ${fmtDate(c.started_at)}` : `Creada ${fmtDate(c.created_at)}`}
          {c.recurrence && c.run_count ? ` · ${c.run_count} corrida${c.run_count > 1 ? 's' : ''}` : ''}
          {c.description || c.objective ? ` · ${c.description || c.objective}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-5 text-xs shrink-0">
        <div className="w-32">
          <div className="flex justify-between text-white/40 mb-1"><span>{c.total - c.pending}/{c.total}</span><span>{progress}%</span></div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-aria-500 rounded-full" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="text-center"><p className="text-white font-semibold">{c.sent}</p><p className="text-white/35 text-[10px]">Enviados</p></div>
        <div className="text-center"><p className="text-white font-semibold">{c.replied}</p><p className="text-white/35 text-[10px]">Respuestas</p></div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
        {['draft', 'scheduled'].includes(c.status) && (
          <button className={btn} disabled={busy} onClick={() => onAction(c, 'start')} title={isSeries ? 'Correr ahora' : 'Lanzar ahora'}><Play size={15} /></button>
        )}
        {['active', 'scheduled'].includes(c.status) && (
          <button className={btn} disabled={busy} onClick={() => onAction(c, 'pause')} title="Pausar"><Pause size={15} /></button>
        )}
        {c.status === 'paused' && (
          <button className={btn} disabled={busy} onClick={() => onAction(c, 'resume')} title="Reanudar"><Play size={15} /></button>
        )}
        {['draft', 'scheduled', 'paused'].includes(c.status) && (
          <button className={btn} disabled={busy} onClick={() => onEdit(c)} title="Editar"><Pencil size={15} /></button>
        )}
        {['active', 'paused', 'scheduled'].includes(c.status) && (
          <button className={btn} disabled={busy} onClick={() => onAction(c, 'finish')} title="Finalizar"><Square size={14} /></button>
        )}
        {c.status !== 'active' && (
          <button className={cn(btn, 'hover:text-red-400')} disabled={busy} onClick={() => onDelete(c)} title="Eliminar"><Trash2 size={15} /></button>
        )}
      </div>
    </div>
  )
}

function CampaignsTab({ campaigns, loading, onNew, ...rowProps }) {
  const [filter, setFilter] = useState('all')
  const counts = useMemo(() => {
    const c = { all: campaigns.length }
    for (const k of Object.keys(STATUS)) c[k] = campaigns.filter(x => x.status === k).length
    return c
  }, [campaigns])
  const list = filter === 'all' ? campaigns : campaigns.filter(c => c.status === filter)
  const filters = [['all', 'Todas'], ...Object.entries(STATUS).map(([k, v]) => [k, v.plural])]

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-5 bg-surface-50 rounded-xl p-1 border border-white/5 w-fit max-w-full">
        {filters.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
              filter === k ? 'bg-aria-500 text-white shadow-sm' : 'text-white/40 hover:text-white')}>
            {label}
            <span className={cn('text-[10px] px-1.5 rounded', filter === k ? 'bg-white/20' : 'bg-white/5')}>{counts[k]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="w-6 h-6" /></div>
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center justify-center text-center py-16 hover:translate-y-0">
          <div className="w-14 h-14 rounded-2xl bg-aria-500/10 border border-aria-500/20 flex items-center justify-center mb-4">
            <Megaphone size={24} className="text-aria-300" />
          </div>
          <p className="text-base font-semibold text-white">No hay campañas</p>
          <p className="text-sm text-white/40 mt-1 mb-5">
            {filter === 'all' ? 'Comienza creando tu primera campaña.' : `No hay campañas ${STATUS[filter].plural.toLowerCase()}.`}
          </p>
          {filter === 'all' && (
            <button onClick={onNew} className="btn-primary flex items-center gap-2"><Plus size={15} /> Nueva Campaña</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(c => <CampaignRow key={c.id} c={c} {...rowProps} />)}
        </div>
      )}
    </div>
  )
}

// ── Tab: Resumen de Ventas ────────────────────────────────────────────────────
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)

function formatReplyTime(secs) {
  if (secs == null) return '—'
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`
  if (secs < 86400) return `${Math.round(secs / 360) / 10} h`
  return `${Math.round(secs / 8640) / 10} días`
}

function SalesCard({ label, value, hint, soon }) {
  return (
    <div className="card-sm">
      <p className="text-xs text-white/50">{label}</p>
      <p className={cn('text-3xl font-bold mt-1', soon ? 'text-white/40' : 'text-white')}>{value}</p>
      <p className="text-[11px] text-white/40 mt-1">{hint}</p>
    </div>
  )
}

function FunnelRow({ label, value, share, note, width, soon }) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3">
      <span className="text-sm text-white/80 truncate">{label}</span>
      <div className="h-7 rounded-lg bg-white/5 overflow-hidden">
        {!soon && (
          <div className="h-full rounded-lg bg-gradient-to-r from-aria-500 to-purple-500 transition-all"
            style={{ width: `${Math.max(width, value ? 2 : 0)}%` }} />
        )}
        {soon && <p className="h-full flex items-center px-3 text-[11px] text-white/35">Detección con IA · próximamente</p>}
      </div>
      <div className="text-right min-w-[90px]">
        {soon
          ? <Badge variant="default">Próximamente</Badge>
          : <>
              <p className="text-sm font-semibold text-white leading-tight">{value}</p>
              <p className="text-[10px] text-white/40">{share} {note}</p>
            </>}
      </div>
    </div>
  )
}

function SummaryTab({ summary }) {
  if (!summary) return <div className="flex justify-center py-20"><Spinner className="w-6 h-6" /></div>
  const s = summary
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Resultados de ventas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SalesCard label="Tasa de respuesta" value={`${s.reply_rate}%`} hint={`${s.replied} respuestas de ${s.delivered} entregados`} />
          <SalesCard label="Conversaciones reactivadas" value="0" hint="próximamente · lo detecta el clasificador de intención" soon />
          <SalesCard label="Derivadas a vendedor" value={s.handed_off} hint="leads listos para cierre" />
          <SalesCard label="Tiempo medio de 1ª respuesta" value={formatReplyTime(s.avg_first_reply)} hint="desde el envío hasta que responden" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          [s.byStatus.active, 'Campañas activas ahora'],
          [s.byStatus.scheduled, 'Programadas ahora'],
          [s.reached, 'Contactos alcanzados'],
          [s.delivered, 'Mensajes enviados'],
        ].map(([v, label]) => (
          <div key={label} className="card-sm text-center">
            <p className="text-2xl font-bold text-white">{v}</p>
            <p className="text-[11px] text-white/45 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="card hover:translate-y-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <h3 className="text-sm font-semibold text-white">Embudo de reactivación</h3>
          <span className="text-xs text-white/45">De entregado a respuesta: <b className="text-white">{pct(s.replied, s.delivered)}%</b></span>
        </div>
        <div className="space-y-3">
          <FunnelRow label="Contactados" value={s.contacted} width={s.contacted ? 100 : 0} share="100%" note="" />
          <FunnelRow label="Entregados" value={s.delivered} width={pct(s.delivered, s.contacted)}
            share={`${pct(s.delivered, s.contacted)}%`} note="entregado" />
          <FunnelRow label="Respondieron" value={s.replied} width={pct(s.replied, s.contacted)}
            share={`${pct(s.replied, s.delivered)}%`} note="de entregados" />
          <FunnelRow label="Derivados a vendedor" value={s.handed_off} width={pct(s.handed_off, s.contacted)}
            share={`${pct(s.handed_off, s.replied)}%`} note="de respuestas" />
          <FunnelRow label="Reactivados" soon />
          <FunnelRow label="Oportunidades" soon />
        </div>
      </div>
    </div>
  )
}

// ── Tab: Reportes (una campaña a la vez) ──────────────────────────────────────
function ReportsTab({ campaigns }) {
  const [selectedId, setSelectedId] = useState('')
  const [rows, setRows] = useState(null)
  const c = campaigns.find(x => x.id === selectedId)
  useEffect(() => {
    if (!selectedId) { setRows(null); return }
    let alive = true
    setRows(null)
    api.getCampaignRecipients(selectedId).then(r => alive && setRows(r)).catch(() => alive && setRows([]))
    return () => { alive = false }
  }, [selectedId])

  return (
    <div className="space-y-5">
      <Field label="Campañas">
        <select className={cn(inputCls, 'max-w-md')} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">Seleccioná una campaña</option>
          {campaigns.map(x => (
            <option key={x.id} value={x.id}>{x.name} · {STATUS[x.status]?.label}</option>
          ))}
        </select>
      </Field>

      {!c ? (
        <div className="card flex flex-col items-center justify-center text-center py-16 hover:translate-y-0">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Filter size={22} className="text-white/40" />
          </div>
          <p className="text-base font-semibold text-white">Seleccioná una campaña para ver su reporte</p>
          <p className="text-sm text-white/40 mt-1">Elegí una campaña del listado para cargar sus métricas y destinatarios.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{c.name}</h3>
            <Badge variant={STATUS[c.status]?.variant}>{STATUS[c.status]?.label}</Badge>
            {strategyOf(c.strategy) && <span className="text-xs text-white/40">{strategyOf(c.strategy).title}</span>}
            {c.recurrence && <Badge variant="info"><Repeat size={10} /> {recurrenceLabel(c.recurrence)}</Badge>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              [c.total, 'Destinatarios'],
              [c.sent, 'Enviados'],
              [c.replied, 'Respondieron'],
              [rate(c.replied, c.sent), 'Tasa de respuesta'],
              [c.failed, 'Fallidos'],
              [c.skipped, 'Omitidos'],
            ].map(([v, label]) => (
              <div key={label} className="card-sm text-center">
                <p className="text-2xl font-bold text-white">{v}</p>
                <p className="text-[11px] text-white/45 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="card p-0 hover:translate-y-0">
            <p className="px-4 py-3 text-sm font-semibold text-white border-b border-white/5">Destinatarios</p>
            {c.recurrence ? (
              <p className="px-4 py-8 text-sm text-white/40 text-center">
                Es una serie recurrente: cada corrida aparece en el listado como una campaña propia, con sus destinatarios.
              </p>
            ) : rows == null ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : rows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-white/40 text-center">Todavía no hay destinatarios: se arman al lanzar la campaña.</p>
            ) : (
              <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
                {rows.map(r => (
                  <div key={r.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-white/85 truncate">{r.name || r.phone}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.sent_at && <span className="text-[11px] text-white/30">{fmtDate(r.replied_at || r.sent_at)}</span>}
                        {r.handed_off ? <Badge variant="primary">Derivado</Badge> : null}
                        <Badge variant={RECIPIENT_STATUS[r.status]?.variant}>{RECIPIENT_STATUS[r.status]?.label || r.status}</Badge>
                      </div>
                    </div>
                    {r.message && <p className="text-xs text-white/50 mt-1.5 whitespace-pre-wrap">{r.message}</p>}
                    {r.error && <p className="text-[11px] text-red-300/70 mt-1">{r.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
const TABS = [['campaigns', 'Campañas'], ['summary', 'Resumen de Ventas'], ['reports', 'Reportes']]

export default function Campaigns() {
  const [tab, setTab] = useState('campaigns')
  const [campaigns, setCampaigns] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [instances, setInstances] = useState([])
  const [labels, setLabels] = useState([])
  const [stages, setStages] = useState([])
  const [modal, setModal] = useState(null)   // 'choose' | 'guided' | 'simple' | { edit } | { detail }
  const [busy, setBusy] = useState(false)
  const [tobiasOn, setTobiasOn] = useState(null)   // null = cargando
  async function toggleTobias() {
    const next = !tobiasOn
    setTobiasOn(next)
    try { setTobiasOn((await api.setTobiasEnabled(next)).enabled) }
    catch (e) { setTobiasOn(!next); setError(e.message) }
  }
  const [error, setError] = useState('')
  const hasRunning = campaigns.some(c => c.status === 'active' || c.status === 'scheduled')
  const loadRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([api.getCampaigns(), api.getCampaignSummary(30)])
      setCampaigns(list); setSummary(sum); setError('')
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [])
  loadRef.current = load

  useEffect(() => {
    load()
    api.getChannelInstances().then(d => setInstances(Array.isArray(d) ? d : (d?.instances || []))).catch(() => {})
    api.getLabels().then(d => setLabels(Array.isArray(d) ? d : [])).catch(() => {})
    api.getTobiasSettings().then(d => setTobiasOn(!!d.enabled)).catch(() => setTobiasOn(true))
    // Etapas de todos los embudos, sin repetir (el filtro compara por id de etapa)
    api.getFunnels().then(fs => {
      const seen = new Map()
      for (const f of (Array.isArray(fs) ? fs : [])) for (const st of (f.stages || [])) if (!seen.has(st.id)) seen.set(st.id, st)
      setStages([...seen.values()])
    }).catch(() => {})
  }, [load])

  // Mientras haya campañas en curso, refrescar el avance
  useEffect(() => {
    if (!hasRunning) return
    const t = setInterval(() => loadRef.current(), 20000)
    return () => clearInterval(t)
  }, [hasRunning])

  async function action(c, act) {
    if (act === 'finish' && !confirm(`¿Finalizar "${c.name}"? Los contactos pendientes no van a recibir el mensaje.`)) return
    setBusy(true)
    try { await api.campaignAction(c.id, act); await load() } catch (e) { setError(e.message) }
    setBusy(false)
  }

  async function remove(c) {
    if (!confirm(`¿Eliminar "${c.name}"? Se borra también su historial de envíos.`)) return
    setBusy(true)
    try { await api.deleteCampaign(c.id); await load() } catch (e) { setError(e.message) }
    setBusy(false)
  }

  function onSaved() { setModal(null); setTab('campaigns'); load() }
  const closeModal = useCallback(() => setModal(null), [])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-400/20 flex items-center justify-center shrink-0">
            <Megaphone size={22} className="text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Tobías</h1>
              <Badge variant="warning">BETA</Badge>
              <button type="button" role="switch" aria-checked={tobiasOn} aria-label="Activar o desactivar Tobías"
                onClick={toggleTobias} disabled={tobiasOn == null}
                className="ml-2 flex items-center gap-2 text-xs font-medium text-white/60 disabled:opacity-40">
                <span className={cn('w-10 h-[22px] rounded-full relative transition-colors', tobiasOn ? 'bg-emerald-500' : 'bg-white/15')}>
                  <span className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all', tobiasOn ? 'left-[21px]' : 'left-[3px]')} />
                </span>
                {tobiasOn ? 'Activo' : 'Pausado'}
              </button>
            </div>
            {tobiasOn === false && (
              <p className="text-[11px] text-amber-300/80 mt-0.5">Tobías está pausado: ninguna campaña envía mensajes hasta que lo actives.</p>
            )}
            <p className="text-sm text-white/60 font-medium">Gestor de campañas</p>
            <p className="text-sm text-white/40 mt-1">Va a buscar a los que se enfriaron y los trae de vuelta, uno por uno.</p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 bg-white/5 border border-white/5 rounded-lg px-2 py-1"><Snowflake size={11} /> Reactiva leads fríos</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 bg-white/5 border border-white/5 rounded-lg px-2 py-1"><Sparkles size={11} /> Personaliza cada mensaje con IA</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="w-9 h-9 rounded-xl bg-surface-50 border border-white/5 flex items-center justify-center text-white/40 hover:text-white" title="Actualizar">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setModal('choose')} className="btn-primary flex items-center gap-2">
            <Plus size={15} /> Nueva Campaña
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-white/5 mb-6">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('pb-3 text-sm font-medium border-b-2 -mb-px transition-colors uppercase tracking-wide',
              tab === k ? 'border-aria-500 text-white' : 'border-transparent text-white/40 hover:text-white/70')}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {tab === 'campaigns' && (
        <CampaignsTab campaigns={campaigns} loading={loading} busy={busy}
          onNew={() => setModal('choose')}
          onOpen={c => setModal({ detail: c })}
          onEdit={c => setModal({ edit: c })}
          onAction={action} onDelete={remove} />
      )}
      {tab === 'summary' && <SummaryTab summary={summary} />}
      {tab === 'reports' && <ReportsTab campaigns={campaigns} />}

      {modal === 'choose' && <ModeChooser onClose={closeModal} onPick={m => setModal(m)} />}
      {modal === 'guided' && <GuidedWizard instances={instances} labels={labels} stages={stages} onClose={closeModal} onSaved={onSaved} />}
      {modal === 'simple' && <SimpleCreate labels={labels} stages={stages} onClose={closeModal} onSaved={onSaved} />}
      {modal?.edit && <GuidedWizard campaign={modal.edit} instances={instances} labels={labels} stages={stages} onClose={closeModal} onSaved={onSaved} />}
      {modal?.detail && <CampaignDetail campaign={modal.detail} onClose={closeModal} />}
    </div>
  )
}
