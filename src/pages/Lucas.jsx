import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Spinner } from '../components/ui/Spinner'
import {
  Brain, Snowflake, Thermometer, Flame, RefreshCw, Loader2, Info, MessageSquareText, Gauge, Filter,
  Users, TrendingUp, TrendingDown, Minus, ThumbsUp, PieChart, BarChart3, Megaphone, Tag,
  Clock, Save, Check, Target, Sparkles, Sun, Radio,
} from 'lucide-react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const pad2 = n => String(n).padStart(2, '0')
const toDateInput = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
function defaultPeriod() {
  const to = new Date(), from = new Date()
  from.setMonth(from.getMonth() - 1)
  return { from: toDateInput(from), to: toDateInput(to) }
}
// Período del formulario → epoch en segundos, con el "hasta" inclusivo
const periodToEpoch = p => ({
  from: Math.floor(new Date(`${p.from}T00:00:00`).getTime() / 1000),
  to: Math.floor(new Date(`${p.to}T23:59:59`).getTime() / 1000),
})
const dateCls = 'bg-surface border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-aria-500/60'

const TEMP = {
  frio:     { label: 'Frío',     icon: Snowflake,   cls: 'text-sky-300',   bg: 'bg-sky-500/10' },
  tibio:    { label: 'Tibio',    icon: Thermometer, cls: 'text-amber-300', bg: 'bg-amber-500/10' },
  caliente: { label: 'Caliente', icon: Flame,       cls: 'text-red-300',   bg: 'bg-red-500/10' },
}

function TabBar({ tabs, value, onChange }) {
  return (
    <div className="flex gap-6 border-b border-white/5 mb-6">
      {tabs.map(([k, label]) => (
        <button key={k} onClick={() => onChange(k)}
          className={cn('pb-3 text-sm font-medium uppercase tracking-wide border-b-2 -mb-px transition-colors',
            value === k ? 'border-aria-500 text-white' : 'border-transparent text-white/40 hover:text-white/70')}>
          {label}
        </button>
      ))}
    </div>
  )
}

// Variación contra el período anterior de igual duración: verde si sube, rojo si baja, amarillo si igual
function Delta({ current, previous }) {
  if (previous == null || current == null) return null
  const pct = previous ? Math.round(((current - previous) / previous) * 1000) / 10 : (current ? 100 : 0)
  const up = current > previous, down = current < previous
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold',
      up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-amber-300')}
      title={`Período anterior: ${previous}`}>
      <Icon size={13} /> {up ? '▲' : down ? '▼' : '▬'} {Math.abs(pct)}%
    </span>
  )
}

// Tarjeta con la participación sobre un total ("X% del total") en lugar de la variación
function ShareCard({ icon: Icon, value, total, label }) {
  const pct = total ? Math.round((value / total) * 1000) / 10 : 0
  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-lg bg-aria-500/15 flex items-center justify-center"><Icon size={16} className="text-aria-300" /></div>
        <span className="text-xs text-white/45">{value == null ? '' : `${pct}% del total`}</span>
      </div>
      <p className="text-3xl font-bold text-white mt-3">{value ?? '—'}</p>
      <p className="text-xs text-white/45 mt-0.5">{label}</p>
    </div>
  )
}

function DeltaCard({ icon: Icon, value, previous, label }) {
  return (
    <div className="card-sm">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-lg bg-aria-500/15 flex items-center justify-center"><Icon size={16} className="text-aria-300" /></div>
        <Delta current={value} previous={previous} />
      </div>
      <p className="text-3xl font-bold text-white mt-3">{value ?? '—'}</p>
      <p className="text-xs text-white/45 mt-0.5">{label}</p>
    </div>
  )
}

// Volumen diario: barras apiladas por temperatura (eje izq.) + score promedio (línea, eje der. 0–100)
const DAILY_SERIES = [
  { key: 'avg_score', label: 'Score prom.', color: '#a78bfa' },
  { key: 'frio',      label: 'Frío',        color: '#10b981' },
  { key: 'caliente',  label: 'Caliente',    color: '#ef4444' },
  { key: 'tibio',     label: 'Tibio',       color: '#fbbf24' },
]

// Rellena los días del período sin calificaciones para que el eje X muestre todo el rango
function fillDays(period, rows) {
  const byDay = Object.fromEntries((rows || []).map(r => [r.day, r]))
  const out = []
  const d = new Date(`${period.from}T12:00:00`), end = new Date(`${period.to}T12:00:00`)
  for (let i = 0; d <= end && i < 400; i++, d.setDate(d.getDate() + 1)) {
    const key = toDateInput(d)
    out.push({
      day: key, label: d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
      frio: 0, tibio: 0, caliente: 0, avg_score: null, ...byDay[key],
    })
  }
  return out
}

function DailyChart({ data }) {
  return (
    <div className="card hover:translate-y-0">
      <div className="flex items-start gap-3 mb-4">
        <BarChart3 size={18} className="text-aria-300 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Volumen de leads por día</p>
          <p className="text-xs text-white/45">Estado actual de leads (temperatura + score promedio diario)</p>
        </div>
      </div>
      {data == null ? (
        <div className="flex justify-center items-center h-56"><Spinner /></div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={12} />
              <YAxis yAxisId="n" allowDecimals={false} domain={[0, dataMax => Math.max(4, dataMax)]}
                tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="score" orientation="right" domain={[0, 100]} hide />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.7)' }} />
              <Bar yAxisId="n" dataKey="frio" name="Frío" stackId="t" fill="#10b981" />
              <Bar yAxisId="n" dataKey="tibio" name="Tibio" stackId="t" fill="#fbbf24" />
              <Bar yAxisId="n" dataKey="caliente" name="Caliente" stackId="t" fill="#ef4444" radius={[3, 3, 0, 0]} />
              <Line yAxisId="score" dataKey="avg_score" name="Score prom." stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap gap-4 mt-3">
        {DAILY_SERIES.map(s => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-white/55">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <Icon size={18} className="text-aria-300 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {desc && <p className="text-xs text-white/45">{desc}</p>}
      </div>
    </div>
  )
}

function OriginQuality({ rows }) {
  return (
    <div className="card hover:translate-y-0">
      <SectionHeader icon={Megaphone} title="Calidad por origen" desc="Qué canal trae los mejores leads — dónde conviene invertir" />
      {rows == null ? <div className="flex justify-center py-8"><Spinner /></div>
        : rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-white/55">No hay datos de origen disponibles.</p>
            <p className="text-xs text-white/35 mt-1">Los datos aparecen cuando los contactos llegan por anuncios de Click to WhatsApp.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="border-b border-white/5">
                <tr className="text-left text-[11px] text-white/40 uppercase tracking-wide">
                  <th className="py-2 pr-3 font-medium">Origen</th>
                  <th className="py-2 px-3 font-medium">Leads</th>
                  <th className="py-2 px-3 font-medium">Calientes</th>
                  <th className="py-2 px-3 font-medium">Score prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map(r => (
                  <tr key={r.origin} className="text-sm text-white/80">
                    <td className="py-2.5 pr-3 font-medium text-white truncate max-w-[280px]">
                      {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="hover:text-aria-300">{r.origin}</a> : r.origin}
                    </td>
                    <td className="py-2.5 px-3">{r.leads}</td>
                    <td className="py-2.5 px-3">{r.hot} <span className="text-xs text-white/40">({r.hot_pct}%)</span></td>
                    <td className="py-2.5 px-3 font-semibold text-white">{r.avg_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

function HotLeads({ rows }) {
  return (
    <div className="card hover:translate-y-0">
      <SectionHeader icon={ThumbsUp} title="Leads calientes recientes" desc="Conversaciones con mayor temperatura" />
      {rows == null ? <div className="flex justify-center py-8"><Spinner /></div>
        : rows.length === 0 ? <p className="text-sm text-white/45 text-center py-8">No hay leads calientes recientes</p>
        : (
          <div className="divide-y divide-white/5">
            {rows.map(r => (
              <div key={r.contact_id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/85 truncate">{r.name || r.phone}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-white/35">{new Date(r.updated_at * 1000).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                    <span className="flex items-center gap-1 text-sm font-semibold text-red-300"><Flame size={12} /> {r.score}</span>
                  </span>
                </div>
                {r.reasoning && <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{r.reasoning}</p>}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

function SmartTags({ rows }) {
  const max = Math.max(1, ...(rows || []).map(r => r.count))
  return (
    <div className="card hover:translate-y-0">
      <SectionHeader icon={Tag} title="Smart Tags" desc="Tags configuradas y cantidad de contactos asignados" />
      {rows == null ? <div className="flex justify-center py-8"><Spinner /></div>
        : rows.length === 0 ? <p className="text-sm text-white/45 text-center py-8">No hay Smart Tags configuradas</p>
        : (
          <div className="space-y-2.5">
            {rows.map(r => (
              <div key={r.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/80 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color || '#6366f1' }} /> {r.tag}
                  </span>
                  <span className="text-xs text-white/55 shrink-0 ml-3">{r.count} contacto{r.count === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-1 ml-[18px] h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: r.color || '#6366f1' }} />
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ── Reportes y Métricas ───────────────────────────────────────────────────────
function ReportsTab({ enabled }) {
  const [summary, setSummary] = useState(null)
  const [top, setTop] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [daily, setDaily] = useState(null)
  const [origins, setOrigins] = useState(null)
  const [hot, setHot] = useState(null)
  const [tags, setTags] = useState(null)
  const [running, setRunning] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod)
  const [applied, setApplied] = useState(period)   // período del último "Filtrar"
  const load = useCallback(() => {
    const range = periodToEpoch(applied)
    setSummary(null); setTop(null); setMetrics(null); setDaily(null); setOrigins(null); setHot(null); setTags(null)
    api.getLucasOrigins(range).then(setOrigins).catch(() => setOrigins([]))
    api.getLucasHot(range).then(setHot).catch(() => setHot([]))
    api.getLucasTags(range).then(setTags).catch(() => setTags([]))
    api.getLucasDaily(range).then(rows => setDaily(fillDays(applied, rows))).catch(() => setDaily(fillDays(applied, [])))
    api.getLucasMetrics(range).then(setMetrics).catch(() => setMetrics({}))
    api.getAiScoringSummary(range).then(setSummary).catch(() => setSummary({ frio: 0, tibio: 0, caliente: 0 }))
    api.getAiScoringTop(50, range).then(setTop).catch(() => setTop([]))
  }, [applied])
  useEffect(() => { load() }, [load])

  async function runNow() {
    setRunning(true)
    try { await api.runAiScoringNow() } catch {}
    setTimeout(() => { load(); setRunning(false) }, 4000)
  }

  const total = summary ? summary.frio + summary.tibio + summary.caliente : 0
  return (
    <div className="space-y-6">
      {!enabled && (
        <p className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200">
          <Info size={14} /> Lucas está desactivado: no analiza conversaciones nuevas. Activalo en Configuración.
        </p>
      )}

      <form className="flex flex-wrap items-center gap-3" onSubmit={e => { e.preventDefault(); setApplied(period) }}>
        <span className="text-sm text-white/60">Período</span>
        <input type="date" aria-label="Desde" className={dateCls} value={period.from} max={period.to}
          onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} />
        <span className="text-sm text-white/60">hasta</span>
        <input type="date" aria-label="Hasta" className={dateCls} value={period.to} min={period.from}
          onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} />
        <button type="submit" className="btn-ghost border border-white/10 flex items-center gap-2"><Filter size={14} /> Filtrar</button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DeltaCard icon={Users} label="Conversaciones creadas en el período"
          value={metrics?.conversations_created?.current} previous={metrics?.conversations_created?.previous} />
        <ShareCard icon={ThumbsUp} label="Leads calientes" value={summary ? summary.caliente : null} total={total} />
        <DeltaCard icon={PieChart} label="Score promedio"
          value={metrics?.avg_score?.current} previous={metrics?.avg_score?.previous} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card hover:translate-y-0">
          <div className="flex items-start gap-3 mb-4">
            <Thermometer size={18} className="text-aria-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Distribución por temperatura</p>
              <p className="text-xs text-white/45">Cómo se clasifican los leads</p>
            </div>
          </div>
          <div className="space-y-3">
            {[['caliente', 'Caliente', 'bg-red-500'], ['tibio', 'Tibio', 'bg-amber-400'], ['frio', 'Frío', 'bg-emerald-500']].map(([k, label, dot]) => {
              const n = summary ? summary[k] : null
              const pct = summary && total ? Math.round((n / total) * 1000) / 10 : 0
              return (
                <div key={k}>
                  <div className="flex items-center gap-2.5">
                    <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', dot)} />
                    <span className="flex-1 text-sm text-white/80">{label}</span>
                    <span className="text-sm font-semibold text-white w-10 text-right">{n ?? '—'}</span>
                    <span className="text-xs text-white/45 w-12 text-right">{pct}%</span>
                  </div>
                  <div className="ml-5 mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={cn('h-full rounded-full', dot)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <DailyChart data={daily} />
      </div>

      <OriginQuality rows={origins} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HotLeads rows={hot} />
        <SmartTags rows={tags} />
      </div>

      <div className="card p-0 hover:translate-y-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <p className="text-sm font-semibold text-white">Score de cada lead</p>
          <button onClick={runNow} disabled={running || !enabled} className="btn-ghost border border-white/10 flex items-center gap-2 text-xs disabled:opacity-40">
            {running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Analizar ahora
          </button>
        </div>
        {top == null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : top.length === 0 ? (
          <p className="text-sm text-white/40 text-center py-12">Lucas todavía no calificó conversaciones.</p>
        ) : (
          <div className="divide-y divide-white/5 max-h-[560px] overflow-y-auto">
            {top.map(r => {
              const t = TEMP[r.temperature] || TEMP.frio
              return (
                <div key={r.contact_id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white/85 truncate">{r.name || r.phone}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('flex items-center gap-1 text-xs', t.cls)}><t.icon size={12} /> {t.label}</span>
                      <span className="text-sm font-semibold text-white w-8 text-right">{r.score}</span>
                    </div>
                  </div>
                  {r.reasoning && <p className="text-xs text-white/45 mt-1">{r.reasoning}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Configuración ─────────────────────────────────────────────────────────────
function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('w-10 h-[22px] rounded-full relative transition-colors shrink-0', on ? 'bg-emerald-500' : 'bg-white/15')}>
      <span className={cn('absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all', on ? 'left-[21px]' : 'left-[3px]')} />
    </button>
  )
}

// Sección de configuración con su propio guardado (disquete a la derecha)
function ConfigSection({ icon: Icon, title, desc, toggle, onSave, dirty, children }) {
  const [state, setState] = useState('idle')   // idle | saving | saved | error
  async function save() {
    setState('saving')
    try { await onSave(); setState('saved'); setTimeout(() => setState('idle'), 2000) }
    catch { setState('error') }
  }
  return (
    <div className="card hover:translate-y-0">
      <div className="flex items-start gap-3">
        <Icon size={18} className="text-aria-300 shrink-0 mt-0.5" />
        {toggle}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          {desc && <p className="text-xs text-white/45 mt-0.5">{desc}</p>}
        </div>
        <button type="button" onClick={save} disabled={state === 'saving' || !dirty} title={dirty ? 'Guardar esta sección' : 'Sin cambios'}
          className={cn('p-2 rounded-lg border transition-colors shrink-0 disabled:cursor-not-allowed',
            state === 'saved' ? 'border-emerald-500/40 text-emerald-300'
              : state === 'error' ? 'border-red-500/40 text-red-300'
              : dirty ? 'border-aria-500/40 text-aria-300 hover:bg-aria-500/10' : 'border-white/10 text-white/25')}
          aria-label={`Guardar ${title}`}>
          {state === 'saving' ? <Loader2 size={16} className="animate-spin" /> : state === 'saved' ? <Check size={16} /> : <Save size={16} />}
        </button>
      </div>
      {children && <div className="mt-4 pl-8">{children}</div>}
    </div>
  )
}

function Hint({ children }) {
  return (
    <p className="flex items-start gap-1.5 mt-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 text-[11px] text-white/45">
      <Info size={12} className="shrink-0 mt-0.5" /> <span>{children}</span>
    </p>
  )
}

const RATING_LEVELS = [
  { key: 'caliente', label: 'Caliente', icon: ThumbsUp,  cls: 'text-red-300' },
  { key: 'tibio',    label: 'Tibio',    icon: Sun,       cls: 'text-amber-300' },
  { key: 'frio',     label: 'Frío',     icon: Snowflake, cls: 'text-sky-300' },
]
const areaCls = 'w-full bg-surface border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/85 leading-relaxed outline-none focus:border-aria-500/60'

function ConfigTab({ enabled, setEnabled }) {
  const [saved, setSaved] = useState(null)   // config guardada en el servidor
  const [schedule, setSchedule] = useState(null)
  const [opps, setOpps] = useState(null)
  const [tags, setTags] = useState(null)
  const [rating, setRating] = useState(null)
  const [channels, setChannels] = useState([])
  const [scoringOn, setScoringOn] = useState(enabled)
  useEffect(() => {
    api.getLucasConfig().then(c => {
      setSaved(c); setSchedule(c.schedule); setOpps(c.opportunities); setTags(c.smart_tags); setRating(c.rating)
    }).catch(() => {})
    api.getChannelInstances().then(d => setChannels(Array.isArray(d) ? d : (d?.instances || []))).catch(() => {})
  }, [])
  if (!schedule) return <div className="flex justify-center py-14"><Spinner className="w-6 h-6" /></div>

  const isDirty = (cur, key) => JSON.stringify(cur) !== JSON.stringify(saved[key])
  const saveSection = (key, value, setter) => async () => {
    const c = await api.updateLucasConfig({ [key]: value })
    setSaved(c); setter(c[key])
  }
  const toggleChannel = id => setOpps(o => ({
    ...o, channels: o.channels.includes(id) ? o.channels.filter(x => x !== id) : [...o.channels, id],
  }))

  return (
    <div className="space-y-4">
      <ConfigSection icon={Clock} title="Ejecución programada"
        desc="Programá el agente para analizar automáticamente todos los contactos cada día a una hora específica."
        toggle={<Switch on={schedule.enabled} onChange={v => setSchedule(sc => ({ ...sc, enabled: v }))} label="Ejecución programada" />}
        dirty={isDirty(schedule, 'schedule')} onSave={saveSection('schedule', schedule, setSchedule)}>
        {schedule.enabled && (
          <label className="flex flex-wrap items-center gap-3 text-sm text-white/70">
            Todos los días a las
            <input type="time" className={dateCls} value={schedule.time}
              onChange={e => setSchedule(sc => ({ ...sc, time: e.target.value }))} />
            <span className="text-[11px] text-white/35">(hora de Argentina)</span>
          </label>
        )}
        {schedule.enabled && !enabled && (
          <p className="text-xs text-amber-300/80 mt-2">El análisis automático está desactivado: la ejecución programada no corre hasta activarlo.</p>
        )}
      </ConfigSection>

      <ConfigSection icon={Target} title="Oportunidades" dirty={isDirty(opps, 'opportunities')}
        onSave={saveSection('opportunities', opps, setOpps)}>
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <Switch on={opps.move} onChange={v => setOpps(o => ({ ...o, move: v }))} label="Mover oportunidades" />
            <div className="min-w-0">
              <p className="text-sm text-white/85">Mover oportunidades</p>
              <p className="text-xs text-white/45 mt-0.5 flex items-start gap-1.5">
                <Sparkles size={12} className="text-aria-300 shrink-0 mt-0.5" />
                El agente moverá automáticamente las oportunidades entre etapas según los criterios configurados en cada pipeline.
              </p>
              <Hint>Configurá los criterios de las etapas en la sección de Embudos &gt; Configurar &gt; Etapa. Solo las etapas con criterio serán consideradas por la IA.</Hint>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch on={opps.create} onChange={v => setOpps(o => ({ ...o, create: v }))} label="Crear oportunidades automáticamente" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/85">Crear oportunidades automáticamente</p>
              {opps.create && (
                channels.length === 0
                  ? <p className="text-xs text-white/40 mt-2">No hay canales disponibles.</p>
                  : (
                    <div className="mt-2 space-y-1.5">
                      {channels.map(ch => (
                        <label key={ch.id} className="flex items-center gap-2.5 text-sm text-white/75 cursor-pointer">
                          <input type="checkbox" className="accent-[#3355ff]" checked={opps.channels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} />
                          <Radio size={13} className="text-white/35" />
                          {ch.instance_name || ch.session_name}{ch.phone_number ? ` · ${ch.phone_number}` : ''}
                          <span className="text-[11px] text-white/35">({ch.provider === 'evolution' ? 'EvolutionGo' : 'WAHA'})</span>
                        </label>
                      ))}
                    </div>
                  )
              )}
              <Hint>Las oportunidades se crearán automáticamente cuando se cree una conversación nueva desde el canal seleccionado.</Hint>
            </div>
          </div>
        </div>
      </ConfigSection>

      <ConfigSection icon={Tag} title="Smart Tags (etiquetado inteligente)"
        toggle={<Switch on={tags.enabled} onChange={v => setTags(t => ({ ...t, enabled: v }))} label="Smart Tags" />}
        desc="El agente de análisis etiquetará automáticamente los contactos según los criterios configurados en cada tag."
        dirty={isDirty(tags, 'smart_tags')} onSave={saveSection('smart_tags', tags, setTags)}>
        <Hint>Configurá los criterios de los tags en la sección de Contactos &gt; Tags. Solo los tags con criterio serán considerados por la IA.</Hint>
      </ConfigSection>

      <ConfigSection icon={TrendingUp} title="Calificación"
        toggle={<Switch on={rating.enabled} onChange={v => setRating(r => ({ ...r, enabled: v }))} label="Calificación" />}
        dirty={isDirty(rating, 'rating')} onSave={saveSection('rating', rating, setRating)}>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-white">Temperatura</p>
            <p className="text-xs text-white/45">Qué tanto interés demuestra el cliente en comprar.</p>
          </div>
          {RATING_LEVELS.map(l => (
            <label key={l.key} className="block">
              <span className={cn('flex items-center gap-1.5 text-sm font-medium mb-1.5', l.cls)}><l.icon size={14} /> {l.label}</span>
              <textarea rows={8} value={rating.criteria[l.key]} className={areaCls}
                onChange={e => setRating(r => ({ ...r, criteria: { ...r.criteria, [l.key]: e.target.value } }))} />
            </label>
          ))}
          <label className="block pt-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-white"><Gauge size={14} className="text-aria-300" /> Scoring</span>
            <span className="block text-xs text-white/45 mb-1.5">Coincidencia con el perfil de cliente ideal.</span>
            <textarea rows={12} value={rating.icp || ''} className={areaCls}
              onChange={e => setRating(r => ({ ...r, icp: e.target.value }))} />
          </label>
          {!rating.enabled && <p className="text-xs text-amber-300/80">Apagado, Lucas califica con su propio criterio en lugar de estos.</p>}
        </div>
      </ConfigSection>

      <ConfigSection icon={Brain} title="Análisis automático de conversaciones"
        desc="Cuando una conversación se cierra, Lucas la lee y califica al contacto (temperatura y score), mueve la etapa del embudo, completa datos y deja una nota con el resumen."
        toggle={<Switch on={scoringOn} onChange={setScoringOn} label="Análisis automático" />}
        dirty={scoringOn !== enabled}
        onSave={async () => { await api.setAiScoringEnabled(scoringOn); setEnabled(scoringOn) }} />
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Lucas() {
  const [tab, setTab] = useState('reports')
  const [enabled, setEnabled] = useState(null)
  useEffect(() => { api.getAiScoringSettings().then(d => setEnabled(!!d.enabled)).catch(() => setEnabled(false)) }, [])

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 border border-emerald-400/20 flex items-center justify-center shrink-0">
          <MessageSquareText size={22} className="text-emerald-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Lucas</h1>
            {enabled != null && <Badge variant={enabled ? 'success' : 'default'}>{enabled ? 'Activo' : 'Inactivo'}</Badge>}
          </div>
          <p className="text-sm text-white/60 font-medium">Analista de conversaciones</p>
          <p className="text-sm text-white/40 mt-1">Le pone un número a cada chat. Ves quién está caliente y dónde se te enfría el embudo.</p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 bg-white/5 border border-white/5 rounded-lg px-2 py-1"><Gauge size={11} /> Score de cada lead</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 bg-white/5 border border-white/5 rounded-lg px-2 py-1"><Thermometer size={11} /> Temperatura del embudo</span>
          </div>
        </div>
      </div>

      <TabBar value={tab} onChange={setTab} tabs={[['reports', 'Reportes y Métricas'], ['config', 'Configuración']]} />

      {enabled == null ? <div className="flex justify-center py-14"><Spinner className="w-6 h-6" /></div>
        : tab === 'reports' ? <ReportsTab enabled={enabled} />
        : <ConfigTab enabled={enabled} setEnabled={setEnabled} />}
    </div>
  )
}
