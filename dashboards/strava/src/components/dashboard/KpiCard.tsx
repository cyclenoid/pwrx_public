import { cn } from '../../lib/utils'
import { formatNumber, formatChange } from '../../lib/formatters'
import { Skeleton } from '../ui/skeleton'

interface KpiCardProps {
  title: string
  value: number
  unit: string
  previousValue?: number
  icon?: React.ReactNode
  color?: 'default' | 'orange' | 'green' | 'blue' | 'purple'
  isLoading?: boolean
  className?: string
}

const colorStyles = {
  default: 'text-foreground',
  orange: 'text-orange-500',
  green: 'text-green-500',
  blue: 'text-blue-500',
  purple: 'text-purple-500',
}

const iconBgStyles = {
  default: 'bg-muted',
  orange: 'bg-orange-500/10',
  green: 'bg-green-500/10',
  blue: 'bg-blue-500/10',
  purple: 'bg-purple-500/10',
}

export function KpiCard({
  title,
  value,
  unit,
  previousValue,
  icon,
  color = 'default',
  isLoading = false,
  className,
}: KpiCardProps) {
  const change = previousValue !== undefined ? formatChange(value, previousValue) : null

  if (isLoading) {
    return <KpiCardSkeleton />
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <div className="flex items-baseline gap-1">
            <span className={cn('text-2xl font-bold tabular-nums', colorStyles[color])}>
              {formatNumber(value)}
            </span>
            <span className="text-sm font-medium text-muted-foreground">{unit}</span>
          </div>
          {change && (
            <div
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                change.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {change.positive ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m18 15-6-6-6 6"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              )}
              {change.value}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('p-2 rounded-lg', iconBgStyles[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  )
}

// Icon components for KPIs
export const KpiIcons = {
  activities: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-500">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
    </svg>
  ),
  distance: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-500">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
      <path d="M2 12h20"/>
    </svg>
  ),
  time: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  elevation: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-500">
      <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
    </svg>
  ),
}
