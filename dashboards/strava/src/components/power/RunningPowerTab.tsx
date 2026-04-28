import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { getRunningBestEfforts, getYearlyStats, type RunningBestEffort } from '../../lib/api'
import { formatDurationLong } from '../../lib/formatters'
import { getChartColors } from '../../lib/chartTheme'
import { useTheme } from '../ThemeProvider'
import { useTranslation } from 'react-i18next'

const MAX_YEARS_COMPARE = 5

const yearColors: Record<number, string> = {
  2026: '#ef4444',
  2025: '#fc4c02',
  2024: '#3b82f6',
  2023: '#22c55e',
  2022: '#a855f7',
  2021: '#f59e0b',
  2020: '#ec4899',
  2019: '#14b8a6',
  2018: '#8b5cf6',
  2017: '#f97316',
  2016: '#06b6d4',
}

const defaultColors = ['#fc4c02', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b']

function getQualityBadgeClass(quality?: RunningBestEffort['quality']) {
  if (quality === 'high') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  }
  if (quality === 'medium') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
  return 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
}

export function RunningPowerTab() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const ANALYTICS_STALE_MS = 60 * 60 * 1000
  const allTimeKey = t('powerProfile.running.allTime.key')

  const { data: runningYearlyStats, isLoading: loadingYears } = useQuery({
    queryKey: ['yearlyStats', 'Run'],
    queryFn: () => getYearlyStats('Run'),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  })

  const { data: allTimeEfforts, isLoading: loadingAllTime } = useQuery({
    queryKey: ['running-best-efforts', 'all-time'],
    queryFn: () => getRunningBestEfforts(),
    staleTime: ANALYTICS_STALE_MS,
    refetchOnWindowFocus: false,
  })

  const availableYears = useMemo(
    () => (runningYearlyStats ?? []).filter((entry) => Number(entry.activity_count) > 0),
    [runningYearlyStats],
  )

  useEffect(() => {
    if (availableYears.length > 0 && selectedYears.length === 0) {
      setSelectedYears(availableYears.slice(0, 3).map((entry) => entry.year))
    }
  }, [availableYears, selectedYears.length])

  const yearlyEffortQueries = useQueries({
    queries: selectedYears.map((year) => ({
      queryKey: ['running-best-efforts', year],
      queryFn: () => getRunningBestEfforts({ year }),
      staleTime: ANALYTICS_STALE_MS,
      refetchOnWindowFocus: false,
    })),
  })

  const yearlyEffortMap = useMemo(() => {
    const result = new Map<number, { efforts: RunningBestEffort[]; activities_analyzed: number }>()
    selectedYears.forEach((year, index) => {
      const data = yearlyEffortQueries[index]?.data
      if (data) {
        result.set(year, data)
      }
    })
    return result
  }, [selectedYears, yearlyEffortQueries])

  const isLoading = loadingYears || loadingAllTime || yearlyEffortQueries.some((query) => query.isLoading)

  const getYearColor = (year: number, index: number) => yearColors[year] || defaultColors[index % defaultColors.length]

  const formatActivityDate = useCallback((dateString?: string | null) => {
    if (!dateString) return null
    try {
      return new Intl.DateTimeFormat(dateLocale, { month: 'short', year: 'numeric' }).format(new Date(dateString))
    } catch {
      return null
    }
  }, [dateLocale])

  const formatPaceValue = useCallback((paceMinPerKm?: number | null) => {
    if (paceMinPerKm === null || paceMinPerKm === undefined || !Number.isFinite(paceMinPerKm)) {
      return t('common.notAvailable')
    }
    const totalSeconds = Math.round(paceMinPerKm * 60)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [t])

  const getPaceMinPerKm = (effort?: RunningBestEffort | null) => {
    if (!effort) return null
    if (effort.pace_min_per_km !== null && effort.pace_min_per_km !== undefined) {
      return effort.pace_min_per_km
    }
    return (effort.time_seconds / 60) / (effort.distance_meters / 1000)
  }

  const getTimeLabel = useCallback((effort?: RunningBestEffort | null) => {
    if (!effort) return t('common.notAvailable')
    return effort.time_label || formatDurationLong(effort.time_seconds)
  }, [t])

  const allTimeByDistance = useMemo(() => {
    const entries = new Map<number, RunningBestEffort>()
    ;(allTimeEfforts?.efforts ?? []).forEach((effort) => {
      entries.set(effort.distance_meters, effort)
    })
    return entries
  }, [allTimeEfforts])

  const chartDistances = useMemo(() => {
    const entries = new Map<number, string>()
    ;(allTimeEfforts?.efforts ?? []).forEach((effort) => {
      entries.set(effort.distance_meters, effort.label)
    })
    yearlyEffortMap.forEach((value) => {
      value.efforts.forEach((effort) => {
        if (!entries.has(effort.distance_meters)) {
          entries.set(effort.distance_meters, effort.label)
        }
      })
    })

    return Array.from(entries.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([distanceMeters, label]) => ({ distanceMeters, label }))
  }, [allTimeEfforts, yearlyEffortMap])

  const chartData = useMemo(() => {
    return chartDistances.map(({ distanceMeters, label }) => {
      const entry: Record<string, string | number | null> = {
        distance: label,
        distanceMeters,
      }

      const allTimeEffort = allTimeByDistance.get(distanceMeters)
      entry[allTimeKey] = getPaceMinPerKm(allTimeEffort)
      entry[`${allTimeKey}__time`] = allTimeEffort ? getTimeLabel(allTimeEffort) : null
      entry[`${allTimeKey}__pace`] = allTimeEffort ? formatPaceValue(getPaceMinPerKm(allTimeEffort)) : null
      entry[`${allTimeKey}__hr`] = allTimeEffort?.avg_hr ?? null
      entry[`${allTimeKey}__activity`] = allTimeEffort?.activity_name ?? null
      entry[`${allTimeKey}__date`] = formatActivityDate(allTimeEffort?.activity_date)
      entry[`${allTimeKey}__quality`] = allTimeEffort?.quality ?? null
      entry[`${allTimeKey}__confidence`] = allTimeEffort?.confidence_score ?? null

      selectedYears.forEach((year) => {
        const effort = yearlyEffortMap
          .get(year)
          ?.efforts.find((item) => item.distance_meters === distanceMeters)
        entry[year.toString()] = getPaceMinPerKm(effort)
        entry[`${year}__time`] = effort ? getTimeLabel(effort) : null
        entry[`${year}__pace`] = effort ? formatPaceValue(getPaceMinPerKm(effort)) : null
        entry[`${year}__hr`] = effort?.avg_hr ?? null
        entry[`${year}__activity`] = effort?.activity_name ?? null
        entry[`${year}__date`] = formatActivityDate(effort?.activity_date)
        entry[`${year}__quality`] = effort?.quality ?? null
        entry[`${year}__confidence`] = effort?.confidence_score ?? null
      })

      return entry
    })
  }, [
    allTimeByDistance,
    allTimeKey,
    chartDistances,
    formatActivityDate,
    formatPaceValue,
    getTimeLabel,
    selectedYears,
    yearlyEffortMap,
  ])

  const paceDomain = useMemo(() => {
    const paces: number[] = []

    ;(allTimeEfforts?.efforts ?? []).forEach((effort) => {
      const pace = getPaceMinPerKm(effort)
      if (pace) paces.push(pace)
    })

    yearlyEffortMap.forEach((value) => {
      value.efforts.forEach((effort) => {
        const pace = getPaceMinPerKm(effort)
        if (pace) paces.push(pace)
      })
    })

    if (paces.length === 0) return [3, 8]

    const minPace = Math.min(...paces)
    const maxPace = Math.max(...paces)
    return [
      Math.max(0, Number((minPace - 0.15).toFixed(2))),
      Number((maxPace + 0.2).toFixed(2)),
    ]
  }, [allTimeEfforts, yearlyEffortMap])

  const summaryDistances = [100, 500, 1000, 5000]
  const summaryEfforts = summaryDistances.map((distance) => allTimeByDistance.get(distance) ?? null)
  const chartColors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')

  const toggleYear = (year: number) => {
    setSelectedYears((current) => {
      if (current.includes(year)) {
        return current.filter((value) => value !== year)
      }
      if (current.length >= MAX_YEARS_COMPARE) return current
      return [...current, year].sort((a, b) => b - a)
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">{t('powerProfile.loading')}</p>
      </div>
    )
  }

  if (!allTimeEfforts || allTimeEfforts.efforts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-orange-500/20 bg-orange-500/10" />
          <h3 className="text-lg font-medium mb-2">{t('powerProfile.running.empty.title')}</h3>
          <p className="text-muted-foreground">{t('powerProfile.running.empty.subtitle')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.07] via-transparent to-transparent">
        <CardHeader className="pb-3">
          <CardTitle>{t('powerProfile.running.summaryTitle')}</CardTitle>
          <CardDescription>
            {t('powerProfile.running.summarySubtitle', { count: allTimeEfforts.activities_analyzed })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-border/60 bg-background/60 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {t('powerProfile.running.cards.activities')}
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-orange-500">
              {allTimeEfforts.activities_analyzed}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{t('powerProfile.running.cards.activitiesHint')}</div>
          </div>
          {summaryEfforts.map((effort, index) => (
            <div key={summaryDistances[index]} className="rounded-xl border border-border/60 bg-background/60 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {t(`powerProfile.running.cards.best${summaryDistances[index]}`)}
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums text-orange-500">
                {getTimeLabel(effort)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {effort ? `${formatPaceValue(getPaceMinPerKm(effort))} ${t('training.units.pace')}` : t('common.notAvailable')}
              </div>
              {effort?.quality && (
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getQualityBadgeClass(effort.quality)}`}
                    title={t('records.bestEfforts.quality.confidence', { score: effort.confidence_score ?? 0 })}
                  >
                    {t(`records.bestEfforts.quality.${effort.quality}`)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/[0.05] via-transparent to-transparent">
        <CardHeader>
          <CardTitle>{t('powerProfile.running.allTime.title')}</CardTitle>
          <CardDescription>
            {t('powerProfile.running.allTime.subtitle', { count: allTimeEfforts.activities_analyzed })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {allTimeEfforts.efforts.map((effort) => (
              <Link
                key={effort.distance_meters}
                to={effort.activity_id ? `/activity/${effort.activity_id}` : '#'}
                className={`block ${effort.activity_id ? 'cursor-pointer hover:scale-[1.02] transition-transform' : ''}`}
              >
                <div className="rounded-lg border border-yellow-500/30 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-3 text-center">
                  <p className="text-[11px] font-medium text-muted-foreground">{effort.label}</p>
                  <p className="mt-1 text-xl font-bold leading-tight text-yellow-500">{getTimeLabel(effort)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatPaceValue(getPaceMinPerKm(effort))} {t('training.units.pace')}
                  </p>
                  {effort.activity_date && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{formatActivityDate(effort.activity_date)}</p>
                  )}
                  {effort.quality && (
                    <p className="mt-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getQualityBadgeClass(effort.quality)}`}
                        title={t('records.bestEfforts.quality.confidence', { score: effort.confidence_score ?? 0 })}
                      >
                        {t(`records.bestEfforts.quality.${effort.quality}`)}
                      </span>
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('powerProfile.running.allTime.note')}
            {allTimeEfforts.quality?.filtered_segments
              ? ` ${t('records.bestEfforts.quality.filtered', { count: allTimeEfforts.quality.filtered_segments })}`
              : ''}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('powerProfile.running.yearlyComparison.title')}</CardTitle>
          <CardDescription>
            {t('powerProfile.running.yearlyComparison.subtitle', { count: MAX_YEARS_COMPARE })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            {availableYears.map((year, index) => {
              const isSelected = selectedYears.includes(year.year)
              const isDisabled = !isSelected && selectedYears.length >= MAX_YEARS_COMPARE
              const color = getYearColor(year.year, index)

              return (
                <button
                  key={year.year}
                  onClick={() => toggleYear(year.year)}
                  disabled={isDisabled}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all
                    ${isSelected ? 'border-2' : 'border-muted hover:border-muted-foreground/50'}
                    ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  style={{
                    borderColor: isSelected ? color : undefined,
                    backgroundColor: isSelected ? `${color}20` : undefined,
                  }}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className={isSelected ? 'font-medium' : ''}>{year.year}</span>
                  <span className="text-xs text-muted-foreground">({year.activity_count})</span>
                </button>
              )
            })}
          </div>

          {selectedYears.length > 0 || allTimeEfforts.efforts.length > 0 ? (
            <ResponsiveContainer width="100%" height={520}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis
                  dataKey="distance"
                  stroke={chartColors.text}
                  fontSize={11}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  stroke={chartColors.text}
                  fontSize={12}
                  width={70}
                  domain={paceDomain as [number, number]}
                  reversed
                  tickFormatter={(value) => formatPaceValue(Number(value))}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const point = payload[0].payload as Record<string, string | number | null>
                    return (
                      <div
                        style={{
                          backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                          border: `1px solid ${chartColors.grid}`,
                          borderRadius: '8px',
                          padding: '10px',
                        }}
                      >
                        <p className="font-semibold">{t('powerProfile.running.chart.distanceLabel', { value: label })}</p>
                        {payload.map((item) => {
                          const dataKey = String(item.dataKey)
                          const pace = point[`${dataKey}__pace`]
                          const time = point[`${dataKey}__time`]
                          const activity = point[`${dataKey}__activity`]
                          const date = point[`${dataKey}__date`]
                          const hr = point[`${dataKey}__hr`]
                          const quality = point[`${dataKey}__quality`]
                          const confidence = point[`${dataKey}__confidence`]
                          if (!pace || !time) return null
                          return (
                            <div key={dataKey} className="mt-2 text-sm">
                              <p className="font-medium" style={{ color: item.color }}>{item.name}</p>
                              <p>{t('powerProfile.running.chart.tooltipTime')}: <span className="font-medium">{time}</span></p>
                              <p>{t('powerProfile.running.chart.tooltipPace')}: <span className="font-medium">{pace} {t('training.units.pace')}</span></p>
                              {typeof hr === 'number' && (
                                <p>{t('powerProfile.running.chart.tooltipHr')}: <span className="font-medium">{hr} bpm</span></p>
                              )}
                              {typeof quality === 'string' && (
                                <p>{t('records.bestEfforts.quality.label')}: <span className="font-medium">{t(`records.bestEfforts.quality.${quality}`)}</span>{typeof confidence === 'number' ? ` (${t('records.bestEfforts.quality.confidence', { score: confidence })})` : ''}</p>
                              )}
                              {activity && <p className="text-muted-foreground">{activity}{date ? ` • ${date}` : ''}</p>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  }}
                />
                <Legend verticalAlign="top" height={36} />

                <Line
                  type="monotone"
                  dataKey={allTimeKey}
                  name={allTimeKey}
                  stroke="#fbbf24"
                  strokeWidth={3}
                  strokeDasharray="8 4"
                  dot={{ r: 4, fill: '#fbbf24', stroke: '#fbbf24' }}
                  connectNulls
                />

                {selectedYears.map((year, index) => (
                  <Line
                    key={year}
                    type="monotone"
                    dataKey={year.toString()}
                    name={year.toString()}
                    stroke={getYearColor(year, index)}
                    strokeWidth={index === 0 ? 2.5 : 2}
                    dot={{ r: index === 0 ? 4 : 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              {t('powerProfile.running.yearlyComparison.selectPrompt')}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4 text-center">
            {t('powerProfile.running.yearlyComparison.note')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
