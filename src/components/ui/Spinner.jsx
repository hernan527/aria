import { cn } from '../../lib/utils'

export function Spinner({ className }) {
  return (
    <div className={cn('animate-spin rounded-full border-2 border-white/10 border-t-aria-500 h-5 w-5', className)} />
  )
}
