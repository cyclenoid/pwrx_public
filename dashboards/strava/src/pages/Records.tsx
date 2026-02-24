import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords, getStreaks, getYearlyStats, getRunningBestEfforts, getCachedPowerCurve, getTopVAMActivities } from '../lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { StatCard } from '../components/StatCard'
import { StatCardSkeleton, ChartSkeleton } from '../components/ui/skeleton'
import { formatDuration, cn } from '../lib/utils'
import { useTheme } from '../components/ThemeProvider'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Link } from 'react-router-dom'
import type { RecordActivity } from '../types/activity'
import { useTranslation } from 'react-i18next'

type RecordCategory = 'longest_distance' | 'longest_duration' | 'most_elevation' | 'fastest_speed' | 'highest_heartrate' | 'most_calories' | 'most_kudos' | 'most_comments' | 'best_vam'

function RecordValue({ activity, valueKey, suffix }: { activity: RecordActivity; valueKey: string; suffix: string }) {
  const { t } = useTranslation()
  const rawValue = (activity as any)[valueKey]
  const suffixText = suffix ? ` ${suffix}` : ''

  // Handle missing or null values
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return <span className="text-muted-foreground">{t('common.notAvailable')}</span>
  }

  // Convert to number (handle both string and number types from API)
  const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue

  // Handle moving_time specially (format as duration)
  if (valueKey === 'moving_time') {
    return <span className="font-bold text-primary">{formatDuration(value)}</span>
  }

  // Handle kudos/comments (integers, no decimal)
  if (valueKey === 'kudos_count' || valueKey === 'comment_count') {
    return <span className="font-bold text-primary">{Math.round(value)}{suffixText}</span>
  }

  // Handle distance (2 decimals)
  if (valueKey === 'distance_km') {
    return <span className="font-bold text-primary">{value.toFixed(2)}{suffixText}</span>
  }

  // Handle speed (1 decimal)
  if (valueKey === 'avg_speed_kmh') {
    return <span className="font-bold text-primary">{value.toFixed(1)}{suffixText}</span>
  }

  // Default: no decimals
  if (!isNaN(value)) {
    return <span className="font-bold text-primary">{Math.round(value)}{suffixText}</span>
  }

  return <span className="text-muted-foreground">{t('common.notAvailable')}</span>
}

export function Records() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [selectedCategory, setSelectedCategory] = useState<RecordCategory>('longest_distance')
  const [sportType, setSportType] = useState<'Ride' | 'Run'>('Ride')
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatMonthYear = (value: string) => new Intl.DateTimeFormat(dateLocale, { month: 'short', year: 'numeric' }).format(new Date(value))
  const formatShortDate = (value: string) => new Intl.DateTimeFormat(dateLocale, { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value))

  // Format activity date for display
  const formatActivityDate = (dateString: string | null) => {
    if (!dateString) return null
    try {
      return formatMonthYear(dateString)
    } catch {
      return null
    }
  }

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['records', sportType],
    queryFn: () => getRecords(sportType || undefined),
  })

  const { data: streaks, isLoading: streaksLoading } = useQuery({
    queryKey: ['streaks', sportType],
    queryFn: () => getStreaks(sportType || undefined),
  })

  const { data: yearlyStats, isLoading: yearlyLoading } = useQuery({
    queryKey: ['yearlyStats', sportType],
    queryFn: () => getYearlyStats(sportType || undefined),
  })

  // Preload both running and cycling best efforts for smooth switching
  const { data: runningEfforts, isLoading: runningEffortsLoading } = useQuery({
    queryKey: ['running-best-efforts'],
    queryFn: () => getRunningBestEfforts({ months: undefined }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: powerCurve, isLoading: powerCurveLoading } = useQuery({
    queryKey: ['power-curve-best-efforts'],
    queryFn: () => getCachedPowerCurve(),
    staleTime: 60 * 60 * 1000, // 1 hour cache like on Power page
  })

  // Fetch top VAM activities
  const { data: vamActivities } = useQuery({
    queryKey: ['top-vam-activities', sportType],
    queryFn: () => getTopVAMActivities({ limit: 50, type: sportType || undefined }),
    staleTime: 60 * 60 * 1000,
  })

  const chartColors = {
    grid: resolvedTheme === 'dark' ? '#374151' : '#e5e7eb',
    text: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
    primary: '#fc4c02',
    secondary: '#ff6b35',
  }

  // For VAM category, transform vamActivities to match RecordActivity format
  const currentRecords = selectedCategory === 'best_vam'
    ? (vamActivities?.activities || []).map(activity => ({
        strava_activity_id: activity.strava_activity_id,
        name: activity.name,
        type: activity.type,
        start_date: activity.start_date,
        distance_km: activity.distance_km,
        moving_time: activity.moving_time,
        total_elevation_gain: activity.total_elevation_gain,
        vam: activity.vam,
      } as RecordActivity))
    : (records?.[selectedCategory] || [])

  const categoryLabels: Record<RecordCategory, { title: string; description: string; valueKey: string; suffix: string }> = {
    longest_distance: { title: t('records.categories.longestDistance.title'), description: t('records.categories.longestDistance.description'), valueKey: 'distance_km', suffix: t('records.units.km') },
    longest_duration: { title: t('records.categories.longestDuration.title'), description: t('records.categories.longestDuration.description'), valueKey: 'moving_time', suffix: '' },
    most_elevation: { title: t('records.categories.mostElevation.title'), description: t('records.categories.mostElevation.description'), valueKey: 'total_elevation_gain', suffix: t('records.units.m') },
    fastest_speed: { title: t('records.categories.fastestSpeed.title'), description: t('records.categories.fastestSpeed.description'), valueKey: 'avg_speed_kmh', suffix: t('records.units.kmh') },
    highest_heartrate: { title: t('records.categories.highestHeartrate.title'), description: t('records.categories.highestHeartrate.description'), valueKey: 'average_heartrate', suffix: t('records.units.bpm') },
    most_calories: { title: t('records.categories.mostCalories.title'), description: t('records.categories.mostCalories.description'), valueKey: 'calories', suffix: t('records.units.kcal') },
    most_kudos: { title: t('records.categories.mostKudos.title'), description: t('records.categories.mostKudos.description'), valueKey: 'kudos_count', suffix: '' },
    most_comments: { title: t('records.categories.mostComments.title'), description: t('records.categories.mostComments.description'), valueKey: 'comment_count', suffix: '' },
    best_vam: { title: t('records.categories.bestVam.title'), description: t('records.categories.bestVam.description'), valueKey: 'vam', suffix: t('records.units.vam') },
  }

  const categoryInfo = categoryLabels[selectedCategory]

  return (
    <div className="space-y-6">
      {/* Header with Sport Toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('records.title')}</h2>
          <p className="text-muted-foreground">
            {t('records.subtitle')}
          </p>
        </div>

        {/* Sport Type Toggle */}
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-1.5">
          <button
            onClick={() => setSportType('Ride')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 border',
              sportType === 'Ride'
                ? 'bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg'
                : 'hover:bg-secondary/50 border-transparent text-muted-foreground'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18.5" cy="17.5" r="3.5"/>
              <circle cx="5.5" cy="17.5" r="3.5"/>
              <circle cx="15" cy="5" r="1"/>
              <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
            </svg>
            {t('records.sport.ride')}
          </button>
          <button
            onClick={() => setSportType('Run')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer flex items-center gap-2 border',
              sportType === 'Run'
                ? 'bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg'
                : 'hover:bg-secondary/50 border-transparent text-muted-foreground'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            {t('records.sport.run')}
          </button>
        </div>
      </div>

      {/* Best Efforts Section */}
      <Card className="transition-all hover:shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            {sportType === 'Run' ? t('records.bestEfforts.runningTitle') : t('records.bestEfforts.powerTitle')}
          </CardTitle>
          <CardDescription>
            {sportType === 'Run'
              ? runningEfforts && runningEfforts.activities_analyzed > 0
                ? t('records.bestEfforts.runningDescWithCount', { count: runningEfforts.activities_analyzed })
                : t('records.bestEfforts.runningDesc')
              : powerCurve && powerCurve.activities_analyzed > 0
                ? t('records.bestEfforts.powerDescWithCount', { count: powerCurve.activities_analyzed })
                : t('records.bestEfforts.powerDesc')
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sportType === 'Run' ? (
            // Running Best Efforts - Compact Grid
            runningEffortsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-24 bg-secondary/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : runningEfforts && runningEfforts.efforts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {runningEfforts.efforts.map((effort, idx) => (
                  <Link
                    key={idx}
                    to={`/activity/${effort.activity_id}`}
                    className="block cursor-pointer hover:scale-105 transition-transform"
                  >
                    <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg p-3 text-center border border-green-500/30">
                      <p className="text-xs text-muted-foreground mb-1">{effort.label}</p>
                      <p className="text-xl font-bold text-green-500">{effort.pace}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDuration(effort.time_seconds)}
                      </p>
                      {effort.avg_hr && (
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {effort.avg_hr} bpm
                        </p>
                      )}
                      {effort.activity_date && (
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                          {formatActivityDate(effort.activity_date)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">{t('records.bestEfforts.emptyRunning')}</p>
            )
          ) : (
            // Cycling Power Efforts - Compact Grid
            powerCurveLoading ? (
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="h-24 bg-secondary/30 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : powerCurve && powerCurve.durations && powerCurve.durations.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
                {powerCurve.durations
                  .slice(0, 9) // Show first 9 durations from cache
                  .map((point, idx) => (
                    <Link
                      key={idx}
                      to={point.activity_id ? `/activity/${point.activity_id}` : '#'}
                      className={`block ${point.activity_id ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                    >
                      <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg p-3 text-center border border-yellow-500/30">
                        <p className="text-xs text-muted-foreground mb-1">{point.label}</p>
                        <p className="text-xl font-bold text-yellow-500">
                          {point.watts > 0 ? point.watts : t('common.notAvailable')}W
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {point.watts_per_kg ? `${point.watts_per_kg.toFixed(1)} W/kg` : t('common.notAvailable')}
                        </p>
                        {point.activity_date && (
                          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                            {formatActivityDate(point.activity_date)}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">{t('records.bestEfforts.emptyPower')}</p>
            )
          )}
        </CardContent>
      </Card>

      {/* Streak Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {streaksLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title={t('records.streaks.current.title')}
              value={streaks?.current_streak || 0}
              suffix={t('records.units.days')}
              description={t('records.streaks.current.description')}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
              }
            />
            <StatCard
              title={t('records.streaks.longest.title')}
              value={streaks?.longest_streak || 0}
              suffix={t('records.units.days')}
              description={streaks?.longest_streak_start && streaks?.longest_streak_end
                ? `${formatShortDate(streaks.longest_streak_start)} - ${formatShortDate(streaks.longest_streak_end)}`
                : t('records.streaks.longest.allTime')
              }
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                  <path d="M4 22h16"/>
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                </svg>
              }
            />
            <StatCard
              title={t('records.streaks.total.title')}
              value={streaks?.total_active_days || 0}
              suffix={t('records.units.days')}
              description={t('records.streaks.total.description')}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 2v4"/>
                  <path d="M16 2v4"/>
                  <rect width="18" height="18" x="3" y="4" rx="2"/>
                  <path d="M3 10h18"/>
                </svg>
              }
            />
            <StatCard
              title={t('records.streaks.frequency.title')}
              value={streaks?.total_active_days && yearlyStats?.[0]
                ? Math.round((streaks.total_active_days / (yearlyStats.reduce((sum, y) => sum + Number(y.activity_count), 0) || 1)) * 100)
                : 0
              }
              suffix="%"
              description={t('records.streaks.frequency.description')}
              icon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                </svg>
              }
            />
          </>
        )}
      </div>

      {/* Year over Year Comparison */}
      <Card className="transition-all hover:shadow-lg">
        <CardHeader>
          <CardTitle>{t('records.yearOverYear.title')}</CardTitle>
          <CardDescription>{t('records.yearOverYear.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {yearlyLoading ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearlyStats?.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="year" stroke={chartColors.text} fontSize={12} />
                <YAxis stroke={chartColors.text} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${chartColors.grid}`,
                    borderRadius: '8px',
                  }}
                  formatter={(value, name) => {
                    if (name === 'total_distance_km') return [`${Number(value).toFixed(0)} km`, t('records.units.distance')]
                    if (name === 'activity_count') return [String(value), t('records.units.activities')]
                    return [String(value), String(name)]
                  }}
                />
                <Bar dataKey="total_distance_km" fill={chartColors.primary} radius={[4, 4, 0, 0]} name="total_distance_km" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Yearly Stats Table */}
          {!yearlyLoading && yearlyStats && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">{t('records.yearOverYear.table.year')}</th>
                    <th className="text-right py-2 font-medium">{t('records.yearOverYear.table.activities')}</th>
                    <th className="text-right py-2 font-medium">{t('records.yearOverYear.table.distance')}</th>
                    <th className="text-right py-2 font-medium">{t('records.yearOverYear.table.time')}</th>
                    <th className="text-right py-2 font-medium">{t('records.yearOverYear.table.elevation')}</th>
                    <th className="text-right py-2 font-medium">{t('records.yearOverYear.table.avgDistance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyStats.map((year) => (
                    <tr key={year.year} className="border-b hover:bg-secondary/50 transition-colors">
                      <td className="py-3 font-medium">{year.year}</td>
                      <td className="py-3 text-right">{Number(year.activity_count).toLocaleString()}</td>
                      <td className="py-3 text-right text-primary font-medium">
                        {Number(year.total_distance_km).toFixed(0)} km
                      </td>
                      <td className="py-3 text-right">{Number(year.total_hours).toFixed(0)} h</td>
                      <td className="py-3 text-right">{Number(year.total_elevation_m).toLocaleString()} m</td>
                      <td className="py-3 text-right">{Number(year.avg_distance_km).toFixed(1)} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 10 Records */}
      <Card className="transition-all hover:shadow-lg">
        <CardHeader>
          <div>
            <CardTitle>{t('records.top.title')}</CardTitle>
            <CardDescription>{t('records.top.description')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {(Object.keys(categoryLabels) as RecordCategory[]).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 text-sm rounded-lg transition-all cursor-pointer ${
                  selectedCategory === category
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {categoryLabels[category].title}
              </button>
            ))}
          </div>

          {/* Records List */}
          {recordsLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30">
                  <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-1/4 animate-pulse" />
                  </div>
                  <div className="h-4 bg-muted rounded w-16 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">{categoryInfo.description}</p>
              {currentRecords.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t('records.top.empty')}</p>
              ) : (
                currentRecords.map((activity, index) => (
                  <Link
                    key={activity.strava_activity_id}
                    to={`/activity/${activity.strava_activity_id}`}
                    className="flex items-center gap-4 p-4 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    {/* Rank Badge */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? 'bg-yellow-500 text-yellow-950' :
                      index === 1 ? 'bg-gray-300 text-gray-800' :
                      index === 2 ? 'bg-amber-600 text-amber-950' :
                      'bg-secondary text-secondary-foreground'
                    }`}>
                      {index + 1}
                    </div>

                    {/* Activity Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate group-hover:text-primary transition-colors">
                        {activity.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatShortDate(activity.start_date)} • {t(`activities.filters.types.${activity.type}`, { defaultValue: activity.type })}
                      </p>
                    </div>

                    {/* Value */}
                    <div className="text-right">
                      <RecordValue
                        activity={activity}
                        valueKey={categoryInfo.valueKey}
                        suffix={categoryInfo.suffix}
                      />
                      {categoryInfo.valueKey !== 'distance_km' && (
                        <p className="text-xs text-muted-foreground">
                          {Number(activity.distance_km).toFixed(2)} {t('records.units.km')}
                        </p>
                      )}
                    </div>

                    {/* Arrow */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-muted-foreground group-hover:text-primary transition-colors"
                    >
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                  </Link>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
