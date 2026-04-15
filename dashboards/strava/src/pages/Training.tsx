import { useEffect, useState, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { getTrainingLoadPMC, getHeartRateZones, getWeekdayDistribution, getMonthlyComparison, getTimeOfDayDistribution, getFTP, getRunningActivities, getBulkPowerMetrics } from '../lib/api'
import { useTheme } from '../components/ThemeProvider'
import { getChartColors, getHeartRateZoneColors } from '../lib/chartTheme'
import { buildRunningPerformanceSamples, summarizeRunningPerformance } from '../lib/runningMetrics'
import { buildCyclingPerformanceSamples, summarizeCyclingPerformance } from '../lib/cyclingMetrics'
import {
  Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart
} from 'recharts'
import { TrainingLoadChart } from '../components/charts/TrainingLoadChart'
import { useTranslation } from 'react-i18next'

export function Training() {
  const MIN_CYCLING_TREND_MONTH_SAMPLES = 3
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedActivityType = searchParams.get('type') === 'Run' ? 'Run' : 'Ride'
  const [activityType, setActivityType] = useState<string>(requestedActivityType) // 'Ride' or 'Run' - no 'All' option
  const [analysisTimePeriod, setAnalysisTimePeriod] = useState<number>(6) // 6 = recent training context
  const ANALYTICS_STALE_MS = 60 * 60 * 1000

  useEffect(() => {
    setActivityType(current => current === requestedActivityType ? current : requestedActivityType)
  }, [requestedActivityType])

  const updateActivityType = (nextType: 'Ride' | 'Run') => {
    setActivityType(nextType)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('type', nextType)
    setSearchParams(nextParams, { replace: true })
  }

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
  const isRunning = activityType === 'Run'

  const sidebarPeriodParam: number | 'all' = analysisTimePeriod === 0 ? 'all' : analysisTimePeriod

  // Fetch FTP to enable TSS calculations
  const { data: ftpData } = useQuery({
    queryKey: ['ftp'],
    queryFn: getFTP,
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
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
    staleTime: ANALYTICS_STALE_MS,
    enabled: !!ftpData?.ftp, // Only fetch if FTP is set
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const { data: hrZones, isLoading: loadingZones } = useQuery({
    queryKey: ['hr-zones', activityType, sidebarPeriodParam],
    queryFn: () => getHeartRateZones({ type: activityType || undefined, months: sidebarPeriodParam }),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const { data: weekdayData, isLoading: loadingWeekday } = useQuery({
    queryKey: ['weekday-distribution', activityType, sidebarPeriodParam],
    queryFn: () => getWeekdayDistribution({ type: activityType || undefined, months: sidebarPeriodParam }),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const { data: monthlyData, isLoading: loadingMonthly } = useQuery({
    queryKey: ['monthly-comparison', activityType, sidebarPeriodParam],
    queryFn: () => getMonthlyComparison({ type: activityType || undefined, months: sidebarPeriodParam }),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const { data: timeOfDayData, isLoading: loadingTimeOfDay } = useQuery({
    queryKey: ['time-of-day', activityType, sidebarPeriodParam],
    queryFn: () => getTimeOfDayDistribution({ type: activityType || undefined, months: sidebarPeriodParam }),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  // Fetch all running activities for pace chart and running-performance insights
  const paceMonthsForPeriod = analysisTimePeriod === 0 ? undefined : analysisTimePeriod
  const { data: runningActivities } = useQuery({
    queryKey: ['running-activities', analysisTimePeriod],
    queryFn: () => getRunningActivities({ months: paceMonthsForPeriod }),
    enabled: isRunning,
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const analysisStartDate = useMemo(() => {
    if (analysisTimePeriod === 0) return undefined
    const start = new Date()
    start.setMonth(start.getMonth() - analysisTimePeriod)
    return start.toISOString().split('T')[0]
  }, [analysisTimePeriod])

  const runningPerformanceSamples = useMemo(() => {
    if (!runningActivities) return []
    return buildRunningPerformanceSamples(
      runningActivities.activities.map((activity) => ({
        date: activity.date,
        distanceKm: activity.distance_km,
        movingTimeSec: activity.moving_time,
        avgHr: activity.avg_hr,
        avgPaceMinPerKm: activity.avg_pace_decimal,
      })),
    )
  }, [runningActivities])

  const runningPerformanceSummary = useMemo(
    () => summarizeRunningPerformance(runningPerformanceSamples),
    [runningPerformanceSamples],
  )

  const runningPerformanceTrendData = useMemo(() => {
    const grouped = new Map<string, typeof runningPerformanceSamples>()

    runningPerformanceSamples.forEach((sample) => {
      const monthKey = sample.date.slice(0, 7)
      const bucket = grouped.get(monthKey) ?? []
      bucket.push(sample)
      grouped.set(monthKey, bucket)
    })

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, samples]) => {
        const summary = summarizeRunningPerformance(samples)
        return {
          month,
          label: formatMonthYear(`${month}-01`),
          pace150: summary.medianNormalizedPace150,
          efficiency: summary.medianEfficiency,
          avgHr: summary.avgHr,
          sampleCount: summary.sampleCount,
        }
      })
      .filter((item) => item.pace150 !== null)
  }, [runningPerformanceSamples, dateLocale])

  const runningPaceChartData = useMemo(() => {
    if (!runningActivities?.activities?.length) return []

    return runningActivities.activities.map((activity, index, activities) => {
      const windowStart = Math.max(0, index - 2)
      const windowEnd = Math.min(activities.length, index + 3)
      const windowActivities = activities.slice(windowStart, windowEnd)
      const rollingAverage =
        windowActivities.reduce((sum, item) => sum + item.avg_pace_decimal, 0) / windowActivities.length

      return {
        ...activity,
        rolling_pace_decimal: Number(rollingAverage.toFixed(3)),
      }
    })
  }, [runningActivities])

  const runningPaceSummary = useMemo(() => {
    if (!runningPaceChartData.length) {
      return {
        averagePace: null as number | null,
        bestPace: null as number | null,
        averageDistance: null as number | null,
      }
    }

    const totalPace = runningPaceChartData.reduce((sum, activity) => sum + activity.avg_pace_decimal, 0)
    const totalDistance = runningPaceChartData.reduce((sum, activity) => sum + activity.distance_km, 0)
    const bestPace = runningPaceChartData.reduce(
      (best, activity) => Math.min(best, activity.avg_pace_decimal),
      Number.POSITIVE_INFINITY,
    )

    return {
      averagePace: totalPace / runningPaceChartData.length,
      bestPace: Number.isFinite(bestPace) ? bestPace : null,
      averageDistance: totalDistance / runningPaceChartData.length,
    }
  }, [runningPaceChartData])

  const recentRunningActivities = useMemo(() => {
    if (!runningActivities?.activities?.length) return []

    return [...runningActivities.activities]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8)
  }, [runningActivities])

  const thirtyDaysAgo = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date.toISOString().split('T')[0]
  }, [])

  // Fetch power metrics for the selected analysis window
  const { data: cyclingPowerMetrics, isFetching: fetchingCyclingPowerMetrics } = useQuery({
    queryKey: ['cycling-power-metrics', activityType, analysisStartDate],
    queryFn: () => getBulkPowerMetrics({
      startDate: analysisStartDate,
      type: activityType || undefined,
    }),
    staleTime: ANALYTICS_STALE_MS,
    enabled: activityType === 'Ride',
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  // Separate 30-day power window for the existing TSS/IF table
  const { data: recentPowerMetrics } = useQuery({
    queryKey: ['bulk-power-metrics', activityType, thirtyDaysAgo],
    queryFn: () => getBulkPowerMetrics({
      startDate: thirtyDaysAgo,
      type: activityType || undefined,
    }),
    staleTime: ANALYTICS_STALE_MS,
    enabled: activityType === 'Ride',
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const cyclingPerformanceSamples = useMemo(() => {
    if (!cyclingPowerMetrics?.activities?.length) return []
    return buildCyclingPerformanceSamples(
      cyclingPowerMetrics.activities.map((activity) => ({
        date: activity.date,
        durationSec: activity.duration_seconds,
        distanceKm: (activity.distance_m || 0) / 1000,
        avgHr: activity.average_heartrate,
        avgPower: activity.average_power,
        normalizedPower: activity.normalized_power,
        powerAt150Bpm: activity.power_at_150bpm,
        decouplingPct: activity.decoupling_pct,
        durabilityPct: activity.durability_pct,
      })),
    )
  }, [cyclingPowerMetrics])

  const cyclingPerformanceSummary = useMemo(
    () => summarizeCyclingPerformance(cyclingPerformanceSamples),
    [cyclingPerformanceSamples],
  )

  const cyclingPerformanceTrendData = useMemo(() => {
    const grouped = new Map<string, typeof cyclingPerformanceSamples>()

    cyclingPerformanceSamples.forEach((sample) => {
      const monthKey = sample.date.slice(0, 7)
      const bucket = grouped.get(monthKey) ?? []
      bucket.push(sample)
      grouped.set(monthKey, bucket)
    })

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, samples]) => {
        const summary = summarizeCyclingPerformance(samples)
        return {
          month,
          label: formatMonthYear(`${month}-01`),
          power150: summary.sampleCount >= MIN_CYCLING_TREND_MONTH_SAMPLES ? summary.medianNormalizedPower150 : null,
          efficiency: summary.medianEfficiency,
          avgHr: summary.avgHr,
          sampleCount: summary.sampleCount,
        }
      })
  }, [cyclingPerformanceSamples, dateLocale, MIN_CYCLING_TREND_MONTH_SAMPLES])

  // Legacy chartColors for backward compatibility
  const chartColors = {
    grid: colors.grid,
    text: colors.axis,
  }
  const trainingPalette = {
    primary: colors.primary,
    secondary: colors.accent1,
    muted: colors.textMuted,
    mutedFill: resolvedTheme === 'dark' ? 'rgba(168, 162, 158, 0.82)' : 'rgba(120, 113, 108, 0.78)',
    primaryFill: resolvedTheme === 'dark' ? 'rgba(252, 76, 2, 0.82)' : 'rgba(252, 76, 2, 0.76)',
    secondaryFill: resolvedTheme === 'dark' ? 'rgba(245, 158, 11, 0.78)' : 'rgba(245, 158, 11, 0.72)',
    surface: resolvedTheme === 'dark' ? 'rgba(39, 39, 42, 0.55)' : 'rgba(249, 250, 251, 0.9)',
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

  const formatPaceValue = (paceMinPerKm: number | null) => {
    if (!paceMinPerKm || !Number.isFinite(paceMinPerKm)) return '—'
    const minutes = Math.floor(paceMinPerKm)
    const seconds = Math.round((paceMinPerKm - minutes) * 60)
    const normalizedMinutes = seconds === 60 ? minutes + 1 : minutes
    const normalizedSeconds = seconds === 60 ? 0 : seconds
    return `${normalizedMinutes}:${normalizedSeconds.toString().padStart(2, '0')}`
  }

  const formatRunningEfficiencyValue = (paceMinPerKm: number | null, avgHr: number | null) => {
    if (!paceMinPerKm || !avgHr || !Number.isFinite(paceMinPerKm) || !Number.isFinite(avgHr) || paceMinPerKm <= 0 || avgHr <= 0) {
      return '—'
    }

    const speedMetersPerMinute = 1000 / paceMinPerKm
    return (speedMetersPerMinute / avgHr).toFixed(2)
  }

  const getRunTerrainBadge = (distanceKm: number, elevationGain: number) => {
    if (!distanceKm || distanceKm <= 0) {
      return {
        label: t('training.recentRuns.terrain.flat'),
        className: 'border-border/50 bg-background/60 text-muted-foreground',
      }
    }

    const elevationPerKm = elevationGain / distanceKm
    if (elevationPerKm >= 20) {
      return {
        label: t('training.recentRuns.terrain.hilly'),
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
      }
    }
    if (elevationPerKm >= 8) {
      return {
        label: t('training.recentRuns.terrain.rolling'),
        className: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
      }
    }
    return {
      label: t('training.recentRuns.terrain.flat'),
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    }
  }

  const formatPowerValue = (power: number | null) => {
    if (!power || !Number.isFinite(power)) return '—'
    return Math.round(power).toString()
  }

  const formatPercentValue = (value: number | null, decimals = 1) => {
    if (value === null || !Number.isFinite(value)) return '—'
    return `${value.toFixed(decimals)}%`
  }

  const getCyclingMetricStatus = (metric: 'decoupling' | 'durability', value: number | null) => {
    if (value === null || !Number.isFinite(value)) {
      return {
        label: t('training.cyclingPerformance.status.noData'),
        badgeClassName: 'border-border/50 bg-background/60 text-muted-foreground',
        valueClassName: 'text-muted-foreground',
      }
    }

    if (metric === 'decoupling') {
      if (value <= 5) {
        return {
          label: t('training.cyclingPerformance.status.good'),
          badgeClassName: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
          valueClassName: 'text-emerald-300',
        }
      }
      if (value <= 8) {
        return {
          label: t('training.cyclingPerformance.status.solid'),
          badgeClassName: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
          valueClassName: 'text-amber-300',
        }
      }
      return {
        label: t('training.cyclingPerformance.status.watch'),
        badgeClassName: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
        valueClassName: 'text-rose-300',
      }
    }

    if (value >= 95) {
      return {
        label: t('training.cyclingPerformance.status.good'),
        badgeClassName: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
        valueClassName: 'text-emerald-300',
      }
    }
    if (value >= 90) {
      return {
        label: t('training.cyclingPerformance.status.solid'),
        badgeClassName: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
        valueClassName: 'text-amber-300',
      }
    }
    return {
      label: t('training.cyclingPerformance.status.watch'),
      badgeClassName: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
      valueClassName: 'text-rose-300',
    }
  }

  const timeRangeLabels: Record<number, string> = {
    0: t('training.pace.filters.all'),
    24: t('training.pace.filters.twoYears'),
    12: t('training.pace.filters.oneYear'),
    6: t('training.pace.filters.sixMonths'),
    3: t('training.pace.filters.threeMonths'),
  }

  const isLoading = loadingTraining || loadingZones || loadingWeekday || loadingMonthly || loadingTimeOfDay
  const paceLabel = t('training.pace.tooltip.pace')
  const distanceLabel = t('training.pace.tooltip.distance')
  const avgHrLabel = t('training.pace.tooltip.avgHr')
  const rollingPaceLabel = `${t('training.pace.tooltip.pace')} Trend`
  const sidebarCardClass = 'border-border/60 bg-card/95 shadow-sm'
  const sidebarLegendClass = 'inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/10 px-2.5 py-0.5 text-[11px] text-muted-foreground'
  const paceMetricTileClass = 'rounded-xl border border-border/50 bg-background/70 px-4 py-3 shadow-sm'
  const cyclingDecouplingStatus = getCyclingMetricStatus('decoupling', cyclingPerformanceSummary.medianDecouplingPct)
  const cyclingDurabilityStatus = getCyclingMetricStatus('durability', cyclingPerformanceSummary.medianDurabilityPct)
  const showCyclingPerformanceLoading =
    activityType === 'Ride' && fetchingCyclingPowerMetrics && cyclingPerformanceSummary.sampleCount === 0

  const renderHeartRateZonesCard = () => (
    <Card className={sidebarCardClass}>
      <CardHeader className="space-y-1 pb-1">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
          {t('training.hrZones.title')}
        </CardTitle>
        <CardDescription className="text-[10px] leading-relaxed">
          {t('training.hrZones.activities', { count: hrZones?.activities_analyzed ?? 0 })}
          <span className="mx-1.5">•</span>
          {formatMinutes(hrZones?.total_minutes ?? 0)}
          {hrZones?.max_hr_used ? (
            <>
              <span className="mx-1.5">•</span>
              {t('training.hrZones.maxHrUsed', { value: hrZones.max_hr_used })}
              {hrZones.zone_basis ? ` (${t(`training.hrZones.basis.${hrZones.zone_basis}`)})` : null}
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {hrZoneData.length > 0 ? (
          <div className="space-y-2">
            <div className="space-y-2">
              {hrZoneData.map((zone, index) => (
                <div key={zone.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color || hrZoneColors[index]?.color }} />
                      <p className="truncate font-medium text-foreground">{zone.name}</p>
                    </div>
                    <p className="shrink-0 tabular-nums text-muted-foreground">{zone.percent}%</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary/60">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(zone.percent, 2)}%`,
                          backgroundColor: zone.color || hrZoneColors[index]?.color,
                        }}
                      />
                    </div>
                    <div className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {formatMinutes(zone.value)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-[112px] items-center justify-center text-muted-foreground">
            {t('training.noData.hrZones')}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const renderWeekdayCard = () => (
    <Card className={sidebarCardClass}>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <CardTitle className="text-sm font-semibold">{t('training.weekday.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs leading-relaxed">{t('training.weekday.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {weekdayChartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={168}>
              <ComposedChart data={weekdayChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="day" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} width={24} />
                <YAxis yAxisId="right" orientation="right" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${chartColors.grid}`,
                    borderRadius: '8px',
                  }}
                />
                <Bar yAxisId="left" dataKey="activities" name={t('training.weekday.legendActivities')} fill={trainingPalette.mutedFill} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="distance" name={t('training.weekday.legendDistance')} fill={trainingPalette.primaryFill} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <div className={sidebarLegendClass}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.muted }} />
                {t('training.weekday.legendActivities')}
              </div>
              <div className={sidebarLegendClass}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.primary }} />
                {t('training.weekday.legendDistance')}
              </div>
            </div>
          </>
        ) : loadingWeekday ? (
          <div className="flex h-[188px] items-center justify-center text-muted-foreground">{t('training.loading.weekday')}</div>
        ) : (
          <div className="flex h-[188px] items-center justify-center text-muted-foreground">{t('training.noData.weekday')}</div>
        )}
      </CardContent>
    </Card>
  )

  const renderTimeOfDayCard = () => (
    <Card className={sidebarCardClass}>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <CardTitle className="text-sm font-semibold">{t('training.timeOfDay.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs leading-relaxed">{t('training.timeOfDay.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {timeOfDayChartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={168}>
              <ComposedChart data={timeOfDayChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="slot" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} width={24} />
                <YAxis yAxisId="right" orientation="right" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} width={28} />
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
                <Bar yAxisId="left" dataKey="activities" name={t('training.timeOfDay.legendActivities')} fill={trainingPalette.secondaryFill} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="distance" name={t('training.timeOfDay.legendDistance')} fill={trainingPalette.primaryFill} radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <div className={sidebarLegendClass}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.secondary }} />
                {t('training.timeOfDay.legendActivities')}
              </div>
              <div className={sidebarLegendClass}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.primary }} />
                {t('training.timeOfDay.legendDistance')}
              </div>
            </div>
          </>
        ) : loadingTimeOfDay ? (
          <div className="flex h-[188px] items-center justify-center text-muted-foreground">{t('training.loading.timeOfDay')}</div>
        ) : (
          <div className="flex h-[188px] items-center justify-center text-muted-foreground">{t('training.noData.timeOfDay')}</div>
        )}
      </CardContent>
    </Card>
  )

  const renderMonthlyCard = () => (
    <Card className={sidebarCardClass}>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18"/>
            <path d="m19 9-5 5-4-4-3 3"/>
          </svg>
          <CardTitle className="text-sm font-semibold">{t('training.monthly.title')}</CardTitle>
        </div>
        <CardDescription className="text-xs leading-relaxed">{t('training.monthly.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {monthlyChartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={176}>
              <ComposedChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis
                  dataKey="month"
                  stroke={chartColors.text}
                  fontSize={9}
                  angle={-32}
                  textAnchor="end"
                  height={42}
                  interval={Math.max(0, Math.ceil(monthlyChartData.length / 8) - 1)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis yAxisId="left" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} width={26} />
                <YAxis yAxisId="right" orientation="right" stroke={chartColors.text} fontSize={10} tickLine={false} axisLine={false} width={30} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                    border: `1px solid ${chartColors.grid}`,
                    borderRadius: '8px',
                  }}
                />
                <Bar yAxisId="left" dataKey="distance" name={t('training.monthly.legendDistance')} fill={trainingPalette.primaryFill} opacity={0.82} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="hours" name={t('training.monthly.legendHours')} stroke={trainingPalette.muted} strokeWidth={2.25} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <div className={sidebarLegendClass}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.primary }} />
                {t('training.monthly.legendDistance')}
              </div>
              <div className={sidebarLegendClass}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.muted }} />
                {t('training.monthly.legendHours')}
              </div>
            </div>
          </>
        ) : loadingMonthly ? (
          <div className="flex h-[196px] items-center justify-center text-muted-foreground">{t('training.loading.monthly')}</div>
        ) : (
          <div className="flex h-[196px] items-center justify-center text-muted-foreground">{t('training.noData.monthly')}</div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('training.title')}</h2>
          <p className="text-muted-foreground">
            {t('training.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-1.5">
          <button
            onClick={() => updateActivityType('Ride')}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all ${
              activityType === 'Ride'
                ? 'border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background text-orange-600 shadow-lg dark:text-orange-400'
                : 'border-transparent text-muted-foreground hover:bg-secondary/50'
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
            onClick={() => updateActivityType('Run')}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all ${
              activityType === 'Run'
                ? 'border-orange-500/30 bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background text-orange-600 shadow-lg dark:text-orange-400'
                : 'border-transparent text-muted-foreground hover:bg-secondary/50'
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
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-muted-foreground">{t('training.loading.analytics')}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 space-y-5">
            {activityType === 'Ride' && (
              <>
                {showCyclingPerformanceLoading && (
                  <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.07] via-transparent to-transparent">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                            </svg>
                            {t('training.cyclingPerformance.title')}
                          </CardTitle>
                          <CardDescription>{t('training.loading.analytics')}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          {t('training.loading.updating')}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                      {[0, 1, 2, 3, 4].map((index) => (
                        <div key={index} className="rounded-xl border border-border/60 bg-background/40 p-4">
                          <div className="h-3 w-24 rounded bg-muted/60" />
                          <div className="mt-3 h-8 w-20 rounded bg-muted/50" />
                          <div className="mt-2 h-3 w-16 rounded bg-muted/40" />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {cyclingPerformanceSummary.sampleCount > 0 && (
                  <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.07] via-transparent to-transparent">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                            </svg>
                            {t('training.cyclingPerformance.title')}
                          </CardTitle>
                          <CardDescription>
                            {t('training.cyclingPerformance.subtitle', {
                              count: cyclingPerformanceSummary.sampleCount,
                              distance: cyclingPerformanceSummary.totalDistanceKm.toFixed(0),
                            })}
                          </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 rounded-full bg-secondary/70 p-1">
                          {[0, 24, 12, 6, 3].map((value) => (
                            <button
                              key={value}
                              onClick={() => setAnalysisTimePeriod(value)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                                analysisTimePeriod === value
                                  ? 'bg-background text-foreground shadow-sm'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {timeRangeLabels[value]}
                            </button>
                          ))}
                          {fetchingCyclingPowerMetrics && (
                            <span className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                              {t('training.loading.updating')}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t('training.cyclingPerformance.cards.power150')}
                          </div>
                          <div className="mt-2 text-3xl font-semibold tabular-nums text-orange-500">
                            {formatPowerValue(cyclingPerformanceSummary.medianNormalizedPower150)}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{t('training.cyclingPerformance.units.power')}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t('training.cyclingPerformance.cards.efficiency')}
                          </div>
                          <div className="mt-2 text-3xl font-semibold tabular-nums text-amber-400">
                            {cyclingPerformanceSummary.medianEfficiency?.toFixed(2) ?? '—'}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{t('training.cyclingPerformance.units.efficiency')}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {t('training.cyclingPerformance.cards.avgHr')}
                          </div>
                          <div className="mt-2 text-3xl font-semibold tabular-nums">
                            {cyclingPerformanceSummary.avgHr ? t('activity.units.bpm', { value: cyclingPerformanceSummary.avgHr }) : '—'}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{t('training.cyclingPerformance.cards.avgHrHint')}</div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              <span>{t('training.cyclingPerformance.cards.decoupling')}</span>
                              <span
                                className="inline-flex cursor-help text-muted-foreground/80"
                                title={t('training.cyclingPerformance.descriptions.decoupling')}
                                aria-label={t('training.cyclingPerformance.descriptions.decoupling')}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 16v-4" />
                                  <path d="M12 8h.01" />
                                </svg>
                              </span>
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${cyclingDecouplingStatus.badgeClassName}`}>
                              {cyclingDecouplingStatus.label}
                            </span>
                          </div>
                          <div className={`mt-2 text-3xl font-semibold tabular-nums ${cyclingDecouplingStatus.valueClassName}`}>
                            {formatPercentValue(cyclingPerformanceSummary.medianDecouplingPct)}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {t('training.cyclingPerformance.cards.decouplingHint', {
                              count: cyclingPerformanceSummary.decouplingSampleCount,
                            })}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                              <span>{t('training.cyclingPerformance.cards.durability')}</span>
                              <span
                                className="inline-flex cursor-help text-muted-foreground/80"
                                title={t('training.cyclingPerformance.descriptions.durability')}
                                aria-label={t('training.cyclingPerformance.descriptions.durability')}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 16v-4" />
                                  <path d="M12 8h.01" />
                                </svg>
                              </span>
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${cyclingDurabilityStatus.badgeClassName}`}>
                              {cyclingDurabilityStatus.label}
                            </span>
                          </div>
                          <div className={`mt-2 text-3xl font-semibold tabular-nums ${cyclingDurabilityStatus.valueClassName}`}>
                            {formatPercentValue(cyclingPerformanceSummary.medianDurabilityPct)}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {t('training.cyclingPerformance.cards.durabilityHint', {
                              count: cyclingPerformanceSummary.durabilitySampleCount,
                            })}
                          </div>
                        </div>
                      </div>

                      {cyclingPerformanceTrendData.filter((item) => item.power150 !== null).length > 1 && (
                        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                          <div className="mb-3">
                            <div className="text-sm font-medium">{t('training.cyclingPerformance.trendTitle')}</div>
                            <div className="text-xs text-muted-foreground">{t('training.cyclingPerformance.trendSubtitle')}</div>
                          </div>
                          <ResponsiveContainer width="100%" height={210}>
                            <ComposedChart data={cyclingPerformanceTrendData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                              <XAxis dataKey="label" stroke={chartColors.text} fontSize={11} />
                              <YAxis
                                stroke={chartColors.text}
                                fontSize={11}
                                domain={[0, 'auto']}
                                label={{ value: t('training.cyclingPerformance.axis'), angle: -90, position: 'insideLeft', style: { fill: chartColors.text } }}
                              />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null
                                  const data = payload[0].payload
                                  return (
                                    <div style={{
                                      backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                                      border: `1px solid ${chartColors.grid}`,
                                      borderRadius: '8px',
                                      padding: '8px',
                                    }}>
                                      <p className="font-semibold">{data.label}</p>
                                      <p className="mt-1 text-sm">
                                        {t('training.cyclingPerformance.tooltip.power150')}: <span className="font-medium">{formatPowerValue(data.power150)} {t('training.cyclingPerformance.units.power')}</span>
                                      </p>
                                      <p className="text-sm">
                                        {t('training.cyclingPerformance.tooltip.efficiency')}: <span className="font-medium">{data.efficiency?.toFixed(2)} {t('training.cyclingPerformance.units.efficiency')}</span>
                                      </p>
                                      <p className="text-sm">
                                        {t('training.cyclingPerformance.tooltip.avgHr')}: <span className="font-medium">{data.avgHr ? t('activity.units.bpm', { value: data.avgHr }) : '—'}</span>
                                      </p>
                                      <p className="text-sm text-muted-foreground">{t('training.cyclingPerformance.tooltip.rides', { count: data.sampleCount })}</p>
                                    </div>
                                  )
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="power150"
                                stroke={colors.primary}
                                strokeWidth={2.5}
                                dot={{ fill: colors.primary, r: 3.5 }}
                                activeDot={{ r: 5 }}
                                name={t('training.cyclingPerformance.tooltip.power150')}
                                isAnimationActive={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">{t('training.cyclingPerformance.footnote')}</div>
                    </CardContent>
                  </Card>
                )}

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
                      <h3 className="mb-2 text-lg font-medium">{t('training.trainingLoad.requiredTitle')}</h3>
                      <p className="text-muted-foreground">{t('training.trainingLoad.requiredBody')}</p>
                    </CardContent>
                  </Card>
                )}

              </>
            )}

            {isRunning && runningPerformanceSummary.sampleCount > 0 && (
              <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.07] via-transparent to-transparent">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                    {t('training.runPerformance.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('training.runPerformance.subtitle', {
                      count: runningPerformanceSummary.sampleCount,
                      distance: runningPerformanceSummary.totalDistanceKm.toFixed(0),
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('training.runPerformance.cards.pace150')}
                      </div>
                      <div className="mt-2 text-3xl font-semibold tabular-nums text-orange-500">
                        {formatPaceValue(runningPerformanceSummary.medianNormalizedPace150)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{t('training.units.pace')}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('training.runPerformance.cards.efficiency')}
                      </div>
                      <div className="mt-2 text-3xl font-semibold tabular-nums text-amber-400">
                        {runningPerformanceSummary.medianEfficiency?.toFixed(2) ?? '—'}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{t('training.runPerformance.units.efficiency')}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {t('training.runPerformance.cards.avgHr')}
                      </div>
                      <div className="mt-2 text-3xl font-semibold tabular-nums">
                        {runningPerformanceSummary.avgHr ? t('activity.units.bpm', { value: runningPerformanceSummary.avgHr }) : '—'}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{t('training.runPerformance.cards.avgHrHint')}</div>
                    </div>
                  </div>

                  {runningPerformanceTrendData.length > 1 && (
                    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <div className="mb-3">
                        <div className="text-sm font-medium">{t('training.runPerformance.trendTitle')}</div>
                        <div className="text-xs text-muted-foreground">{t('training.runPerformance.trendSubtitle')}</div>
                      </div>
                      <ResponsiveContainer width="100%" height={210}>
                        <ComposedChart data={runningPerformanceTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                          <XAxis dataKey="label" stroke={chartColors.text} fontSize={11} />
                          <YAxis
                            stroke={chartColors.text}
                            fontSize={11}
                            reversed
                            domain={['auto', 'auto']}
                            tickFormatter={(value) => formatPaceValue(value)}
                            label={{ value: t('training.runPerformance.axis'), angle: -90, position: 'insideLeft', style: { fill: chartColors.text } }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const data = payload[0].payload
                              return (
                                <div style={{
                                  backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                                  border: `1px solid ${chartColors.grid}`,
                                  borderRadius: '8px',
                                  padding: '8px',
                                }}>
                                  <p className="font-semibold">{data.label}</p>
                                  <p className="mt-1 text-sm">
                                    {t('training.runPerformance.tooltip.pace150')}: <span className="font-medium">{formatPaceValue(data.pace150)} {t('training.units.pace')}</span>
                                  </p>
                                  <p className="text-sm">
                                    {t('training.runPerformance.tooltip.efficiency')}: <span className="font-medium">{data.efficiency?.toFixed(2)} {t('training.runPerformance.units.efficiency')}</span>
                                  </p>
                                  <p className="text-sm">
                                    {t('training.runPerformance.tooltip.avgHr')}: <span className="font-medium">{data.avgHr ? t('activity.units.bpm', { value: data.avgHr }) : '—'}</span>
                                  </p>
                                  <p className="text-sm text-muted-foreground">{t('training.runPerformance.tooltip.runs', { count: data.sampleCount })}</p>
                                </div>
                              )
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="pace150"
                            stroke={colors.primary}
                            strokeWidth={2.5}
                            dot={{ fill: colors.primary, r: 3.5 }}
                            activeDot={{ r: 5 }}
                            name={t('training.runPerformance.tooltip.pace150')}
                            isAnimationActive={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">{t('training.runPerformance.footnote')}</div>
                </CardContent>
              </Card>
            )}

            {isRunning && runningPaceChartData.length > 0 && (
              <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.05] via-transparent to-transparent shadow-lg shadow-orange-500/5">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 2a7 7 0 1 0 10 10"/>
                        </svg>
                        {t('training.pace.title')}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">{t('training.pace.subtitle', { count: runningActivities?.total_activities ?? runningPaceChartData.length })}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 rounded-full bg-secondary/70 p-1">
                      {[0, 24, 12, 6, 3].map((value) => {
                        return (
                          <button
                            key={value}
                            onClick={() => setAnalysisTimePeriod(value)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                              analysisTimePeriod === value
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {timeRangeLabels[value]}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className={paceMetricTileClass}>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{paceLabel}</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums text-orange-500">{formatPaceValue(runningPaceSummary.averagePace)}</div>
                    </div>
                    <div className={paceMetricTileClass}>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{distanceLabel}</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums">
                        {runningPaceSummary.averageDistance ? `${runningPaceSummary.averageDistance.toFixed(1)} ${t('records.units.km')}` : '—'}
                      </div>
                    </div>
                    <div className={paceMetricTileClass}>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{avgHrLabel}</div>
                      <div className="mt-1 text-xl font-semibold tabular-nums">
                        {runningPerformanceSummary.avgHr ? t('activity.units.bpm', { value: runningPerformanceSummary.avgHr }) : '—'}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={runningPaceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke={chartColors.text}
                        fontSize={10}
                        tickFormatter={(value) => formatMonthYear(value)}
                        minTickGap={28}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="pace"
                        stroke={chartColors.text}
                        fontSize={10}
                        reversed
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => formatPaceValue(value)}
                        label={{ value: t('training.pace.axis'), angle: -90, position: 'insideLeft', style: { fill: chartColors.text } }}
                        tickLine={false}
                        axisLine={false}
                        width={34}
                      />
                      <YAxis yAxisId="distance" hide domain={[0, 'dataMax + 2']} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const data = payload[0].payload
                          return (
                            <div style={{
                              backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                              border: `1px solid ${chartColors.grid}`,
                              borderRadius: '8px',
                              padding: '10px',
                            }}>
                              <p className="font-semibold">{data.name}</p>
                              <p className="text-sm text-muted-foreground">{formatLongDate(data.date)}</p>
                              <div className="mt-2 space-y-1 text-sm">
                                <p>{paceLabel}: <span className="font-medium">{data.avg_pace} {t('training.units.pace')}</span></p>
                                <p>{rollingPaceLabel}: <span className="font-medium">{formatPaceValue(data.rolling_pace_decimal)} {t('training.units.pace')}</span></p>
                                <p>{distanceLabel}: <span className="font-medium">{data.distance_km.toFixed(2)} {t('records.units.km')}</span></p>
                                {data.avg_hr && <p>{avgHrLabel}: <span className="font-medium">{t('activity.units.bpm', { value: data.avg_hr })}</span></p>}
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Bar
                        yAxisId="distance"
                        dataKey="distance_km"
                        fill={trainingPalette.mutedFill}
                        opacity={0.18}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={18}
                        name={distanceLabel}
                      />
                      <Area
                        yAxisId="pace"
                        type="monotone"
                        dataKey="avg_pace_decimal"
                        stroke={trainingPalette.primary}
                        fill={trainingPalette.primaryFill}
                        fillOpacity={0.22}
                        strokeWidth={2}
                        isAnimationActive={false}
                        name={paceLabel}
                      />
                      <Line
                        yAxisId="pace"
                        type="monotone"
                        dataKey="rolling_pace_decimal"
                        stroke={trainingPalette.secondary}
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                        name={rollingPaceLabel}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <div className={sidebarLegendClass}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.primary }} />
                      {paceLabel}
                    </div>
                    <div className={sidebarLegendClass}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.secondary }} />
                      {rollingPaceLabel}
                    </div>
                    <div className={sidebarLegendClass}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trainingPalette.muted }} />
                      {distanceLabel}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {isRunning && recentRunningActivities.length > 0 && (
              <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.05] via-transparent to-transparent shadow-lg shadow-orange-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
                      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                    {t('training.recentRuns.title')}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    {t('training.recentRuns.subtitle', { count: recentRunningActivities.length })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {recentRunningActivities.map((activity) => {
                      const terrainBadge = getRunTerrainBadge(activity.distance_km, activity.total_elevation_gain)
                      const efficiencyValue = activity.avg_hr
                        ? formatRunningEfficiencyValue(activity.avg_pace_decimal, activity.avg_hr)
                        : null

                      return (
                        <div
                          key={activity.activity_id}
                          className="rounded-xl border border-border/60 bg-background/60 p-4 shadow-sm transition-colors hover:border-orange-500/30 hover:bg-background/80"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {formatLongDate(activity.date)}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${terrainBadge.className}`}>
                                  {terrainBadge.label}
                                </span>
                              </div>
                              <Link to={`/activity/${activity.activity_id}`} className="block text-base font-semibold leading-tight hover:text-primary hover:underline">
                                {activity.name}
                              </Link>
                            </div>
                            <div className="grid min-w-[17rem] grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t('training.recentRuns.table.distance')}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums">{activity.distance_km.toFixed(1)} <span className="text-sm font-medium text-muted-foreground">{t('records.units.km')}</span></div>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t('training.recentRuns.table.elevation')}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums">{activity.total_elevation_gain} <span className="text-sm font-medium text-muted-foreground">{t('records.units.m')}</span></div>
                              </div>
                              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t('training.recentRuns.table.pace')}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums text-orange-500">{activity.avg_pace}</div>
                              </div>
                              <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t('training.recentRuns.table.duration')}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums">{formatDurationShort(activity.moving_time)}</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 text-muted-foreground">
                              {t('training.recentRuns.table.avgHr')}: <span className="ml-1 font-semibold text-foreground">{activity.avg_hr ? t('activity.units.bpm', { value: activity.avg_hr }) : t('common.notAvailable')}</span>
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${
                              efficiencyValue && Number(efficiencyValue) >= 0.52
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : efficiencyValue && Number(efficiencyValue) >= 0.42
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  : 'border-border/50 bg-muted/20 text-muted-foreground'
                            }`}>
                              {t('training.recentRuns.table.efficiency')}: <span className="ml-1 font-semibold">{efficiencyValue ? `${efficiencyValue} ${t('training.runPerformance.units.efficiency')}` : t('common.notAvailable')}</span>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {ftpData?.ftp && recentPowerMetrics && recentPowerMetrics.activities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                    </svg>
                    {t('training.trainingLoad.title', { days: 30 })}
                  </CardTitle>
                  <CardDescription>{t('training.trainingLoad.subtitle')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 border-b pb-4 md:grid-cols-4">
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">{t('training.trainingLoad.summary.activities')}</div>
                        <div className="text-2xl font-bold">{recentPowerMetrics.activities.length}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">{t('training.trainingLoad.summary.tss')}</div>
                        <div className="text-2xl font-bold">
                          {recentPowerMetrics.activities.reduce((sum, a) => sum + (a.training_stress_score || 0), 0).toFixed(0)}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">{t('training.trainingLoad.summary.avgIf')}</div>
                        <div className="text-2xl font-bold">
                          {(recentPowerMetrics.activities
                            .filter(a => a.intensity_factor)
                            .reduce((sum, a) => sum + (a.intensity_factor || 0), 0) /
                            recentPowerMetrics.activities.filter(a => a.intensity_factor).length
                          ).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">{t('training.trainingLoad.summary.ftp')}</div>
                        <div className="text-2xl font-bold">{t('activity.units.watt', { value: ftpData.ftp })}</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="px-2 py-2 text-left">{t('training.trainingLoad.table.date')}</th>
                            <th className="px-2 py-2 text-left">{t('training.trainingLoad.table.activity')}</th>
                            <th className="px-2 py-2 text-right">{t('training.trainingLoad.table.duration')}</th>
                            <th className="px-2 py-2 text-right">{t('training.trainingLoad.table.avgPower')}</th>
                            <th className="px-2 py-2 text-right">{t('training.trainingLoad.table.np')}</th>
                            <th className="px-2 py-2 text-right">{t('training.trainingLoad.table.if')}</th>
                            <th className="px-2 py-2 text-right">{t('training.trainingLoad.table.tss')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentPowerMetrics.activities
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((activity) => {
                              const durationStr = formatDurationShort(activity.duration_seconds)

                              return (
                                <tr key={activity.activity_id} className="border-b hover:bg-muted/50">
                                  <td className="px-2 py-2 text-muted-foreground">{formatDayMonth(activity.date)}</td>
                                  <td className="px-2 py-2">
                                    <Link to={`/activity/${activity.activity_id}`} className="hover:text-primary hover:underline">
                                      {activity.name}
                                    </Link>
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums">{durationStr}</td>
                                  <td className="px-2 py-2 text-right tabular-nums">
                                    {activity.average_power ? t('activity.units.watt', { value: activity.average_power }) : t('common.notAvailable')}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums font-medium">
                                    {activity.normalized_power ? t('activity.units.watt', { value: activity.normalized_power }) : t('common.notAvailable')}
                                  </td>
                                  <td className="px-2 py-2 text-right tabular-nums">
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
                                  <td className="px-2 py-2 text-right tabular-nums font-medium">
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
          </div>

          <div className="space-y-4 xl:sticky xl:top-20 xl:w-[22rem] xl:flex-shrink-0">
            {renderHeartRateZonesCard()}
            {renderWeekdayCard()}
            {renderTimeOfDayCard()}
            {renderMonthlyCard()}
          </div>
        </div>
      )}
    </div>
  )
}
