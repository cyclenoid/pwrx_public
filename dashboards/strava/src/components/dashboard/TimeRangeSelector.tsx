import { cn } from '../../lib/utils'

export type TimeRange = 'week' | 'month' | 'year' | 'all'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
  className?: string
}

const options: { value: TimeRange; label: string; shortLabel: string }[] = [
  { value: 'week', label: 'Woche', shortLabel: 'W' },
  { value: 'month', label: 'Monat', shortLabel: 'M' },
  { value: 'year', label: 'Jahr', shortLabel: 'Y' },
  { value: 'all', label: 'Gesamt', shortLabel: 'All' },
]

export function TimeRangeSelector({ value, onChange, className }: TimeRangeSelectorProps) {
  return (
    <div className={cn('inline-flex rounded-lg bg-secondary p-1', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="hidden sm:inline">{option.label}</span>
          <span className="sm:hidden">{option.shortLabel}</span>
        </button>
      ))}
    </div>
  )
}

// Compact version for smaller spaces
export function TimeRangeSelectorCompact({ value, onChange, className }: TimeRangeSelectorProps) {
  return (
    <div className={cn('inline-flex gap-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer',
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          {option.shortLabel}
        </button>
      ))}
    </div>
  )
}
