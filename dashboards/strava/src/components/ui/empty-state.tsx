import { cn } from '../../lib/utils'
import { useTranslation } from 'react-i18next'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {icon && (
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// Pre-built empty states for common scenarios
export function NoActivitiesFound({ onReset }: { onReset?: () => void }) {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
        </svg>
      }
      title={t('empty.activities.title')}
      description={t('empty.activities.description')}
      action={
        onReset && (
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {t('empty.activities.reset')}
          </button>
        )
      }
    />
  )
}

export function NoDataAvailable() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <path d="M3 3v18h18"/>
          <path d="m19 9-5 5-4-4-3 3"/>
        </svg>
      }
      title={t('empty.data.title')}
      description={t('empty.data.description')}
    />
  )
}
