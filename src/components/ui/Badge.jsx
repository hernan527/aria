import { cn } from '../../lib/utils'

const variants = {
  default: 'bg-white/10 text-white/70',
  success: 'bg-emerald-500/10 text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-400',
  danger:  'bg-red-500/10 text-red-400',
  primary: 'bg-aria-500/20 text-aria-300',
  info:    'bg-blue-500/10 text-blue-400',
}

export function Badge({ children, variant = 'default', className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', variants[variant], className)}>
      {children}
    </span>
  )
}
