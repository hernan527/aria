import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { MessageSquare, ThumbsUp, Clock, Trophy, Phone, TrendingUp, TrendingDown, Minus, Filter, XCircle, Sparkles, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function fmtSecs(s) {
  if (s == null) return '—'
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${Math.round(s / 360) / 10} h`
}

// Variación contra el período anterior de igual duración: verde sube, rojo baja, amarillo igual
function Delta({ current, previous, lowerIsBetter = false }) {
  if (current == null || previous == null) return null
  const pct = previous ? Math.round(((current - previous) / previous) * 1000) / 10 : (current ? 100 : 0)
  // El color indica si mejoró (verde) o empeoró (rojo); en tiempos de respuesta, bajar es mejorar
  const better = lowerIsBetter ? current < previous : current > previous
  const worse = lowerIsBetter ? current > previous : current < previous
  const up = better, down = worse
  const Icon = current > previous ? TrendingUp : current < previous ? TrendingDown : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold',
      up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-amber-300')} title={`Período anterior: ${previous}`}>
      <Icon size={13} /> {Math.abs(pct)}%
    </span>
  )
}

function Kpi({ icon: Icon, title, subtitle, metric, format = v => v, lowerIsBetter }) {
  return (
    <div className="card-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-aria-500/15 flex items-center justify-center shrink-0"><Icon size={17} className="text-aria-300" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{title}</p>
            {subtitle && <p className="text-[11px] text-white/40 truncate">{subtitle}</p>}
          </div>
        </div>
        <Delta current={metric?.current} previous={metric?.previous} lowerIsBetter={lowerIsBetter} />
      </div>
      <p className="text-4xl font-bold text-white mt-4">{metric?.current == null ? '—' : format(metric.current)}</p>
    </div>
  )
}

// Primera fila del Dashboard. `range` = { from, to } en epoch segundos.
export function KpiRow({ range }) {
  const [m, setM] = useState(null)
  useEffect(() => {
    setM(null)
    api.getDashboardMetrics(range).then(setM).catch(() => setM({}))
  }, [range.from, range.to])
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Kpi icon={MessageSquare} title="Conversaciones activas" subtitle="Con mensajes en el período" metric={m?.active_conversations} />
      <Kpi icon={ThumbsUp} title="Leads calientes"
        subtitle={m ? `${m.warm_in_conversation ?? 0} tibios en conversación` : ''} metric={m?.hot_leads} />
      <Kpi icon={Clock} title="Primera respuesta" subtitle="Mediana del período"
        metric={m?.first_reply_median} format={fmtSecs} lowerIsBetter />
    </div>
  )
}

// Segunda fila del Dashboard (tres secciones)
export function SecondRow({ range }) {
  const [m, setM] = useState(null)
  useEffect(() => {
    setM(null)
    api.getDashboardMetrics(range).then(setM).catch(() => setM({}))
  }, [range.from, range.to])
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Kpi icon={Clock} title="Tiempo de respuesta" subtitle="Promedio"
        metric={m?.avg_response_time} format={fmtSecs} lowerIsBetter />
      <Kpi icon={Trophy} title="Cierres del período"
        subtitle={!m ? '' : m.closes?.current ? `Tasa de cierre ${m.close_rate ?? 0}%` : 'Sin ventas registradas'}
        metric={m?.closes} />
      <Kpi icon={Phone} title="Contactabilidad"
        subtitle={m ? `Sobre ${m.contactability_base ?? 0} conversaciones` : ''}
        metric={m?.contactability} format={v => `${v}%`} />
    </div>
  )
}

// Tercera fila: Embudo comercial (izquierda) + sección derecha (pendiente de especificar)
function FunnelSection({ f }) {
  const closed = f ? f.won + f.lost : 0
  const pct = n => (closed ? `${Math.round((n / closed) * 1000) / 10}%` : '0%')
  const max = Math.max(1, ...(f?.stages || []).map(x => x.count))
  return (
    <div className="card hover:translate-y-0">
      <div className="flex items-start gap-3 mb-4">
        <Filter size={18} className="text-aria-300 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Embudo comercial</p>
          <p className="text-xs text-white/45">Avance de las oportunidades abiertas por etapa y cierres del período</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
          <p className="text-xs text-emerald-200/80 flex items-center gap-1.5"><Trophy size={12} /> Ganadas en el período</p>
          <p className="text-2xl font-bold text-white mt-1">{f ? f.won : '—'} <span className="text-xs font-medium text-emerald-300/80">{f ? pct(f.won) : ''}</span></p>
        </div>
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">
          <p className="text-xs text-red-200/80 flex items-center gap-1.5"><XCircle size={12} /> Perdidas en el período</p>
          <p className="text-2xl font-bold text-white mt-1">{f ? f.lost : '—'} <span className="text-xs font-medium text-red-300/80">{f ? pct(f.lost) : ''}</span></p>
        </div>
      </div>
      {!f ? null : f.open === 0 ? (
        <p className="text-sm text-white/45 text-center py-6">
          No hay oportunidades abiertas en tus embudos. Creá oportunidades desde las conversaciones o el embudo.
        </p>
      ) : (
        <div className="space-y-2.5">
          {f.stages.map(st => (
            <div key={st.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-white/80 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.color || '#6366f1' }} /> {st.label}
                </span>
                <span className="text-white font-semibold shrink-0 ml-3">{st.count}</span>
              </div>
              <div className="mt-1 ml-[18px] h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(st.count / max) * 100}%`, background: st.color || '#6366f1' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Velocidad de atención (derecha de la tercera fila)
function SpeedBox({ title, value, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-xs text-white/50">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      <div className="text-[11px] text-white/45 mt-1 space-y-0.5">{children}</div>
    </div>
  )
}

function SpeedSection({ m }) {
  return (
    <div className="card hover:translate-y-0">
      <div className="flex items-start gap-3 mb-4">
        <Clock size={18} className="text-aria-300 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Velocidad de atención</p>
          <p className="text-xs text-white/45">Tiempos de respuesta y contactabilidad del período</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SpeedBox title="Primera respuesta" value={m ? fmtSecs(m.first_reply_median?.current) : '—'}>
          <p>Asesores: <span className="text-white/75">{m ? fmtSecs(m.first_reply_split?.human) : '—'}</span></p>
          <p>Asesores IA: <span className="text-white/75">{m ? fmtSecs(m.first_reply_split?.bot) : '—'}</span></p>
        </SpeedBox>
        <SpeedBox title="Tiempo de respuesta" value={m ? fmtSecs(m.avg_response_time?.current) : '—'}>
          <p>Promedio durante la conversación</p>
          <p>{m ? m.exchange_conversations ?? 0 : 0} con intercambio real</p>
        </SpeedBox>
        <SpeedBox title="Contactabilidad" value={m?.contactability?.current == null ? '—' : `${m.contactability.current}%`}>
          <p>{m ? m.exchange_conversations ?? 0 : 0} con intercambio real de {m ? m.contactability_base ?? 0 : 0}</p>
        </SpeedBox>
      </div>

      {/* Conversaciones con respuesta */}
      <div className="mt-4">
        {!m ? null : !m.recent_exchanges?.length ? (
          <p className="text-sm text-white/45 text-center py-4">No hay conversaciones con respuesta en este período.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {m.recent_exchanges.map(r => (
              <div key={r.contact_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-white/80 truncate">{r.name}</span>
                <span className="flex items-center gap-2 shrink-0 text-xs text-white/45">
                  <span>{r.by === 'human' ? 'Asesor' : 'IA'} · {fmtSecs(r.reply_secs)}</span>
                  <span className="text-white/30">{new Date(r.last_at * 1000).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conversaciones creadas por día */}
      <div className="mt-5 pt-4 border-t border-white/5">
        <p className="text-sm font-medium text-white">Conversaciones creadas por día</p>
        <p className="text-[11px] text-white/40">Cada barra es la cantidad de conversaciones nuevas creadas ese día.</p>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {[
            ['Total del período', m?.created_per_day?.total ?? '—'],
            ['Promedio diario', m?.created_per_day?.daily_avg ?? '—'],
            ['Día pico', m?.created_per_day?.peak_day
              ? `${new Date(`${m.created_per_day.peak_day.day}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} (${m.created_per_day.peak_day.count})`
              : '—'],
          ].map(([label, v]) => (
            <div key={label}>
              <p className="text-[11px] text-white/45">{label}</p>
              <p className="text-lg font-bold text-white">{v}</p>
            </div>
          ))}
        </div>
        <div className="h-36 mt-3">
          {m?.created_per_day?.days?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.created_per_day.days.map(d => ({
                ...d, label: new Date(`${d.day}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
              }))} margin={{ top: 5, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={12} />
                <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="count" name="Conversaciones" fill="#3355ff" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const TEMP_STYLE = {
  caliente: { label: 'Caliente', cls: 'text-red-300 bg-red-500/10' },
  tibio:    { label: 'Tibio',    cls: 'text-amber-300 bg-amber-500/10' },
  frio:     { label: 'Frío',     cls: 'text-sky-300 bg-sky-500/10' },
}

function PrioritySection({ m }) {
  const navigate = useNavigate()
  const empty = m && (!m.scoring_enabled || !m.prioritized?.length)
  return (
    <div className="card hover:translate-y-0">
      <div className="flex items-start gap-3 mb-4">
        <Sparkles size={18} className="text-aria-300 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Priorización con IA</p>
          <p className="text-xs text-white/45">Temperatura y score de tus conversaciones activas</p>
        </div>
      </div>
      {!m ? null : empty ? (
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-11 h-11 rounded-2xl bg-aria-500/15 flex items-center justify-center mb-3"><Sparkles size={20} className="text-aria-300" /></div>
          <p className="text-sm font-medium text-white">{m.scoring_enabled ? 'Todavía no hay conversaciones activas calificadas' : 'Activá el análisis con IA'}</p>
          <p className="text-xs text-white/45 mt-1 max-w-md">
            Configurá un agente de análisis para calificar automáticamente tus leads por temperatura y score de cierre.
          </p>
          <button type="button" onClick={() => navigate('/lucas')}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-aria-300 hover:text-aria-200">
            Ir a Agentes <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {m.prioritized.map(r => {
            const t = TEMP_STYLE[r.temperature] || TEMP_STYLE.frio
            return (
              <div key={r.contact_id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white/85 truncate">{r.name || r.phone}</span>
                  {r.reasoning && <span className="block text-xs text-white/40 truncate">{r.reasoning}</span>}
                </span>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0', t.cls)}>{t.label}</span>
                <span className="text-sm font-semibold text-white w-10 text-right shrink-0">{r.score}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ImpactSection({ m }) {
  const i = m?.ai_impact
  const items = i ? [
    ['Respuestas de agentes IA', i.bot_replies],
    ['Leads calificados por Lucas', i.leads_scored],
    ['Mensajes enviados por Tobías', i.campaign_messages],
    ['Análisis de Axel', i.analyses],
  ] : []
  const empty = i && items.every(([, v]) => !v)
  return (
    <div className="card hover:translate-y-0">
      <div className="flex items-start gap-3 mb-4">
        <Sparkles size={18} className="text-aria-300 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Impacto de Aria</p>
          <p className="text-xs text-white/45">Trabajo que la IA hizo por tu equipo en el período</p>
        </div>
      </div>
      {!i ? null : empty ? (
        <p className="text-sm text-white/45 text-center py-6">
          Aún no hay actividad de IA registrada en este período. Configurá agentes de IA para automatizar la atención y el análisis.
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map(([label, v]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-2xl font-bold text-white">{v}</p>
              <p className="text-[11px] text-white/45 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ThirdRow({ range }) {
  const [m, setM] = useState(null)
  useEffect(() => {
    setM(null)
    api.getDashboardMetrics(range).then(setM).catch(() => setM({}))
  }, [range.from, range.to])
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <FunnelSection f={m?.funnel} />
      <SpeedSection m={m} />
      <div className="lg:col-span-2"><PrioritySection m={m} /></div>
      <div className="lg:col-span-2"><ImpactSection m={m} /></div>
    </div>
  )
}
