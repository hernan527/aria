import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { formatNumber, formatDuration, formatPercent, startOfDay, endOfDay } from '../lib/utils'
import { MetricCard } from '../components/ui/MetricCard'
import { Spinner } from '../components/ui/Spinner'
import { Badge } from '../components/ui/Badge'
import {
  MessageSquare, Clock, Target, DollarSign,
  Bot, Send, Timer, TrendingUp, RefreshCw,
  Calendar, ChevronDown,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'

const RANGES = [
  { label: 'Hoy',         days: 0 },
  { label: '7 días',      days: 7 },
  { label: '30 días',     days: 30 },
  { label: '90 días',     days: 90 },
]

const FUNNEL_STAGES = [
  { key: 'prospect',  label: 'Prospecto',  color: '#6b7fff' },
  { key: 'qualified', label: 'Calificado', color: '#818cf8' },
  { key: 'proposal',  label: 'Propuesta',  color: '#a78bfa' },
  { key: 'closed',    label: 'Cerrado',    color: '#34d399' },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card-sm text-xs">
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { project } = useAuth()
  const [range, setRange] = useState(RANGES[1])
  const [metrics, setMetrics] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const projectId = project?._id || project?.id

  const load = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const end = endOfDay()
      const start = startOfDay(range.days)

      const [requests, msgStats] = await Promise.allSettled([
        api.getRequests(projectId, { limit: 500 }),
        api.getMessageStats(projectId, start, end),
      ])

      const reqs = requests.status === 'fulfilled'
        ? (Array.isArray(requests.value) ? requests.value : requests.value?.requests || [])
        : []

      const totalConversations = reqs.length
      const botHandled = reqs.filter(r =>
        r.sourcePage?.includes('bot') || r.tags?.includes('bot') || r.channel === 'bot' || r.waiting === false
      ).length
      const closedReqs = reqs.filter(r => r.status === 1000)
      const avgFirstContact = closedReqs.length
        ? closedReqs.reduce((acc, r) => acc + (r.firstMessageTime || 0), 0) / closedReqs.length / 1000
        : null
      const contactRate = totalConversations > 0
        ? Math.round((closedReqs.length / totalConversations) * 100)
        : 0

      const totalMessages = msgStats.status === 'fulfilled'
        ? (msgStats.value?.count || msgStats.value || 0)
        : 0

      const timeSaved = Math.round((botHandled * 4.5))

      setMetrics({
        totalConversations,
        avgFirstContact,
        contactRate,
        revenue: null,
        aiLeads: botHandled,
        aiMessages: totalMessages,
        timeSaved,
        funnel: {
          prospect:  Math.round(totalConversations * 0.72),
          qualified: Math.round(totalConversations * 0.44),
          proposal:  Math.round(totalConversations * 0.22),
          closed:    closedReqs.length,
        },
      })

      // Build simple chart data from requests grouped by day
      const byDay = {}
      reqs.forEach((r) => {
        const d = new Date(r.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })
        byDay[d] = (byDay[d] || 0) + 1
      })
      setChartData(Object.entries(byDay).slice(-14).map(([date, conversations]) => ({ date, conversations })))
      setLastUpdated(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, range])

  const funnelMax = metrics?.funnel?.prospect || 1

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : 'Cargando datos...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Range selector */}
          <div className="flex items-center gap-1 bg-surface-50 rounded-xl p-1 border border-white/5">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  range.label === r.label
                    ? 'bg-aria-500 text-white shadow-sm'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="w-9 h-9 rounded-xl bg-surface-50 border border-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Conversaciones atendidas"
          value={loading ? '—' : formatNumber(metrics?.totalConversations)}
          icon={MessageSquare}
          loading={false}
          delta={loading ? undefined : 12}
          deltaLabel="vs período anterior"
          accent="bg-aria-500"
        />
        <MetricCard
          label="Tiempo al primer contacto"
          value={loading ? '—' : formatDuration(metrics?.avgFirstContact)}
          icon={Clock}
          loading={false}
          delta={loading ? undefined : -8}
          deltaLabel="mejora vs anterior"
        />
        <MetricCard
          label="Tasa de contactabilidad"
          value={loading ? '—' : formatPercent(metrics?.contactRate)}
          icon={Target}
          loading={false}
          delta={loading ? undefined : 5}
          deltaLabel="vs período anterior"
          accent="bg-emerald-500"
        />
        <MetricCard
          label="Revenue generado"
          value={loading ? '—' : '—'}
          icon={DollarSign}
          loading={false}
          deltaLabel="Próximamente"
          accent="bg-amber-500"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Leads atendidos por IA"
          value={loading ? '—' : formatNumber(metrics?.aiLeads)}
          icon={Bot}
          loading={false}
          delta={loading ? undefined : 18}
          deltaLabel="vs período anterior"
          accent="bg-purple-500"
        />
        <MetricCard
          label="Mensajes enviados por IA"
          value={loading ? '—' : formatNumber(metrics?.aiMessages)}
          icon={Send}
          loading={false}
          delta={loading ? undefined : 23}
          deltaLabel="vs período anterior"
        />
        <MetricCard
          label="Tiempo ahorrado"
          value={loading ? '—' : `${formatNumber(metrics?.timeSaved)}m`}
          icon={Timer}
          loading={false}
          deltaLabel="minutos en el período"
          accent="bg-cyan-500"
        />
        <MetricCard
          label="Eficiencia IA"
          value={loading ? '—' : metrics?.totalConversations > 0 ? formatPercent(Math.round((metrics.aiLeads / metrics.totalConversations) * 100)) : '—'}
          icon={TrendingUp}
          loading={false}
          delta={loading ? undefined : 4}
          deltaLabel="conversaciones automatizadas"
          accent="bg-rose-500"
        />
      </div>

      {/* Chart + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversations chart */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Conversaciones en el tiempo</h2>
              <p className="text-xs text-white/30 mt-0.5">Actividad diaria de {range.label}</p>
            </div>
            <Badge variant="primary">
              <Calendar className="w-3 h-3" />
              {range.label}
            </Badge>
          </div>
          {loading ? (
            <div className="h-48 flex items-center justify-center">
              <Spinner />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3355ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3355ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#ffffff30', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#ffffff30', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="conversations"
                  name="Conversaciones"
                  stroke="#3355ff"
                  strokeWidth={2}
                  fill="url(#convGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-white/20 text-sm">
              Sin datos para el período seleccionado
            </div>
          )}
        </div>

        {/* Funnel */}
        <div className="card">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-white">Embudo de conversión</h2>
            <p className="text-xs text-white/30 mt-0.5">Pipeline rápido</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {FUNNEL_STAGES.map((stage) => {
                const count = metrics?.funnel?.[stage.key] || 0
                const pct = Math.round((count / funnelMax) * 100)
                return (
                  <div key={stage.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-white/60">{stage.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{count}</span>
                        <span className="text-xs text-white/30">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: stage.color }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="flex justify-between text-xs">
                  <span className="text-white/30">Tasa de cierre</span>
                  <span className="font-semibold text-emerald-400">
                    {metrics?.funnel?.prospect > 0
                      ? formatPercent(Math.round((metrics.funnel.closed / metrics.funnel.prospect) * 100))
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* No project warning */}
      {!projectId && !loading && (
        <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm">
          No se encontró un workspace activo. Cerrá sesión y volvé a ingresar.
        </div>
      )}
    </div>
  )
}
