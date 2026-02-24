import { useState } from 'react'
import { cn } from '../../lib/utils'
import { ActivityBadge } from '../ui/badge'
import { useTranslation } from 'react-i18next'

export interface ActivityFilters {
  types: string[]
  search: string
  gearId?: string
  minDistance?: number
  minElevation?: number
  dateFrom?: string
  dateTo?: string
  sortBy: 'date' | 'distance' | 'elevation' | 'time' | 'power'
  sortOrder: 'asc' | 'desc'
}

interface ActivityFiltersProps {
  filters: ActivityFilters
  onChange: (filters: ActivityFilters) => void
  gearOptions?: Array<{ id: string; name: string }>
  className?: string
}

export function ActivityFiltersBar({
  filters,
  onChange,
  gearOptions = [],
  className,
}: ActivityFiltersProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  const updateFilter = <K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter(t => t !== type)
      : [...filters.types, type]
    updateFilter('types', newTypes)
  }

  const clearFilters = () => {
    onChange({
      types: [],
      search: '',
      gearId: undefined,
      sortBy: 'date',
      sortOrder: 'desc',
    })
  }

  const hasActiveFilters = filters.types.length > 0 || filters.search || filters.minDistance || filters.minElevation || !!filters.gearId

  return (
    <div className={cn('space-y-3', className)}>
      {/* Main filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder={t('activities.filters.searchPlaceholder')}
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Type filter buttons */}
        <div className="flex flex-wrap gap-1.5">
          {(['Ride', 'VirtualRide', 'Run', 'Walk', 'Hike', 'EBikeRide', 'Swim'] as const).map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer',
                filters.types.includes(type)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary/50 text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary'
              )}
            >
              {t(`activities.filters.types.${type}`)}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="flex items-center gap-1.5">
          <select
            value={filters.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value as ActivityFilters['sortBy'])}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            style={{ color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--popover))' }}
          >
            <option value="date" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>{t('activities.filters.sort.date')}</option>
            <option value="distance" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>{t('activities.filters.sort.distance')}</option>
            <option value="elevation" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>{t('activities.filters.sort.elevation')}</option>
            <option value="time" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>{t('activities.filters.sort.time')}</option>
            <option value="power" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>{t('activities.filters.sort.power')}</option>
          </select>
          <button
            onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-2 bg-secondary/50 border border-border rounded-lg hover:bg-secondary transition-colors cursor-pointer"
            title={filters.sortOrder === 'asc' ? t('activities.filters.sort.asc') : t('activities.filters.sort.desc')}
          >
            {filters.sortOrder === 'asc' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m3 8 4-4 4 4"/>
                <path d="M7 4v16"/>
                <path d="M11 12h4"/>
                <path d="M11 16h7"/>
                <path d="M11 20h10"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m3 16 4 4 4-4"/>
                <path d="M7 20V4"/>
                <path d="M11 4h10"/>
                <path d="M11 8h7"/>
                <path d="M11 12h4"/>
              </svg>
            )}
          </button>
        </div>

        {/* Expand/collapse advanced filters */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'p-2 rounded-lg border transition-colors cursor-pointer',
            isExpanded ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 border-border hover:bg-secondary'
          )}
          title={t('activities.filters.advanced')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" x2="4" y1="21" y2="14"/>
            <line x1="4" x2="4" y1="10" y2="3"/>
            <line x1="12" x2="12" y1="21" y2="12"/>
            <line x1="12" x2="12" y1="8" y2="3"/>
            <line x1="20" x2="20" y1="21" y2="16"/>
            <line x1="20" x2="20" y1="12" y2="3"/>
            <line x1="2" x2="6" y1="14" y2="14"/>
            <line x1="10" x2="14" y1="8" y2="8"/>
            <line x1="18" x2="22" y1="16" y2="16"/>
          </svg>
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors cursor-pointer"
          >
            {t('activities.filters.clear')}
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {isExpanded && (
        <div className="flex flex-wrap items-center gap-4 p-4 bg-secondary/30 rounded-lg border border-border">
          {gearOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">{t('activities.filters.gear.label')}</label>
              <select
                value={filters.gearId || ''}
                onChange={(e) => updateFilter('gearId', e.target.value || undefined)}
                className="px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
                style={{ color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--popover))' }}
              >
                <option value="">{t('activities.filters.gear.all')}</option>
                {gearOptions.map((gear) => (
                  <option key={gear.id} value={gear.id}>
                    {gear.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Min distance */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('activities.filters.minDistance')}</label>
            <input
              type="number"
              placeholder={t('activities.units.kmShort')}
              value={filters.minDistance || ''}
              onChange={(e) => updateFilter('minDistance', e.target.value ? Number(e.target.value) : undefined)}
              className="w-20 px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Min elevation */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('activities.filters.minElevation')}</label>
            <input
              type="number"
              placeholder={t('activities.units.mShort')}
              value={filters.minElevation || ''}
              onChange={(e) => updateFilter('minElevation', e.target.value ? Number(e.target.value) : undefined)}
              className="w-20 px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('activities.filters.from')}</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
              className="px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('activities.filters.to')}</label>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
              className="px-2 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      )}

      {/* Active filter badges */}
      {filters.types.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.types.map((type) => (
            <ActivityBadge
              key={type}
              type={type}
              className="cursor-pointer hover:opacity-80"
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Default filter state
export const defaultFilters: ActivityFilters = {
  types: [],
  search: '',
  gearId: undefined,
  sortBy: 'date',
  sortOrder: 'desc',
}
