import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { getTrainingLoadPMC, getHeartRateZones, getWeekdayDistribution, getMonthlyComparison, getTimeOfDayDistribution, getFTP, getRunningActivities, getBulkPowerMetrics } from '../lib/api'
import { useTheme } from '../components/ThemeProvider'
import { getChartColors, getHeartRateZoneColors } from '../lib/chartTheme'
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart
} from 'recharts'
import { TrainingLoadChart } from '../components/charts/TrainingLoadChart'
import { useTranslation } from 'react-i18next'

export function Training() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [activityType, setActivityType] = useState<string>('Ride') // 'Ride' or 'Run' - no 'All' option
  const [paceTimePeriod, setPaceTimePeriod] = useState<number>(0) // 0 = All Time for pace charts

  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatMonthYear = (value: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { month: 'short', year: '2-digit' }).format(new Date(value))
    } catch {
      return value
    }
  }
  const formatLongDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
    } catch {
      return value
    }
  }
  const formatDayMonth = (value: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { day: '2-digit', month: '2-digit' }).format(new Date(value))
    } catch {
      return value
    }
  }
  const getWeekdayLabel = (dayIndex: number) => {
    const base = new Date(2020, 5, 1)
    const offset = dayIndex === 0 ? 6 : dayIndex - 1
    const date = new Date(base)
    date.setDate(base.getDate() + offset)
    return new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(date)
  }

  // Get theme-aware chart colors
  const colors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')
  const hrZoneColors = getHeartRateZoneColors()

  // Fixed time period: last 12 months for patterns and efficiency metrics
  const monthsForPeriod = 12

  // Fetch FTP to enable TSS calculations
  const { data: ftpData } = useQuery({
    queryKey: ['ftp'],
    queryFn: getFTP,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch TSS-based training load (CTL/ATL/TSB) - last 90 days for better context
  const ninetyDaysAgo = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - 90)
    return date.toISOString().split('T')[0]
  }, [])

  const { data: trainingLoad, isLoading: loadingTraining } = useQuery({
    queryKey: ['training-load-pmc', activityType],
    queryFn: () => getTrainingLoadPMC({
      startDate: ninetyDaysAgo,
      endDate: new Date().toISOString().split('T')[0],
      type: activityType || undefined,
    }),
    staleTime: 5 * 60 * 1000,
    enabled: !!ftpData?.ftp, // Only fetch if FTP is set
  })

  const { data: hrZones, isLoading: loadingZones } = useQuery({
    queryKey: ['hr-zones', activityType],
    queryFn: () => getHeartRateZones({ type: activityType || undefined, months: monthsForPeriod }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: weekdayData, isLoading: loadingWeekday } = useQuery({
    queryKey: ['weekday-distribution', activityType],
    queryFn: () => getWeekdayDistribution({ type: activityType || undefined, months: monthsForPeriod }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: monthlyData, isLoading: loadingMonthly } = useQuery({
    queryKey: ['monthly-comparison', activityType],
    queryFn: () => getMonthlyComparison({ type: activityType || undefined, months: monthsForPeriod }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: timeOfDayData, isLoading: loadingTimeOfDay } = useQuery({
    queryKey: ['time-of-day', activityType],
    queryFn: () => getTimeOfDayDistribution({ type: activityType || undefined, months: monthsForPeriod }),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch all running activities for pace scatter plot (only when activityType is 'Run') - uses separate paceTimePeriod
  const isRunning = activityType === 'Run'
  const paceMonthsForPeriod = paceTimePeriod === 0 ? undefined : paceTimePeriod
  const { data: runningActivities } = useQuery({
    queryKey: ['running-activities', paceTimePeriod],
    queryFn: () => getRunningActivities({ months: paceMonthsForPeriod }),
    enabled: isRunning,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch training load data (power metrics) - filter by activity type
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: recentPowerMetrics } = useQuery({
    queryKey: ['bulk-power-metrics', activityType],
    queryFn: () => getBulkPowerMetrics({
      startDate: thirtyDaysAgo.toISOString().split('T')[0],
      type: activityType || undefined,
    }),
    staleTime: 5 * 60 * 1000,
    enabled: !!ftpData?.ftp, // Only fetch if FTP is set
  })

  // Legacy chartColors for backward compatibility
  const chartColors = {
    grid: colors.grid,
    text: colors.axis,
  }

  // Format time of day data for chart
  const timeOfDayChartData = useMemo(() => {
    if (!timeOfDayData) return []
    return timeOfDayData.map(slot => ({
      slot: slot.time_slot,
      activities: parseInt(slot.activity_count),
      distance: Number(parseFloat(slot.total_distance_km).toFixed(1)),
      avgDistance: Number(parseFloat(slot.avg_distance_km).toFixed(1)),
    }))
  }, [timeOfDayData])


  // Format HR zones for pie chart - now using the zones array from API
  const hrZoneData = useMemo(() => {
    if (!hrZones || !hrZones.zones) return []
    if (hrZones.total_minutes === 0) return []
    return hrZones.zones.map(zone => ({
      name: zone.name,
      value: zone.minutes,
      percent: zone.percentage,
      color: zone.color,
    }))
  }, [hrZones])

  // Format weekday distribution data
  const weekdayChartData = useMemo(() => {
    if (!weekdayData) return []
    // Reorder so Monday is first
    const dayOrder = [1, 2, 3, 4, 5, 6, 0] // Mon-Sun
    return dayOrder.map(day => {
      const data = weekdayData.find(d => d.day_of_week === day)
      return data ? {
        day: getWeekdayLabel(day),
        activities: parseInt(data.activity_count),
        distance: parseFloat(data.total_distance_km),
        avgDistance: parseFloat(data.avg_distance_km),
      } : null
    }).filter(Boolean)
  }, [weekdayData, dateLocale])

  // Format monthly comparison data - group by year for comparison
  const monthlyChartData = useMemo(() => {
    if (!monthlyData) return []
    return monthlyData.map(m => ({
      month: `${m.month_name} ${m.year}`,
      year: m.year,
      distance: parseFloat(m.total_distance_km),
      hours: parseFloat(m.total_hours),
      activities: parseInt(m.activity_count),
      elevation: parseInt(m.total_elevation),
    }))
  }, [monthlyData])

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0
      ? t('training.units.hoursMinutes', { hours, minutes: mins })
      : t('training.units.minutesOnly', { minutes: mins })
  }

  const formatDurationShort = (durationSeconds: number) => {
    const durationMinutes = Math.round(durationSeconds / 60)
    const hours = Math.floor(durationMinutes / 60)
    const minutes = durationMinutes % 60
    return hours > 0
      ? t('training.units.hoursMinutesCompact', { hours, minutes: minutes.toString().padStart(2, '0') })
      : t('training.units.minutesShort', { minutes })
  }

  const isLoading = loadingTraining || loadingZones || loadingWeekday || loadingMonthly
  const paceLabel = t('training.pace.tooltip.pace')
  const distanceLabel = t('training.pace.tooltip.distance')
  const avgHrLabel = t('training.pace.tooltip.avgHr')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('training.title')}</h2>
          <p className="text-muted-foreground">
            {t('training.subtitle')}
          </p>
        </div>
        {/* Activity Type Toggle - Only Ride/Run */}
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-1.5">
          <button
            onClick={() => setActivityType('Ride')}
            className={`px-4 py-2 text-sm rounded-md transition-all font-medium flex items-center gap-2 cursor-pointer border ${
              activityType === 'Ride'
                ? 'bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg'
                : 'hover:bg-secondary/50 border-transparent text-muted-foreground'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18.5" cy="17.5" r="3.5"/>
              <circle cx="5.5" cy="17.5" r="3.5"/>
              <circle cx="15" cy="5" r="1"/>
              <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
            </svg>
            {t('training.activityTypes.ride')}
          </button>
          <button
            onClick={() => setActivityType('Run')}
            className={`px-4 py-2 text-sm rounded-md transition-all font-medium flex items-center gap-2 cursor-pointer border ${
              activityType === 'Run'
                ? 'bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-lg'
                : 'hover:bg-secondary/50 border-transparent text-muted-foreground'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            {t('training.activityTypes.run')}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-muted-foreground">{t('training.loading.analytics')}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Training Load Chart (CTL/ATL/TSB) - Cycling only */}
          {activityType === 'Ride' && (
            <>
              {loadingTraining && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <div className="text-muted-foreground">{t('training.loading.trainingLoad')}</div>
                  </CardContent>
                </Card>
              )}

              {!loadingTraining && ftpData?.ftp && trainingLoad && trainingLoad.dailyValues.length > 0 && (
                <TrainingLoadChart
                  data={trainingLoad.dailyValues}
                  currentCTL={trainingLoad.current.ctl}
                  currentATL={trainingLoad.current.atl}
                  currentTSB={trainingLoad.current.tsb}
                />
              )}

              {!loadingTraining && ftpData && !ftpData.ftp && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-muted-foreground opacity-50">
                      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                    </svg>
                    <h3 className="text-lg font-medium mb-2">{t('training.trainingLoad.requiredTitle')}</h3>
                    <p className="text-muted-foreground mb-4">
                      {t('training.trainingLoad.requiredBody')}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Heart Rate Zones - Only show when filtering by Run */}
          {isRunning && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  </svg>
                  {t('training.hrZones.title')}
                </CardTitle>
                <CardDescription>
                  {t('training.hrZones.subtitle', { months: monthsForPeriod })}
                  {hrZones && hrZones.activities_analyzed > 0 && (
                    <span className="ml-2">• {t('training.hrZones.activities', { count: hrZones.activities_analyzed })}</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hrZoneData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={250}>
                      <PieChart>
                        <Pie
                          data={hrZoneData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {hrZoneData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || hrZoneColors[index]?.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => formatMinutes(Number(value))}
                          contentStyle={{
                            backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                            border: `1px solid ${chartColors.grid}`,
                            borderRadius: '8px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {hrZoneData.map((zone, index) => (
                        <div key={zone.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: zone.color || hrZoneColors[index]?.color }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{zone.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {zone.percent}% • {formatMinutes(zone.value)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    {t('training.noData.hrZones')}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* All Running Activities Pace Scatter Plot - Only show when filtering by Run */}
          {isRunning && runningActivities && runningActivities.activities.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 2a7 7 0 1 0 10 10"/>
                      </svg>
                      {t('training.pace.title')}
                    </CardTitle>
                    <CardDescription>
                      {t('training.pace.subtitle', { count: runningActivities.total_activities })}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                    <button
                      onClick={() => setPaceTimePeriod(0)}
                      className={`px-2 py-1 text-xs rounded-md transition-all ${
                        paceTimePeriod === 0
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('training.pace.filters.all')}
                    </button>
                    <button
                      onClick={() => setPaceTimePeriod(24)}
                      className={`px-2 py-1 text-xs rounded-md transition-all ${
                        paceTimePeriod === 24
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('training.pace.filters.twoYears')}
                    </button>
                    <button
                      onClick={() => setPaceTimePeriod(12)}
                      className={`px-2 py-1 text-xs rounded-md transition-all ${
                        paceTimePeriod === 12
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('training.pace.filters.oneYear')}
                    </button>
                    <button
                      onClick={() => setPaceTimePeriod(6)}
                      className={`px-2 py-1 text-xs rounded-md transition-all ${
                        paceTimePeriod === 6
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('training.pace.filters.sixMonths')}
                    </button>
                    <button
                      onClick={() => setPaceTimePeriod(3)}
                      className={`px-2 py-1 text-xs rounded-md transition-all ${
                        paceTimePeriod === 3
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t('training.pace.filters.threeMonths')}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={runningActivities.activities}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis
                      dataKey="date"
                      stroke={chartColors.text}
                      fontSize={11}
                      tickFormatter={(value) => formatMonthYear(value)}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke={chartColors.text}
                      fontSize={11}
                      label={{ value: t('training.pace.axis'), angle: -90, position: 'insideLeft', style: { fill: chartColors.text } }}
                      reversed
                      domain={['auto', 'auto']}
                      tickFormatter={(value) => {
                        const minutes = Math.floor(value)
                        const seconds = Math.round((value - minutes) * 60)
                        return `${minutes}:${seconds.toString().padStart(2, '0')}`
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                        border: `1px solid ${chartColors.grid}`,
                        borderRadius: '8px',
                      }}
                      formatter={(value: any, name?: string) => {
                        if (name === paceLabel) {
                          return [`${value} ${t('training.units.pace')}`, name]
                        }
                        if (name === distanceLabel) {
                          return [`${value} ${t('records.units.km')}`, name]
                        }
                        return [value, name]
                      }}
                      labelFormatter={(label) => formatLongDate(label)}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload
                          return (
                            <div style={{
                              backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                              border: `1px solid ${chartColors.grid}`,
                              borderRadius: '8px',
                              padding: '8px'
                            }}>
                              <p className="font-semibold">{data.name}</p>
                              <p className="text-sm text-muted-foreground">{formatLongDate(data.date)}</p>
                              <p className="text-sm mt-1">{paceLabel}: <span className="font-medium">{data.avg_pace} {t('training.units.pace')}</span></p>
                              <p className="text-sm">{distanceLabel}: <span className="font-medium">{data.distance_km.toFixed(2)} {t('records.units.km')}</span></p>
                              {data.avg_hr && <p className="text-sm">{avgHrLabel}: <span className="font-medium">{t('activity.units.bpm', { value: data.avg_hr })}</span></p>}
                            </div>
                          )
                        }
                        return null
                      }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="avg_pace_decimal"
                      stroke={colors.primary}
                      strokeWidth={0}
                      dot={{ fill: colors.primary, r: 4 }}
                      name={paceLabel}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Training Load (Last 30 Days) - Power-based activities only */}
          {ftpData?.ftp && recentPowerMetrics && recentPowerMetrics.activities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                  </svg>
                  {t('training.trainingLoad.title', { days: 30 })}
                </CardTitle>
                <CardDescription>
                  {t('training.trainingLoad.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('training.trainingLoad.summary.activities')}</div>
                      <div className="text-2xl font-bold">{recentPowerMetrics.activities.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('training.trainingLoad.summary.tss')}</div>
                      <div className="text-2xl font-bold">
                        {recentPowerMetrics.activities
                          .reduce((sum, a) => sum + (a.training_stress_score || 0), 0)
                          .toFixed(0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('training.trainingLoad.summary.avgIf')}</div>
                      <div className="text-2xl font-bold">
                        {(recentPowerMetrics.activities
                          .filter(a => a.intensity_factor)
                          .reduce((sum, a) => sum + (a.intensity_factor || 0), 0) /
                          recentPowerMetrics.activities.filter(a => a.intensity_factor).length
                        ).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t('training.trainingLoad.summary.ftp')}</div>
                      <div className="text-2xl font-bold">{t('activity.units.watt', { value: ftpData.ftp })}</div>
                    </div>
                  </div>

                  {/* Activity List */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 px-2">{t('training.trainingLoad.table.date')}</th>
                          <th className="text-left py-2 px-2">{t('training.trainingLoad.table.activity')}</th>
                          <th className="text-right py-2 px-2">{t('training.trainingLoad.table.duration')}</th>
                          <th className="text-right py-2 px-2">{t('training.trainingLoad.table.avgPower')}</th>
                          <th className="text-right py-2 px-2">{t('training.trainingLoad.table.np')}</th>
                          <th className="text-right py-2 px-2">{t('training.trainingLoad.table.if')}</th>
                          <th className="text-right py-2 px-2">{t('training.trainingLoad.table.tss')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPowerMetrics.activities
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((activity) => {
                            const durationStr = formatDurationShort(activity.duration_seconds)

                            return (
                              <tr key={activity.activity_id} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-2 text-muted-foreground">
                                  {formatDayMonth(activity.date)}
                                </td>
                                <td className="py-2 px-2">
                                  <Link
                                    to={`/activity/${activity.activity_id}`}
                                    className="hover:text-primary hover:underline"
                                  >
                                    {activity.name}
                                  </Link>
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums">{durationStr}</td>
                                <td className="py-2 px-2 text-right tabular-nums">
                                  {activity.average_power ? t('activity.units.watt', { value: activity.average_power }) : t('common.notAvailable')}
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums font-medium">
                                  {activity.normalized_power ? t('activity.units.watt', { value: activity.normalized_power }) : t('common.notAvailable')}
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums">
                                  {activity.intensity_factor ? (
                                    <span className={
                                      activity.intensity_factor >= 1.05 ? 'text-orange-500' :
                                      activity.intensity_factor >= 0.95 ? 'text-yellow-500' :
                                      'text-muted-foreground'
                                    }>
                                      {activity.intensity_factor.toFixed(2)}
                                    </span>
                                  ) : t('common.notAvailable')}
                                </td>
                                <td className="py-2 px-2 text-right tabular-nums font-medium">
                                  {activity.training_stress_score ? (
                                    <span className={
                                      activity.training_stress_score >= 150 ? 'text-red-500' :
                                      activity.training_stress_score >= 100 ? 'text-orange-500' :
                                      activity.training_stress_score >= 50 ? 'text-yellow-500' :
                                      'text-green-500'
                                    }>
                                      {activity.training_stress_score.toFixed(0)}
                                    </span>
                                  ) : t('common.notAvailable')}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Weekday Distribution */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <CardTitle>{t('training.weekday.title')}</CardTitle>
              </div>
              <CardDescription>{t('training.weekday.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              {weekdayChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={weekdayChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis dataKey="day" stroke={chartColors.text} fontSize={12} />
                    <YAxis
                      yAxisId="left"
                      stroke="#8b5cf6"
                      fontSize={12}
                      label={{ value: t('training.weekday.axisActivities'), angle: -90, position: 'insideLeft', style: { fill: '#8b5cf6', fontSize: 11 } }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#fc4c02"
                      fontSize={12}
                      label={{ value: t('training.weekday.axisDistance'), angle: 90, position: 'insideRight', style: { fill: '#fc4c02' } }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                        border: `1px solid ${chartColors.grid}`,
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="activities" name={t('training.weekday.legendActivities')} fill="#8b5cf6" />
                    <Bar yAxisId="right" dataKey="distance" name={t('training.weekday.legendDistance')} fill="#fc4c02" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : loadingWeekday ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {t('training.loading.weekday')}
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {t('training.noData.weekday')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time of Day Distribution */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <CardTitle>{t('training.timeOfDay.title')}</CardTitle>
              </div>
              <CardDescription>{t('training.timeOfDay.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              {timeOfDayChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={timeOfDayChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis dataKey="slot" stroke={chartColors.text} fontSize={12} />
                    <YAxis
                      yAxisId="left"
                      stroke="#f59e0b"
                      fontSize={12}
                      label={{ value: t('training.timeOfDay.axisActivities'), angle: -90, position: 'insideLeft', style: { fill: '#f59e0b', fontSize: 11 } }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#06b6d4"
                      fontSize={12}
                      label={{ value: t('training.timeOfDay.axisDistance'), angle: 90, position: 'insideRight', style: { fill: '#06b6d4' } }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                        border: `1px solid ${chartColors.grid}`,
                        borderRadius: '8px',
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => {
                        if (!value || !name) return ['0', '']
                        if (name === t('training.timeOfDay.legendDistance')) {
                          return [`${value.toFixed(1)} ${t('records.units.km')}`, name]
                        }
                        return [value.toFixed(0), name]
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="activities" name={t('training.timeOfDay.legendActivities')} fill="#f59e0b" />
                    <Bar yAxisId="right" dataKey="distance" name={t('training.timeOfDay.legendDistance')} fill="#06b6d4" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : loadingTimeOfDay ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {t('training.loading.timeOfDay')}
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {t('training.noData.timeOfDay')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monthly Comparison */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18"/>
                  <path d="m19 9-5 5-4-4-3 3"/>
                </svg>
                <CardTitle>{t('training.monthly.title')}</CardTitle>
              </div>
              <CardDescription>{t('training.monthly.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              {monthlyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis
                      dataKey="month"
                      stroke={chartColors.text}
                      fontSize={10}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval={Math.ceil(monthlyChartData.length / 12)}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#fc4c02"
                      fontSize={12}
                      label={{ value: t('training.monthly.axisDistance'), angle: -90, position: 'insideLeft', style: { fill: '#fc4c02' } }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#22c55e"
                      fontSize={12}
                      label={{ value: t('training.monthly.axisHours'), angle: 90, position: 'insideRight', style: { fill: '#22c55e' } }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                        border: `1px solid ${chartColors.grid}`,
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="distance" name={t('training.monthly.legendDistance')} fill="#fc4c02" opacity={0.8} />
                    <Line yAxisId="right" type="monotone" dataKey="hours" name={t('training.monthly.legendHours')} stroke="#22c55e" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : loadingMonthly ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {t('training.loading.monthly')}
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  {t('training.noData.monthly')}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
