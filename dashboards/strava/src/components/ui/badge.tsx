import { cn } from '../../lib/utils'
import { useTranslation } from 'react-i18next'

export type ActivityType = 'Ride' | 'VirtualRide' | 'Run' | 'Walk' | 'Hike' | 'Swim' | 'Workout' | string

const typeStyles: Record<string, string> = {
  Ride: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20',
  VirtualRide: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20',
  Run: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
  Walk: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  Hike: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  Swim: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  Workout: 'bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/20',
}

const typeIcons: Record<string, string> = {
  Ride: '🚴',
  VirtualRide: '🖥️',
  Run: '🏃',
  Walk: '🚶',
  Hike: '🥾',
  Swim: '🏊',
  Workout: '💪',
}

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'secondary' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border',
        variant === 'default' && 'bg-primary/10 text-primary border-primary/20',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground border-transparent',
        variant === 'outline' && 'bg-transparent border-border text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

interface ActivityBadgeProps {
  type: ActivityType
  showIcon?: boolean
  className?: string
}

export function ActivityBadge({ type, showIcon = true, className }: ActivityBadgeProps) {
  const { t } = useTranslation()
  const style = typeStyles[type] || 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20'
  const icon = typeIcons[type] || '🏃'
  const label = t(`activities.filters.types.${type}`, { defaultValue: type })

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border',
        style,
        className
      )}
    >
      {showIcon && <span className="text-[10px]">{icon}</span>}
      {label}
    </span>
  )
}

// Status badges for data states
interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
  className?: string
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const styles = {
    success: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
    warning: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    error: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    info: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border',
        styles[status],
        className
      )}
    >
      {children}
    </span>
  )
}
