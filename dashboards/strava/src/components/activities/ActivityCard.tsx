import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { formatDurationFromSeconds, formatNumber, formatSpeed, formatPace } from '../../lib/formatters'
import { getTrainingInsights } from '../../lib/trainingInsights'
import { ActivityThumbnail } from './ActivityThumbnail'
import { Badge, ActivityBadge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { useTranslation } from 'react-i18next'

interface ActivityCardProps {
  activity: {
    strava_activity_id: number
    name: string
    type: string
    start_date: string
    distance_km: string | number
    moving_time: number
    total_elevation_gain: string | number
    avg_speed_kmh?: string | number
    average_watts?: string | number | null
    average_heartrate?: string | number | null
    primary_photo_url?: string | null
    route_data?: [number, number][] | null
    photos?: Array<{ url_small?: string; url_medium?: string }> | null
    // Engagement metrics
    kudos_count?: number
    comment_count?: number
    achievement_count?: number
    has_segment_pr?: boolean
    // Device info
    device_name?: string | null
    // Stream data availability
    average_cadence?: string | number | null
    intensity_factor?: number | null
    training_stress_score?: number | null
  }
  className?: string
  showSpeed?: boolean
}

export function ActivityCard({ activity, className, showSpeed = true }: ActivityCardProps) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatLocaleDate = (value: string, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(dateLocale, options).format(new Date(value))
  const photoUrl = activity.primary_photo_url || activity.photos?.[0]?.url_small || activity.photos?.[0]?.url_medium
  const isRunningType = activity.type === 'Run' || activity.type === 'Walk' || activity.type === 'Hike'
  const trainingInsights = getTrainingInsights({
    tss: activity.training_stress_score ?? null,
    intensityFactor: activity.intensity_factor ?? null,
    durationSeconds: activity.moving_time,
  })

  // Determine which stream data is available
  const hasGPS = activity.route_data && activity.route_data.length > 0
  const hasPower = activity.average_watts !== null && activity.average_watts !== undefined && Number(activity.average_watts) > 0
  const hasHeartRate = activity.average_heartrate !== null && activity.average_heartrate !== undefined && Number(activity.average_heartrate) > 0
  const hasCadence = activity.average_cadence !== null && activity.average_cadence !== undefined && Number(activity.average_cadence) > 0
  const hasSegmentPr = activity.has_segment_pr === true

  return (
    <Link to={`/activity/${activity.strava_activity_id}`} className="block group">
      <Card className={cn('overflow-hidden transition-all hover:shadow-lg hover:border-primary/30', className)}>
        {/* Thumbnail */}
        <div className="h-40 relative">
          {activity.route_data && activity.route_data.length > 0 ? (
            <div className="w-full h-full">
              <ActivityThumbnail
                routeData={activity.route_data}
                activityType={activity.type}
                className="w-full h-full rounded-none"
              />
            </div>
          ) : photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <span className="text-5xl opacity-30">
                {activity.type === 'Ride' ? '🚴' :
                 activity.type === 'VirtualRide' ? '🖥️' :
                 activity.type === 'Run' ? '🏃' :
                 activity.type === 'Walk' ? '🚶' :
                 activity.type === 'Hike' ? '🥾' :
                 activity.type === 'Swim' ? '🏊' : '🏃'}
              </span>
            </div>
          )}

          {/* Stream Data Indicators - Top Left */}
          <div className="absolute top-2 left-2 flex gap-1">
            {hasGPS && (
              <div className="bg-emerald-500/90 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title={t('activity.card.gpsData')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
            )}
            {hasPower && (
              <div className="bg-amber-500/90 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title={t('activity.card.powerData')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
            )}
            {hasHeartRate && (
              <div className="bg-red-500/90 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title={t('activity.card.heartRateData')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                </svg>
              </div>
            )}
            {hasCadence && (
              <div className="bg-blue-500/90 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5" title={t('activity.card.cadenceData')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
            )}
          </div>

          {/* Type badge */}
          <div className="absolute top-2 right-2">
            <ActivityBadge type={activity.type} showIcon={false} className="bg-background/90 backdrop-blur-sm" />
          </div>
        </div>

        <CardContent className="p-4">
          {/* Title & Date */}
          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
            {activity.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            {formatLocaleDate(activity.start_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatBox
              label={t('activity.stats.distance')}
              value={formatNumber(Number(activity.distance_km), 1)}
              unit={t('activities.units.kmShort')}
            />
            <StatBox
              label={t('activity.stats.time')}
              value={formatDurationFromSeconds(activity.moving_time)}
            />
            <StatBox
              label={t('activity.stats.elevation')}
              value={formatNumber(Math.round(Number(activity.total_elevation_gain)))}
              unit={t('activities.units.mShort')}
            />
          </div>

          {/* Secondary stats + training badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {showSpeed && activity.avg_speed_kmh && (
              <span className="px-2 py-0.5 text-[11px] bg-secondary rounded-md whitespace-nowrap">
                {isRunningType
                  ? formatPace(Number(activity.avg_speed_kmh))
                  : formatSpeed(Number(activity.avg_speed_kmh))
                }
              </span>
            )}
            {activity.average_watts && (
              <span className="px-2 py-0.5 text-[11px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-md whitespace-nowrap">
                {t('activity.units.watt', { value: Math.round(Number(activity.average_watts)) })}
              </span>
            )}
            {activity.average_heartrate && (
              <span className="px-2 py-0.5 text-[11px] bg-red-500/10 text-red-600 dark:text-red-400 rounded-md whitespace-nowrap">
                {t('activity.units.bpm', { value: Math.round(Number(activity.average_heartrate)) })}
              </span>
            )}
            {trainingInsights.state === 'ok' && trainingInsights.zone && trainingInsights.impact && (
              <>
                <Badge variant="outline" className={`${trainingInsights.zone.className} whitespace-nowrap text-[11px] px-1.5 py-0.5`}>
                  {trainingInsights.zone.shortLabel}
                </Badge>
                <Badge variant="outline" className={`${trainingInsights.impact.className} whitespace-nowrap text-[11px] px-1.5 py-0.5`}>
                  {trainingInsights.impact.shortLabel}
                </Badge>
              </>
            )}
            {hasSegmentPr && (
              <span
                className="ml-auto px-2 py-0.5 text-[11px] bg-amber-500/10 text-amber-500 rounded-md inline-flex items-center"
                title={t('activity.card.segmentPr')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M4 5l3 6 5-6 5 6 3-6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z"/>
                </svg>
              </span>
            )}
          </div>

          {/* Engagement & Device info */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
            <div className="flex gap-3 text-xs text-muted-foreground">
              {activity.kudos_count !== undefined && activity.kudos_count > 0 && (
                <span className="flex items-center gap-1" title={t('activity.card.kudos')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 10v12"/>
                    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>
                  </svg>
                  {activity.kudos_count}
                </span>
              )}
              {activity.comment_count !== undefined && activity.comment_count > 0 && (
                <span className="flex items-center gap-1" title={t('activity.card.comments')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  {activity.comment_count}
                </span>
              )}
              {activity.achievement_count !== undefined && activity.achievement_count > 0 && (
                <span className="flex items-center gap-1 text-orange-500" title={t('activity.card.achievements')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="6"/>
                    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
                  </svg>
                  {activity.achievement_count}
                </span>
              )}
            </div>
            {activity.device_name && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={activity.device_name}>
                {activity.device_name}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function StatBox({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="text-left py-2 pr-2 pl-0 bg-secondary/50 rounded-lg">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="font-semibold text-sm">
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </p>
    </div>
  )
}

// Compact list item variant
export function ActivityListItem({ activity, className }: ActivityCardProps) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatLocaleDate = (value: string, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(dateLocale, options).format(new Date(value))
  const photoUrl = activity.primary_photo_url || activity.photos?.[0]?.url_small
  const trainingInsights = getTrainingInsights({
    tss: activity.training_stress_score ?? null,
    intensityFactor: activity.intensity_factor ?? null,
    durationSeconds: activity.moving_time,
  })

  return (
    <Link
      to={`/activity/${activity.strava_activity_id}`}
      className={cn(
        'flex gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors group',
        className
      )}
    >
      {/* Thumbnail */}
      <ActivityThumbnail
        photoUrl={photoUrl}
        routeData={activity.route_data}
        activityType={activity.type}
        size="md"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
              {activity.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatLocaleDate(activity.start_date, { day: '2-digit', month: 'short', year: 'numeric' })}
              <span className="mx-1.5">•</span>
              <span className="inline-flex items-center">
                {t(`activities.filters.types.${activity.type}`, { defaultValue: activity.type })}
              </span>
            </p>
            {trainingInsights.state === 'ok' && trainingInsights.zone && trainingInsights.impact && (
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant="outline" className={trainingInsights.zone.className}>
                  {trainingInsights.zone.shortLabel}
                </Badge>
                <Badge variant="outline" className={trainingInsights.impact.className}>
                  {trainingInsights.impact.shortLabel}
                </Badge>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
          <span>{t('activities.units.distanceKm', { value: formatNumber(Number(activity.distance_km), 1) })}</span>
          <span>{formatDurationFromSeconds(activity.moving_time)}</span>
          {Number(activity.total_elevation_gain) > 0 && (
            <span>{t('activities.units.elevationM', { value: Math.round(Number(activity.total_elevation_gain)) })}</span>
          )}
          {activity.average_watts && (
            <span className="text-yellow-600 dark:text-yellow-400">
              {t('activity.units.wattCompact', { value: Math.round(Number(activity.average_watts)) })}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// Skeleton for loading states
export function ActivityCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-40 rounded-none" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </CardContent>
    </Card>
  )
}

export function ActivityListItemSkeleton() {
  return (
    <div className="flex gap-3 p-3">
      <Skeleton className="w-16 h-16 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}
