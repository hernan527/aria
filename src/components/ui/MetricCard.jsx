import { cn } from '../../lib/utils'
import { Spinner } from './Spinner'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export function MetricCard({ label, value, delta, deltaLabel, icon: Icon, loading, color = '#3355ff', className }) {
  const isPositive = delta > 0
  const isNegative = delta < 0

  return (
    <div className={cn('card group relative overflow-hidden', className)}>
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-25 group-hover:opacity-40 group-hover:scale-110 transition-all duration-500 pointer-events-none"
        style={{ background: color }}
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <span className="metric-label">{label}</span>
          {Icon && (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}22`, border: `1px solid ${color}40` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 h-9">
            <Spinner />
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <span className="metric-value">{value}</span>
            {delta !== undefined && (
              <span className={cn('flex items-center gap-0.5 text-xs font-medium mb-1', {
                'text-emerald-400': isPositive,
                'text-red-400': isNegative,
                'text-white/30': !isPositive && !isNegative,
              })}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {Math.abs(delta)}%
              </span>
            )}
          </div>
        )}

        {deltaLabel && !loading && (
          <p className="text-xs text-white/30">{deltaLabel}</p>
        )}
      </div>
    </div>
  )
}
