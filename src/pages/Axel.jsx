import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import {
  ShieldCheck, Search, Sparkles, Users, TrendingDown, Plus, X, Loader2,
  Download, Trash2, Eye, AlertCircle, Info, Clock, Database,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
function toDateInput(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }
function defaultRange() {
  const to = new Date(), from = new Date()
  from.setMonth(from.getMonth() - 1)
  return { from: toDateInput(from), to: toDateInput(to) }
}
// Rango del formulario (fechas locales) → epoch en segundos, con el "hasta" inclusivo
function rangeToEpoch({ from, to }) {
  return {
    from: Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000),
    to: Math.floor(new Date(`${to}T23:59:59`).getTime() / 1000),
  }
}
function fmtDay(ts) { return new Date(ts * 1000).toLocaleDateString('es-AR') }
function fmtDuration(secs) {
  if (secs == null) return '—'
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min`
  if (secs < 86400) return `${Math.round(secs / 360) / 10} h`
  return `${Math.round(secs / 8640) / 10} d`
}
const inputCls = 'bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-aria-500/60 transition-colors'

function TabBar({ tabs, value, onChange, small }) {
  return (
    <div className={cn('flex gap-6 border-b border-white/5', small ? 'mb-4' : 'mb-6')}>
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={cn('pb-3 font-medium border-b-2 -mb-px transition-colors',
            small ? 'text-xs' : 'text-sm uppercase tracking-wide',
            value === k ? 'border-aria-500 text-white' : 'border-transparent text-white/40 hover:text-white/70')}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-3xl bg-surface-50 border border-white/10 rounded-2xl shadow-2xl animate-slide-in flex flex-col max-h-[92vh]">
        {children}
      </div>
    </div>
  )
}

// ── Reportes y Métricas → Vendedores ──────────────────────────────────────────
function SellersTab({ range, setRange, selected, setSelected, onAnalyze }) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState({ q: '', range })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setData(null); setError('')
    try { setData(await api.getAxelSellers({ ...rangeToEpoch(query.range), q: query.q })) }
    catch (e) { setError(e.message); setData({ sellers: [] }) }
  }, [query])
  useEffect(() => { load() }, [load])

  const sellers = data?.sellers || []
  const allSelected = sellers.length > 0 && sellers.every(s => selected.includes(s.id))
  const toggle = id => setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  const th = 'px-3 py-3 text-left text-[11px] font-medium text-white/40 uppercase tracking-wide whitespace-nowrap'
  const td = 'px-3 py-3 text-sm text-white/80 whitespace-nowrap'

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); setQuery({ q, range }) }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
          <input className={cn(inputCls, 'w-full pl-9')} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar vendedor" aria-label="Buscar vendedor" />
        </div>
        <label className="text-[11px] text-white/45">Desde
          <input type="date" className={cn(inputCls, 'block mt-1')} value={range.from} max={range.to}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="text-[11px] text-white/45">Hasta
          <input type="date" className={cn(inputCls, 'block mt-1')} value={range.to} min={range.from}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
        </label>
        <button type="submit" className="btn-ghost border border-white/10 flex items-center gap-2"><Search size={14} /> Buscar</button>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-white/45">{sellers.length} vendedor{sellers.length === 1 ? '' : 'es'}</span>
          <button type="button" onClick={onAnalyze} disabled={!selected.length}
            title={selected.length ? '' : 'Tildá vendedores en la tabla'}
            className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <Sparkles size={14} /> Análisis Profundo ({selected.length})
          </button>
        </div>
      </form>

      {error && <p className="text-xs text-red-300 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>}

      <div className="card p-0 overflow-x-auto hover:translate-y-0">
        {data == null ? (
          <div className="flex justify-center py-14"><Spinner className="w-6 h-6" /></div>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-14">No hay vendedores que coincidan con la búsqueda.</p>
        ) : (
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-white/5">
              <tr>
                <th className={cn(th, 'w-10')}>
                  <input type="checkbox" className="accent-[#3355ff]" aria-label="Seleccionar todos" checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : sellers.map(s => s.id))} />
                </th>
                <th className={th}>Vendedor</th>
                <th className={th}>Convers.</th>
                <th className={th}>Oport.</th>
                <th className={th}>1ª resp.</th>
                <th className={th}>Sin resp. &gt;{data?.risk_hours ?? 48}h</th>
                <th className={th}>SLA venc.</th>
                <th className={th}>Cumplimiento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sellers.map(s => (
                <tr key={s.id} className={cn('hover:bg-white/[0.02]', selected.includes(s.id) && 'bg-aria-500/5')}>
                  <td className={td}>
                    <input type="checkbox" className="accent-[#3355ff]" aria-label={`Seleccionar ${s.name}`}
                      checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                  </td>
                  <td className={cn(td, 'text-white font-medium')}>
                    {s.name}
                    <span className="block text-[11px] text-white/35 font-normal">{s.email}</span>
                  </td>
                  <td className={td}>{s.conversations}</td>
                  <td className={td}>{s.opportunities}</td>
                  <td className={td}>{fmtDuration(s.avg_first_reply)}</td>
                  <td className={cn(td, s.no_reply_48h ? 'text-amber-300' : '')}>{s.no_reply_48h}</td>
                  <td className={cn(td, s.sla_breached ? 'text-red-300' : '')}>{s.sla_breached}</td>
                  <td className={td}>
                    {s.compliance == null ? <span className="text-white/35">—</span> : (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className={cn('h-full rounded-full', s.compliance >= 80 ? 'bg-emerald-500' : s.compliance >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                            style={{ width: `${s.compliance}%` }} />
                        </div>
                        <span className="text-xs">{s.compliance}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-white/35 flex gap-1.5">
        <Info size={12} className="shrink-0 mt-0.5" />
        Se mide sobre las conversaciones derivadas a cada vendedor en el rango. SLA de primera respuesta: {Math.round((data?.sla_seconds ?? 7200) / 60)} min hábiles
        ({data?.work_start ?? '09:00'}–{data?.work_end ?? '18:00'}). Los tiempos de respuesta se registran desde que se activó Axel.
      </p>
    </div>
  )
}

function ComingSoon({ title }) {
  return (
    <div className="card text-center py-16 hover:translate-y-0">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="text-sm text-white/40 mt-1">En construcción.</p>
    </div>
  )
}

function ReportsTab(props) {
  const [sub, setSub] = useState('sellers')
  return (
    <div>
      <TabBar small value={sub} onChange={setSub}
        tabs={[['sellers', 'Vendedores'], ['team', 'Métricas del Equipo'], ['performance', 'Desempeño']]} />
      {sub === 'sellers' && <SellersTab {...props} />}
      {sub === 'team' && <ComingSoon title="Métricas del Equipo" />}
      {sub === 'performance' && <ComingSoon title="Desempeño" />}
    </div>
  )
}

// ── Análisis profundo ─────────────────────────────────────────────────────────
function NewAnalysis({ range, setRange, selectedSellers, onCancel, onCreated }) {
  const [question, setQuestion] = useState('')
  const [config, setConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { api.getAxelConfig().then(setConfig).catch(() => {}) }, [])

  async function run() {
    if (!selectedSellers.length) return setError('Seleccioná al menos un vendedor desde la tabla de Vendedores')
    setSaving(true); setError('')
    try {
      await api.createAxelAnalyses({ seller_ids: selectedSellers.map(s => s.id), ...rangeToEpoch(range), question })
      onCreated()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  return (
    <div className="card hover:translate-y-0 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={15} className="text-aria-300" /> Análisis profundo</p>
        <button onClick={onCancel} className="text-white/40 hover:text-white p-1" aria-label="Cerrar"><X size={16} /></button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-[11px] text-white/45">Desde
          <input type="date" className={cn(inputCls, 'block mt-1')} value={range.from} max={range.to}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="text-[11px] text-white/45">Hasta
          <input type="date" className={cn(inputCls, 'block mt-1')} value={range.to} min={range.from}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
        </label>
      </div>

      <div>
        <p className="text-[11px] text-white/45 mb-1.5">Vendedores</p>
        {selectedSellers.length === 0
          ? <p className="text-xs text-amber-300/80">Ninguno seleccionado: tildalos en Reportes y Métricas → Vendedores.</p>
          : <div className="flex flex-wrap gap-1.5">{selectedSellers.map(s => <Badge key={s.id} variant="primary">{s.name}</Badge>)}</div>}
      </div>

      {config && (
        <div>
          <p className="text-[11px] text-white/45 mb-1.5">Variables que se analizan</p>
          <div className="flex flex-wrap gap-1.5">{config.dimensions.map(d => <Badge key={d.label}>{d.label}</Badge>)}</div>
        </div>
      )}

      <label className="block">
        <span className="block text-xs text-white/60 mb-1.5">
          Agregá cualquier pregunta sin que exista como dimensión configurada — se analiza junto a las demás, sobre los vendedores y el rango seleccionados
        </span>
        <textarea rows={3} className={cn(inputCls, 'w-full')} value={question} maxLength={1000}
          onChange={e => setQuestion(e.target.value)} placeholder="Ej: ¿Cómo se relaciona con mis reglas?" />
      </label>

      <p className="text-[11px] text-white/40 flex gap-1.5">
        <Info size={12} className="shrink-0 mt-0.5" />
        Los datos duros para el rango de fechas se inyectan automáticamente: la IA interpreta, no calcula. Un análisis por vendedor.
      </p>

      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end">
        <button onClick={run} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Ejecutar análisis
        </button>
      </div>
    </div>
  )
}

function AnalysisViewer({ id, onClose }) {
  const [a, setA] = useState(null)
  useEffect(() => { api.getAxelAnalysis(id).then(setA).catch(() => setA({ error: 'No se pudo cargar' })) }, [id])
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/5">
        <div>
          <h2 className="text-lg font-semibold text-white">{a?.seller_name || 'Análisis'}</h2>
          {a?.range_from && <p className="text-xs text-white/40 mt-0.5">{fmtDay(a.range_from)} — {fmtDay(a.range_to)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {a?.status === 'done' && (
            <a href={api.axelExportUrl(id)} className="btn-ghost border border-white/10 flex items-center gap-1.5 text-xs">
              <Download size={13} /> .txt
            </a>
          )}
          <button onClick={onClose} className="text-white/40 hover:text-white p-1" aria-label="Cerrar"><X size={18} /></button>
        </div>
      </div>
      <div className="px-6 py-5 overflow-y-auto">
        {!a ? <div className="flex justify-center py-10"><Spinner /></div>
          : a.status === 'error' || a.error ? <p className="text-sm text-red-300">{a.error}</p>
          : a.status === 'running' ? <p className="text-sm text-white/50 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> En curso…</p>
          : (
            <>
              {a.question && <p className="text-xs text-white/50 mb-4"><b className="text-white/70">Pregunta adicional:</b> {a.question}</p>}
              <div className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">{a.result}</div>
            </>
          )}
      </div>
    </Modal>
  )
}

function AnalysisTab({ range, setRange, selectedSellers, openNew, setOpenNew }) {
  const [rows, setRows] = useState(null)
  const [viewing, setViewing] = useState(null)
  const load = useCallback(() => api.getAxelAnalyses().then(setRows).catch(() => setRows([])), [])
  useEffect(() => { load() }, [load])
  // Mientras haya análisis en curso, refrescar
  const running = rows?.some(r => r.status === 'running')
  useEffect(() => {
    if (!running) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [running, load])

  async function remove(r) {
    if (!confirm(`¿Eliminar el análisis de ${r.seller_name}?`)) return
    await api.deleteAxelAnalysis(r.id).catch(() => {})
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white flex items-center gap-2">Análisis profundo <Badge variant="primary"><Sparkles size={10} /> IA</Badge></p>
          <p className="text-xs text-white/45 mt-0.5">
            Análisis semántico bajo demanda, organizado por variable. Cada análisis queda guardado en base de datos y se exporta como .txt.
          </p>
        </div>
        {!openNew && (
          <button onClick={() => setOpenNew(true)} className="btn-primary flex items-center gap-2"><Plus size={15} /> Nuevo análisis</button>
        )}
      </div>

      {openNew && (
        <NewAnalysis range={range} setRange={setRange} selectedSellers={selectedSellers}
          onCancel={() => setOpenNew(false)} onCreated={() => { setOpenNew(false); load() }} />
      )}

      {rows == null ? (
        <div className="flex justify-center py-14"><Spinner className="w-6 h-6" /></div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-14 hover:translate-y-0">
          <Sparkles size={22} className="text-white/25 mx-auto mb-3" />
          <p className="text-sm text-white/60">Todavía no hay análisis guardados.</p>
          <p className="text-xs text-white/40 mt-1">Seleccioná un vendedor desde la tabla para crear uno.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="card-sm flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate">{r.seller_name}</p>
                  {r.status === 'running' && <Badge variant="info"><Loader2 size={10} className="animate-spin" /> En curso</Badge>}
                  {r.status === 'done' && <Badge variant="success">Listo</Badge>}
                  {r.status === 'error' && <Badge variant="danger">Error</Badge>}
                </div>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {fmtDay(r.range_from)} — {fmtDay(r.range_to)} · creado {new Date(r.created_at * 1000).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  {r.question ? ` · "${r.question}"` : ''}
                </p>
                {r.status === 'done' && r.excerpt && <p className="text-xs text-white/50 mt-1 line-clamp-2">{r.excerpt}</p>}
                {r.status === 'error' && <p className="text-xs text-red-300/80 mt-1">{r.error}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {r.status === 'done' && (
                  <>
                    <button onClick={() => setViewing(r.id)} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5" title="Ver"><Eye size={15} /></button>
                    <a href={api.axelExportUrl(r.id)} className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/5" title="Exportar .txt"><Download size={15} /></a>
                  </>
                )}
                <button onClick={() => remove(r)} className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5" title="Eliminar"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && <AnalysisViewer id={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ── Configuración ─────────────────────────────────────────────────────────────
const DEFAULT_DIMENSION_LABELS = ['Velocidad de respuesta', 'Calidad de la atención', 'Manejo de objeciones', 'Seguimiento y cierre']
const WEEKDAYS = [
  { day: 1, letter: 'L', name: 'Lunes' }, { day: 2, letter: 'M', name: 'Martes' },
  { day: 3, letter: 'X', name: 'Miércoles' }, { day: 4, letter: 'J', name: 'Jueves' },
  { day: 5, letter: 'V', name: 'Viernes' }, { day: 6, letter: 'S', name: 'Sábado' },
  { day: 0, letter: 'D', name: 'Domingo' },
]

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('w-10 h-[22px] rounded-full relative transition-colors shrink-0', on ? 'bg-emerald-500' : 'bg-white/15')}>
      <span className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all', on ? 'left-[21px]' : 'left-[3px]')} />
    </button>
  )
}

function ConfigTab() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)   // { ok, text }
  useEffect(() => { api.getAxelConfig().then(setCfg).catch(() => setCfg(null)) }, [])
  if (!cfg) return <div className="flex justify-center py-14"><Spinner className="w-6 h-6" /></div>

  const sc = cfg.schedule
  const setSc = patch => { setCfg(c => ({ ...c, schedule: { ...c.schedule, ...patch } })); setMsg(null) }
  const toggleDay = d => setSc({ days: sc.days.includes(d) ? sc.days.filter(x => x !== d) : [...sc.days, d] })
  const vars = cfg.custom_dimensions || []
  const setVars = next => { setCfg(c => ({ ...c, custom_dimensions: next })); setMsg(null) }
  const updateVar = (i, patch) => setVars(vars.map((v, k) => (k === i ? { ...v, ...patch } : v)))
  const removeVar = i => setVars(vars.filter((_, k) => k !== i))
  const addVar = () => setVars([...vars, { label: '', entity: 'conversations', rule: '' }])
  const varsInvalid = vars.some(v => !v.label.trim())
  const weeklyInvalid = (sc.enabled && sc.frequency === 'weekly' && sc.days.length === 0) || cfg.work_days.length === 0 || varsInvalid

  async function save() {
    if (weeklyInvalid) return
    setSaving(true); setMsg(null)
    try {
      setCfg(await api.updateAxelConfig({
        schedule: sc, work_start: cfg.work_start, work_end: cfg.work_end, work_days: cfg.work_days,
        sla_seconds: cfg.sla_seconds, risk_hours: cfg.risk_hours, dimensions: vars,
      }))
      setMsg({ ok: true, text: 'Configuración guardada' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      {/* Ejecución programada */}
      <div className="card hover:translate-y-0 space-y-4">
        <div className="flex items-start gap-3">
          <Clock size={18} className="text-aria-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Ejecución programada</p>
            <p className="text-xs text-white/45 mt-0.5">Programá qué días el agente analiza automáticamente a todos los vendedores.</p>
          </div>
          <Switch on={sc.enabled} onChange={v => setSc({ enabled: v })} label="Ejecución programada" />
        </div>
        {sc.enabled && (
          <div className="pl-8 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <select className={inputCls} value={sc.frequency} aria-label="Frecuencia"
                onChange={e => setSc({ frequency: e.target.value })}>
                <option value="daily">Todos los días</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
              {sc.frequency === 'daily' && <span className="text-sm text-white/70">Todos los días</span>}
              {sc.frequency === 'weekly' && (
                <div className="flex gap-1.5">
                  {WEEKDAYS.map(w => (
                    <button key={w.day} type="button" title={w.name} aria-label={w.name} aria-pressed={sc.days.includes(w.day)}
                      onClick={() => toggleDay(w.day)}
                      className={cn('w-9 h-9 rounded-lg text-xs font-semibold border transition-colors',
                        sc.days.includes(w.day) ? 'bg-aria-500 border-aria-500 text-white' : 'bg-white/5 border-white/10 text-white/45 hover:text-white')}>
                      {w.letter}
                    </button>
                  ))}
                </div>
              )}
              {sc.frequency === 'monthly' && (
                <label className="flex items-center gap-2 text-sm text-white/70">
                  El día
                  <select className={inputCls} value={sc.month_day} onChange={e => setSc({ month_day: Number(e.target.value) })}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  de cada mes
                </label>
              )}
            </div>
            {weeklyInvalid && <p className="text-xs text-red-300/80">Elegí al menos un día de la semana</p>}
            <p className="text-[11px] text-white/35">
              Corre a las 8:00 (hora de Argentina) y analiza {sc.frequency === 'daily' ? 'el día' : sc.frequency === 'weekly' ? 'la última semana' : 'el último mes'}. Los análisis aparecen en Análisis Profundo.
            </p>
          </div>
        )}
      </div>

      {/* Métricas duras */}
      <div className="card hover:translate-y-0 space-y-4">
        <div className="flex items-start gap-3">
          <Database size={18} className="text-aria-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">Métricas duras · pipeline determinístico</p>
            <p className="text-xs text-white/45 mt-0.5">Afecta el cálculo de tiempos, SLA y reglas de proceso. No involucra IA.</p>
          </div>
        </div>
        <div className="pl-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['work_start', 'Inicio horario laboral', 'time', '09:00'],
            ['work_end', 'Fin horario laboral', 'time', '18:00'],
            ['sla_seconds', 'SLA 1ª respuesta (seg)', 'number', '7200'],
            ['risk_hours', 'Inactividad "en riesgo" (h)', 'number', '48'],
          ].map(([key, label, type, ph]) => (
            <label key={key} className="text-[11px] text-white/50">
              {label}
              <input type={type} min={type === 'number' ? 1 : undefined} placeholder={ph}
                className={cn(inputCls, 'block w-full mt-1')} value={cfg[key] ?? ''}
                onChange={e => { setCfg(c => ({ ...c, [key]: e.target.value })); setMsg(null) }} />
            </label>
          ))}
        </div>
        <div className="pl-8">
          <p className="text-[11px] text-white/50 mb-1.5">Días laborables</p>
          <div className="flex gap-1.5">
            {WEEKDAYS.map(w => {
              const on = cfg.work_days.includes(w.day)
              return (
                <button key={w.day} type="button" title={w.name} aria-label={w.name} aria-pressed={on}
                  onClick={() => { setCfg(c => ({ ...c, work_days: on ? c.work_days.filter(x => x !== w.day) : [...c.work_days, w.day] })); setMsg(null) }}
                  className={cn('w-9 h-9 rounded-lg text-xs font-semibold border transition-colors',
                    on ? 'bg-aria-500 border-aria-500 text-white' : 'bg-white/5 border-white/10 text-white/45 hover:text-white')}>
                  {w.letter}
                </button>
              )
            })}
          </div>
          {cfg.work_days.length === 0 && <p className="text-xs text-red-300/80 mt-1.5">Elegí al menos un día laborable</p>}
          <p className="text-[11px] text-white/35 mt-2">
            Los tiempos de respuesta y el SLA cuentan solo dentro del horario y los días laborables.
          </p>
        </div>
      </div>

      {/* Variables del análisis profundo */}
      <div className="card hover:translate-y-0 space-y-4">
        <div className="flex items-start gap-3">
          <Sparkles size={18} className="text-aria-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">Variables del análisis profundo</p>
            <p className="text-xs text-white/45 mt-0.5">
              Variables permanentes que el agente evalúa en cada análisis. La regla es la instrucción que se le da al agente (no una descripción): escribila como un criterio claro de qué debería hacer el vendedor.
            </p>
          </div>
        </div>
        <div className="pl-8 space-y-3">
          {vars.length === 0 && (
            <p className="text-xs text-white/40 px-3 py-3 rounded-xl border border-dashed border-white/10">
              Sin variables propias: se usan las de por defecto ({DEFAULT_DIMENSION_LABELS.join(', ')}).
            </p>
          )}
          {vars.map((v, i) => (
            <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-aria-500/20 text-aria-200 text-xs font-semibold flex items-center justify-center shrink-0 mt-5">{i + 1}</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
                  <label className="text-[11px] text-white/50">Etiqueta
                    <input list="axel-dimension-labels" className={cn(inputCls, 'block w-full mt-1')} value={v.label} maxLength={120}
                      placeholder="Nueva dimensión" onChange={e => updateVar(i, { label: e.target.value })} />
                  </label>
                  <label className="text-[11px] text-white/50">Entidad
                    <select className={cn(inputCls, 'block w-full mt-1')} value={v.entity} onChange={e => updateVar(i, { entity: e.target.value })}>
                      <option value="conversations">Conversaciones</option>
                      <option value="tasks">Tareas</option>
                      <option value="opportunities">Oportunidades</option>
                    </select>
                  </label>
                </div>
                <button type="button" onClick={() => removeVar(i)} aria-label={`Quitar variable ${i + 1}`}
                  className="p-2 mt-5 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 shrink-0"><Trash2 size={14} /></button>
              </div>
              <label className="block text-[11px] text-white/50 pl-10">Regla de evaluación
                <textarea rows={2} className={cn(inputCls, 'block w-full mt-1')} value={v.rule} maxLength={1000}
                  placeholder="Describí las señales que indican alta intención de compra" onChange={e => updateVar(i, { rule: e.target.value })} />
              </label>
            </div>
          ))}
          <datalist id="axel-dimension-labels">
            {DEFAULT_DIMENSION_LABELS.map(l => <option key={l} value={l} />)}
          </datalist>
          <button type="button" onClick={addVar} disabled={vars.length >= 20}
            className="flex items-center gap-1.5 text-sm font-medium text-aria-300 hover:text-aria-200 disabled:opacity-40">
            <Plus size={14} /> Agregar variable
          </button>
          {varsInvalid && <p className="text-xs text-red-300/80">Cada variable necesita una etiqueta</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className={cn('text-xs', msg.ok ? 'text-emerald-300' : 'text-red-300')}>{msg.text}</span>}
        <button onClick={save} disabled={saving || weeklyInvalid} className="btn-primary flex items-center gap-2 disabled:opacity-40">
          {saving && <Loader2 size={14} className="animate-spin" />} Guardar configuración
        </button>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Axel() {
  const [tab, setTab] = useState('reports')
  const [range, setRange] = useState(defaultRange)
  const [selected, setSelected] = useState([])          // ids de vendedores tildados
  const [sellerNames, setSellerNames] = useState({})    // id → nombre (para el formulario de análisis)
  const [openNew, setOpenNew] = useState(false)

  // Nombres de todos los vendedores, para mostrar los seleccionados en el análisis
  useEffect(() => {
    api.getAxelSellers({ ...rangeToEpoch(defaultRange()) })
      .then(d => setSellerNames(Object.fromEntries((d.sellers || []).map(s => [s.id, s.name]))))
      .catch(() => {})
  }, [])
  const selectedSellers = selected.map(id => ({ id, name: sellerNames[id] || 'Vendedor' }))

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/20 border border-sky-400/20 flex items-center justify-center shrink-0">
          <ShieldCheck size={22} className="text-sky-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Axel</h1>
            <Badge variant="warning">BETA</Badge>
          </div>
          <p className="text-sm text-white/60 font-medium">Auditor comercial</p>
          <p className="text-sm text-white/40 mt-1">Mira vender a tu equipo y te dice, sin vueltas, por qué se te escapan las ventas.</p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 bg-white/5 border border-white/5 rounded-lg px-2 py-1"><Users size={11} /> Auditoría por vendedor</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 bg-white/5 border border-white/5 rounded-lg px-2 py-1"><TrendingDown size={11} /> Fugas del proceso</span>
          </div>
        </div>
      </div>

      <TabBar value={tab} onChange={setTab}
        tabs={[['reports', 'Reportes y Métricas'], ['analysis', 'Análisis Profundo'], ['config', 'Configuración']]} />

      {tab === 'reports' && (
        <ReportsTab range={range} setRange={setRange} selected={selected} setSelected={setSelected}
          onAnalyze={() => { setOpenNew(true); setTab('analysis') }} />
      )}
      {tab === 'analysis' && (
        <AnalysisTab range={range} setRange={setRange} selectedSellers={selectedSellers}
          openNew={openNew} setOpenNew={setOpenNew} />
      )}
      {tab === 'config' && <ConfigTab />}
    </div>
  )
}
