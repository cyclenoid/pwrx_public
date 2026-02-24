import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getActivities, getActivity, type ActivityWithRoute } from '../lib/api'
import { Card, CardContent } from '../components/ui/card'
import { formatNumber, formatDurationFromSeconds, formatSpeed, formatPace } from '../lib/formatters'
import { useTranslation } from 'react-i18next'

// Components
import { ActivityCard, ActivityCardSkeleton } from '../components/activities/ActivityCard'
import { ActivityFiltersBar, defaultFilters, type ActivityFilters } from '../components/activities/ActivityFilters'
import { ActivityThumbnail } from '../components/activities/ActivityThumbnail'
import { ActivityBadge } from '../components/ui/badge'
import { NoActivitiesFound } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'

type ViewMode = 'cards' | 'table'

const ITEMS_PER_PAGE = 50

export function Activities() {
  const { t, i18n } = useTranslation()
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [filters, setFilters] = useState<ActivityFilters>(defaultFilters)
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE)
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatLocaleDate = (value: string) => new Intl.DateTimeFormat(dateLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

  // Load all activities without routes for filtering/sorting
  const {
    data: activities,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['activities', 'all-metadata'],
    queryFn: () => getActivities({
      limit: 10000,
      include_route: false // Don't load routes for all - too heavy
    }),
    staleTime: 5 * 60 * 1000,
  })

  // Filter and sort activities
  const filteredActivities = useMemo(() => {
    if (!activities) return []

    let result = [...activities]

    // Type filter
    if (filters.types.length > 0) {
      result = result.filter(a => filters.types.includes(a.type))
    }

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(search) ||
        a.type.toLowerCase().includes(search)
      )
    }

    // Min distance filter
    if (filters.minDistance) {
      result = result.filter(a => Number(a.distance_km) >= filters.minDistance!)
    }

    // Min elevation filter
    if (filters.minElevation) {
      result = result.filter(a => Number(a.total_elevation_gain) >= filters.minElevation!)
    }

    // Date filters
    if (filters.dateFrom) {
      result = result.filter(a => a.start_date >= filters.dateFrom!)
    }
    if (filters.dateTo) {
      result = result.filter(a => a.start_date <= filters.dateTo!)
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0
      switch (filters.sortBy) {
        case 'date':
          comparison = new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
          break
        case 'distance':
          comparison = Number(b.distance_km) - Number(a.distance_km)
          break
        case 'elevation':
          comparison = Number(b.total_elevation_gain) - Number(a.total_elevation_gain)
          break
        case 'time':
          comparison = b.moving_time - a.moving_time
          break
      }
      return filters.sortOrder === 'asc' ? -comparison : comparison
    })

    return result
  }, [activities, filters])

  // Reset display count when filters change
  useEffect(() => {
    setDisplayCount(ITEMS_PER_PAGE)
  }, [filters])

  // Paginated activities for display (IDs only for route fetching)
  const displayedActivitiesBase = useMemo(() => {
    return filteredActivities.slice(0, displayCount)
  }, [filteredActivities, displayCount])

  // Fetch route data for displayed activities
  const routeQueries = useQueries({
    queries: displayedActivitiesBase.map(activity => ({
      queryKey: ['activity-route', activity.strava_activity_id],
      queryFn: async () => {
        const fullActivity = await getActivity(activity.strava_activity_id)
        // Extract route from streams.latlng or use summary_polyline route_data
        const routeData = fullActivity.streams?.latlng || (fullActivity as any).route_data || null
        return {
          id: activity.strava_activity_id,
          route_data: routeData
        }
      },
      staleTime: 10 * 60 * 1000, // Cache for 10 minutes
      enabled: !activity.route_data // Only fetch if no route data
    }))
  })

  // Merge route data into displayed activities
  const displayedActivities = useMemo(() => {
    const routeMap = new Map<number, [number, number][] | null>()
    routeQueries.forEach(query => {
      if (query.data) {
        routeMap.set(query.data.id, query.data.route_data)
      }
    })

    return displayedActivitiesBase.map(activity => ({
      ...activity,
      route_data: activity.route_data || routeMap.get(activity.strava_activity_id) || null
    }))
  }, [displayedActivitiesBase, routeQueries])

  const hasMore = displayCount < filteredActivities.length

  const loadMore = () => {
    setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredActivities.length))
  }

  if (isError) {
    return <ErrorState onRetry={refetch} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('activities.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('activities.count', {
              shown: displayedActivities.length,
              filtered: filteredActivities.length,
            })}
            {filteredActivities.length !== (activities?.length || 0)
              ? ` ${t('activities.countTotal', { total: activities?.length || 0 })}`
              : ''}
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded transition-colors cursor-pointer ${
              viewMode === 'cards' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
            }`}
            title={t('activities.view.cards')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="7" height="7" x="3" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="3" rx="1"/>
              <rect width="7" height="7" x="14" y="14" rx="1"/>
              <rect width="7" height="7" x="3" y="14" rx="1"/>
            </svg>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded transition-colors cursor-pointer ${
              viewMode === 'table' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
            }`}
            title={t('activities.view.table')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" x2="21" y1="6" y2="6"/>
              <line x1="8" x2="21" y1="12" y2="12"/>
              <line x1="8" x2="21" y1="18" y2="18"/>
              <line x1="3" x2="3.01" y1="6" y2="6"/>
              <line x1="3" x2="3.01" y1="12" y2="12"/>
              <line x1="3" x2="3.01" y1="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <ActivityFiltersBar
            filters={filters}
            onChange={setFilters}
          />
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <ActivityCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredActivities.length === 0 ? (
        <NoActivitiesFound onReset={() => setFilters(defaultFilters)} />
      ) : viewMode === 'cards' ? (
        /* Card View */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedActivities.map((activity) => (
              <ActivityCard key={activity.strava_activity_id} activity={activity} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                {t('activities.loadMore', { count: filteredActivities.length - displayCount })}
              </button>
            </div>
          )}
        </>
      ) : (
        /* Table View */
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium text-sm">{t('activities.table.activity')}</th>
                      <th className="text-left p-4 font-medium text-sm">{t('activities.table.date')}</th>
                      <th className="text-left p-4 font-medium text-sm">{t('activities.table.type')}</th>
                      <th className="text-right p-4 font-medium text-sm">{t('activities.table.distance')}</th>
                      <th className="text-right p-4 font-medium text-sm">{t('activities.table.time')}</th>
                      <th className="text-right p-4 font-medium text-sm">{t('activities.table.elevation')}</th>
                      <th className="text-right p-4 font-medium text-sm">{t('activities.table.pace')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedActivities.map((activity) => (
                      <ActivityTableRow
                        key={activity.strava_activity_id}
                        activity={activity}
                        formatDate={formatLocaleDate}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={loadMore}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                {t('activities.loadMore', { count: filteredActivities.length - displayCount })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Table row component
function ActivityTableRow({ activity, formatDate }: { activity: ActivityWithRoute; formatDate: (value: string) => string }) {
  const { t } = useTranslation()
  const isRunType = activity.type === 'Run' || activity.type === 'Walk' || activity.type === 'Hike'
  const photoUrl = activity.primary_photo_url || activity.photos?.[0]?.url_small

  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="p-4">
        <Link
          to={`/activity/${activity.strava_activity_id}`}
          className="flex items-center gap-3 group"
        >
          <ActivityThumbnail
            photoUrl={photoUrl}
            routeData={activity.route_data}
            activityType={activity.type}
            size="sm"
          />
          <span className="font-medium group-hover:text-primary transition-colors truncate max-w-[200px]">
            {activity.name}
          </span>
        </Link>
      </td>
      <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(activity.start_date)}
      </td>
      <td className="p-4">
        <ActivityBadge type={activity.type} showIcon={false} />
      </td>
      <td className="p-4 text-sm text-right tabular-nums">
        {t('activities.units.distanceKm', { value: formatNumber(Number(activity.distance_km), 1) })}
      </td>
      <td className="p-4 text-sm text-right tabular-nums">
        {formatDurationFromSeconds(activity.moving_time)}
      </td>
      <td className="p-4 text-sm text-right tabular-nums">
        {t('activities.units.elevationM', { value: formatNumber(Math.round(Number(activity.total_elevation_gain))) })}
      </td>
      <td className="p-4 text-sm text-right tabular-nums">
        {isRunType
          ? formatPace(Number(activity.avg_speed_kmh))
          : formatSpeed(Number(activity.avg_speed_kmh))
        }
      </td>
    </tr>
  )
}
