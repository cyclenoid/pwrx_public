import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, AreaChart, Area } from 'recharts'
import { getActivity, getSegmentEfforts, type SegmentEffort } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { formatClimbCategory, formatDistance, formatElevation } from '../lib/utils'
import { useTheme } from '../components/ThemeProvider'
import { getChartColors } from '../lib/chartTheme'
import { useTranslation } from 'react-i18next'
import { ActivityMap } from '../components/ActivityMap'

const formatSegmentDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '--'
  const totalSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const formatSignedDuration = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '--'
  const sign = seconds < 0 ? '-' : '+'
  return `${sign}${formatSegmentDuration(Math.abs(seconds))}`
}

const getEffortDate = (effort: SegmentEffort): Date | null => {
  const raw = effort.start_date_local || effort.start_date || effort.activity_date
  if (!raw) return null
  try {
    const isoParsed = parseISO(raw)
    if (!Number.isNaN(isoParsed.getTime())) {
      return isoParsed
    }
    const localeMatch = String(raw).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    if (localeMatch) {
      const day = Number(localeMatch[1])
      const month = Number(localeMatch[2])
      const year = Number(localeMatch[3])
      const parsed = new Date(year, month - 1, day)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    const fallback = new Date(raw)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  } catch {
    return null
  }
}

const StatItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-sm font-semibold">{value}</div>
  </div>
)

const getCategoryBadgeClass = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'border-border/60 bg-secondary/20 text-foreground'
  }
  const numeric = Math.round(Number(value))
  if (numeric <= 0) return 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
  if (numeric === 1) return 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300'
  if (numeric === 2) return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (numeric === 3) return 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300'
  if (numeric === 4) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
}

export function SegmentDetail() {
  const { id } = useParams<{ id: string }>()
  const segmentId = Number(id)
  const { resolvedTheme } = useTheme()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rangeFilter, setRangeFilter] = useState<'all' | '6m' | '12m' | '24m' | '20' | '50'>('all')
  const [effortsSortBy, setEffortsSortBy] = useState<'date' | 'activity' | 'elapsed' | 'watts' | 'hr'>(() => {
    const value = searchParams.get('attempts_sort')
    return value === 'date' || value === 'activity' || value === 'elapsed' || value === 'watts' || value === 'hr'
      ? value
      : 'date'
  })
  const [effortsSortOrder, setEffortsSortOrder] = useState<'asc' | 'desc'>(() => {
    const value = searchParams.get('attempts_order')
    return value === 'asc' || value === 'desc' ? value : 'desc'
  })

  const { data, isLoading } = useQuery({
    queryKey: ['segment-efforts', segmentId],
    queryFn: () => getSegmentEfforts(segmentId, 500),
    enabled: Number.isFinite(segmentId),
  })
  const efforts = data?.efforts || []
  const segmentInfo = efforts[0] || null

  const effortsWithDates = useMemo(() => {
    return efforts
      .map((effort) => ({ effort, date: getEffortDate(effort) }))
      .filter((entry) => entry.date !== null) as Array<{ effort: SegmentEffort; date: Date }>
  }, [efforts])

  const effortsByDate = useMemo(() => {
    return [...effortsWithDates].sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [effortsWithDates])

  const filteredEffortsByDate = useMemo(() => {
    if (effortsByDate.length === 0) return []
    if (rangeFilter === 'all') return effortsByDate

    if (rangeFilter === '20' || rangeFilter === '50') {
      const limit = rangeFilter === '20' ? 20 : 50
      return effortsByDate.slice(-limit)
    }

    const months = rangeFilter === '6m' ? 6 : rangeFilter === '24m' ? 24 : 12
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    return effortsByDate.filter((entry) => entry.date >= cutoff)
  }, [effortsByDate, rangeFilter])

  const bestEffort = useMemo(() => {
    const pool = effortsByDate.map((entry) => entry.effort)
    return pool.reduce<SegmentEffort | null>((best, effort) => {
      if (!effort.elapsed_time) return best
      if (!best || !best.elapsed_time || effort.elapsed_time < best.elapsed_time) return effort
      return best
    }, null)
  }, [effortsByDate])

  const previewEffort = useMemo(() => {
    return efforts.reduce<SegmentEffort | null>((best, effort) => {
      const hasIndices = effort.start_index !== null
        && effort.start_index !== undefined
        && effort.end_index !== null
        && effort.end_index !== undefined
      if (!effort.activity_id || !hasIndices) return best
      if (!best) return effort
      const effortElapsed = effort.elapsed_time ?? Number.POSITIVE_INFINITY
      const bestElapsed = best.elapsed_time ?? Number.POSITIVE_INFINITY
      return effortElapsed < bestElapsed ? effort : best
    }, null)
  }, [efforts])

  const { data: previewActivity, isLoading: previewLoading } = useQuery({
    queryKey: ['segment-preview-activity', previewEffort?.activity_id],
    queryFn: () => getActivity(Number(previewEffort?.activity_id)),
    enabled: Boolean(previewEffort?.activity_id),
  })

  const previewRange = useMemo(() => {
    if (!previewEffort || !previewActivity?.streams?.distance || previewActivity.streams.distance.length === 0) {
      return null
    }
    const maxIndex = previewActivity.streams.distance.length - 1
    const rawStart = Number(previewEffort.start_index)
    const rawEnd = Number(previewEffort.end_index)
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null
    const startIndex = Math.max(0, Math.min(Math.round(rawStart), maxIndex))
    const endIndex = Math.max(0, Math.min(Math.round(rawEnd), maxIndex))
    return {
      startIndex: Math.min(startIndex, endIndex),
      endIndex: Math.max(startIndex, endIndex),
    }
  }, [previewActivity?.streams?.distance, previewEffort])

  const previewElevationData = useMemo(() => {
    if (!previewRange || !previewActivity?.streams?.distance || !previewActivity.streams.altitude) return null
    const distance = previewActivity.streams.distance
    const altitude = previewActivity.streams.altitude
    const maxIndex = Math.min(distance.length, altitude.length) - 1
    if (maxIndex < 1) return null
    const start = Math.max(0, Math.min(previewRange.startIndex, maxIndex))
    const end = Math.max(0, Math.min(previewRange.endIndex, maxIndex))
    if (end <= start) return null
    const baseDistance = Number(distance[start])
    if (!Number.isFinite(baseDistance)) return null
    const points: Array<{ distance: number; altitude: number }> = []
    for (let index = start; index <= end; index += 1) {
      const dist = Number(distance[index])
      const ele = Number(altitude[index])
      if (!Number.isFinite(dist) || !Number.isFinite(ele)) continue
      points.push({
        distance: (dist - baseDistance) / 1000,
        altitude: ele,
      })
    }
    return points.length > 1 ? points : null
  }, [previewActivity?.streams?.altitude, previewActivity?.streams?.distance, previewRange])

  const previewElevationDomain = useMemo<[number, number] | null>(() => {
    if (!previewElevationData || previewElevationData.length === 0) return null
    const values = previewElevationData
      .map((point) => Number(point.altitude))
      .filter((value) => Number.isFinite(value))
    if (values.length === 0) return null
    const startAltitude = Number(previewElevationData[0]?.altitude)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const minWithStart = Number.isFinite(startAltitude) ? Math.min(min, startAltitude) : min
    const maxWithStart = Number.isFinite(startAltitude) ? Math.max(max, startAltitude) : max
    const spread = Math.max(1, maxWithStart - minWithStart)
    const pad = Math.max(8, Math.round(spread * 0.08))
    return [minWithStart - pad, maxWithStart + pad]
  }, [previewElevationData])

  const previewHasMap = Boolean(
    previewRange
    && previewActivity?.streams?.latlng
    && previewActivity.streams.latlng.length > previewRange.endIndex
  )
  const previewHasElevation = Boolean(previewElevationData && previewElevationData.length > 1)

  const stats = useMemo(() => {
    const elapsedValues = effortsByDate
      .map((entry) => (entry.effort.elapsed_time ? Number(entry.effort.elapsed_time) : null))
      .filter((value): value is number => value !== null)

    const avgElapsed = elapsedValues.length > 0
      ? Math.round(elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length)
      : null

    const lastEffort = effortsByDate.length > 0
      ? effortsByDate.reduce((latest, entry) => (entry.date > latest.date ? entry : latest))
      : null

    return {
      avgElapsed,
      lastEffort,
      attempts: effortsByDate.length,
    }
  }, [effortsByDate])

  const chartColors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')
  const buildTimelineData = (entries: Array<{ effort: SegmentEffort; date: Date }>) => entries
    .filter(({ effort }) => effort.elapsed_time !== null && effort.elapsed_time !== undefined)
    .map(({ effort, date }, index) => ({
      index,
      label: format(date, 'MMM yy'),
      dateLabel: format(date, 'dd.MM.yyyy'),
      elapsed: Number(effort.elapsed_time),
      movingAvg: null as number | null,
      effortId: effort.effort_id ?? null,
      isBest: false,
    }))

  const chartDataFiltered = buildTimelineData(filteredEffortsByDate).filter((point) => Number.isFinite(point.elapsed))
  const chartDataAll = buildTimelineData(effortsByDate).filter((point) => Number.isFinite(point.elapsed))
  const hasTimelineFallback = chartDataFiltered.length < 2 && chartDataAll.length >= 2
  const chartData = hasTimelineFallback ? chartDataAll : chartDataFiltered
  const chartBestElapsed = chartData.length > 0
    ? Math.min(...chartData.map((point) => point.elapsed))
    : null

  chartData.forEach((point) => {
    point.isBest = chartBestElapsed !== null && point.elapsed === chartBestElapsed
  })

  const movingWindow = 5
  chartData.forEach((point, idx) => {
    const slice = chartData.slice(Math.max(0, idx - movingWindow + 1), idx + 1)
    const values = slice.map((item) => item.elapsed)
    point.movingAvg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  })

  const elapsedStats = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 0 }
    const values = chartData.map((point) => point.elapsed)
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    }
  }, [chartData])

  const elapsedRange = Math.max(1, elapsedStats.max - elapsedStats.min)
  const lowerPadding = Math.max(30, Math.round(elapsedRange * 0.25))
  const upperPadding = Math.max(10, Math.round(elapsedRange * 0.08))
  const yDomain: [number, number] = [
    Math.max(0, elapsedStats.min - lowerPadding),
    elapsedStats.max + upperPadding,
  ]

  const filterOptions: Array<{ id: typeof rangeFilter; label: string }> = [
    { id: '6m', label: t('segment.filters.6m') },
    { id: '12m', label: t('segment.filters.12m') },
    { id: '24m', label: t('segment.filters.24m') },
    { id: '20', label: t('segment.filters.20') },
    { id: '50', label: t('segment.filters.50') },
    { id: 'all', label: t('segment.filters.all') },
  ]
  const updateAttemptsSortParams = (nextBy: typeof effortsSortBy, nextOrder: typeof effortsSortOrder) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('attempts_sort', nextBy)
    nextParams.set('attempts_order', nextOrder)
    setSearchParams(nextParams, { replace: true })
  }
  const handleEffortsSort = (key: typeof effortsSortBy) => {
    if (key === effortsSortBy) {
      const nextOrder = effortsSortOrder === 'asc' ? 'desc' : 'asc'
      setEffortsSortOrder(nextOrder)
      updateAttemptsSortParams(key, nextOrder)
      return
    }
    const defaultOrder: Record<typeof effortsSortBy, 'asc' | 'desc'> = {
      date: 'desc',
      activity: 'asc',
      elapsed: 'asc',
      watts: 'desc',
      hr: 'desc',
    }
    const nextOrder = defaultOrder[key]
    setEffortsSortBy(key)
    setEffortsSortOrder(nextOrder)
    updateAttemptsSortParams(key, nextOrder)
  }

  const sortedEfforts = useMemo(() => {
    const direction = effortsSortOrder === 'asc' ? 1 : -1
    const normalizeString = (value?: string | null) => {
      const normalized = value?.toLowerCase().trim()
      return normalized && normalized.length > 0 ? normalized : null
    }
    const compareNullableNumbers = (a: number | null | undefined, b: number | null | undefined) => {
      const aValid = a !== null && a !== undefined && Number.isFinite(Number(a))
      const bValid = b !== null && b !== undefined && Number.isFinite(Number(b))
      if (!aValid && !bValid) return 0
      if (!aValid) return 1
      if (!bValid) return -1
      return (Number(a) - Number(b)) * direction
    }
    const compareNullableStrings = (a: string | null | undefined, b: string | null | undefined) => {
      const aNorm = normalizeString(a)
      const bNorm = normalizeString(b)
      if (!aNorm && !bNorm) return 0
      if (!aNorm) return 1
      if (!bNorm) return -1
      return aNorm.localeCompare(bNorm) * direction
    }
    const compareDates = (a: Date, b: Date) => (a.getTime() - b.getTime()) * direction

    return [...effortsByDate].sort((a, b) => {
      switch (effortsSortBy) {
        case 'activity':
          return compareNullableStrings(a.effort.activity_name ?? null, b.effort.activity_name ?? null)
        case 'elapsed':
          return compareNullableNumbers(a.effort.elapsed_time, b.effort.elapsed_time)
        case 'watts':
          return compareNullableNumbers(a.effort.average_watts, b.effort.average_watts)
        case 'hr':
          return compareNullableNumbers(a.effort.average_heartrate, b.effort.average_heartrate)
        case 'date':
        default:
          return compareDates(a.date, b.date)
      }
    })
  }, [effortsByDate, effortsSortBy, effortsSortOrder])

  const trendStats = useMemo(() => {
    const values = filteredEffortsByDate
      .map((entry) => entry.effort.elapsed_time)
      .filter((value): value is number => value !== null && value !== undefined)

    if (values.length < 4) {
      return {
        lastAvg: null,
        prevAvg: null,
        delta: null,
        deltaPercent: null,
        slope: null,
      }
    }

    const last = values.slice(-5)
    const prev = values.slice(-10, -5)
    const lastAvg = Math.round(last.reduce((sum, value) => sum + value, 0) / last.length)
    const prevAvg = prev.length > 0
      ? Math.round(prev.reduce((sum, value) => sum + value, 0) / prev.length)
      : null

    const delta = prevAvg !== null ? lastAvg - prevAvg : null
    const deltaPercent = prevAvg ? Math.round((delta! / prevAvg) * 1000) / 10 : null

    const slope = values.length >= 3
      ? (() => {
          const n = values.length
          const xValues = values.map((_, index) => index + 1)
          const sumX = xValues.reduce((sum, value) => sum + value, 0)
          const sumY = values.reduce((sum, value) => sum + value, 0)
          const sumXY = values.reduce((sum, value, index) => sum + value * xValues[index], 0)
          const sumX2 = xValues.reduce((sum, value) => sum + value * value, 0)
          const denominator = n * sumX2 - sumX * sumX
          if (denominator === 0) return null
          const slopeValue = (n * sumXY - sumX * sumY) / denominator
          return Math.round(slopeValue * 10) / 10
        })()
      : null

    return {
      lastAvg,
      prevAvg,
      delta,
      deltaPercent,
      slope,
    }
  }, [filteredEffortsByDate])

  const renderEffortDot = (props: any) => {
    const { cx, cy, payload } = props
    if (cx === undefined || cy === undefined || !payload) return null
    if (payload.isBest) {
      return (
        <g>
          <circle cx={cx} cy={cy} r={6} fill={chartColors.accent1} stroke={chartColors.primaryDark} strokeWidth={2} />
          <text x={cx} y={cy - 10} textAnchor="middle" fontSize="10" fill={chartColors.accent1}>
            PR
          </text>
        </g>
      )
    }
    return <circle cx={cx} cy={cy} r={3} fill={chartColors.primary} />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-muted-foreground">{t('segment.detail.loading')}</p>
      </div>
    )
  }

  if (!segmentInfo) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-muted-foreground">{t('segment.detail.notFound')}</p>
      </div>
    )
  }

  const location = [segmentInfo.city, segmentInfo.state, segmentInfo.country].filter(Boolean).join(', ')
  const segmentDistance = segmentInfo.segment_distance ?? segmentInfo.effort_distance ?? null
  const categoryLabel = formatClimbCategory(segmentInfo.climb_category)
  const categoryDisplay = categoryLabel || t('segment.detail.categoryNone')
  const avgGrade = segmentInfo.average_grade !== null && segmentInfo.average_grade !== undefined
    ? `${Number(segmentInfo.average_grade).toFixed(1)}%`
    : '--'
  const maxGrade = segmentInfo.maximum_grade !== null && segmentInfo.maximum_grade !== undefined
    ? `${Number(segmentInfo.maximum_grade).toFixed(1)}%`
    : '--'
  const elevationGainMeters = segmentInfo.elevation_high !== null && segmentInfo.elevation_high !== undefined
    && segmentInfo.elevation_low !== null && segmentInfo.elevation_low !== undefined
    ? Math.max(0, Math.round(Number(segmentInfo.elevation_high) - Number(segmentInfo.elevation_low)))
    : null
  const elevationDiff = elevationGainMeters !== null ? `${elevationGainMeters} m` : '--'
  const bestVam = bestEffort?.elapsed_time && elevationGainMeters !== null && elevationGainMeters > 0
    ? Math.round(elevationGainMeters / (bestEffort.elapsed_time / 3600))
    : null
  const bestCardClass = bestEffort?.elapsed_time ? 'border-emerald-500/30 bg-emerald-500/10' : ''
  const showCategory = true

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/activities">
            <Button variant="ghost" size="sm" className="mb-1 -ml-2 h-7 text-xs">
              {t('segment.detail.backToActivities')}
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {segmentInfo.segment_name || segmentInfo.effort_name || 'Segment'}
          </h1>
          <div className="text-sm text-muted-foreground">
            {location || t('segment.detail.unknownLocation')} · {segmentInfo.activity_type || t('segment.detail.activity')}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {t('segment.detail.segmentNumber', { id: segmentInfo.segment_id })}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="m7 14 4-4 4 4 5-5" />
            </svg>
            {t('segment.detail.facts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatItem label={t('segment.detail.stats.distance')} value={segmentDistance ? formatDistance(Number(segmentDistance)) : '--'} />
            <StatItem label={t('segment.detail.stats.avgGrade')} value={avgGrade} />
            <StatItem label={t('segment.detail.stats.maxGrade')} value={maxGrade} />
            <StatItem label={t('segment.detail.stats.elevationDiff')} value={elevationDiff} />
          </div>
          {showCategory && (
            <div className="mt-3">
              <Badge variant="outline" className={`text-[11px] font-medium ${getCategoryBadgeClass(segmentInfo.climb_category)}`}>
                {t('segment.detail.category', { value: categoryDisplay })}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="m7 14 4-4 4 4 5-5" />
            </svg>
            {t('segment.detail.previewTitle')}
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {t('segment.detail.previewSubtitle')}
          </div>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">{t('segment.detail.loading')}</div>
          ) : previewEffort && (previewHasMap || previewHasElevation) ? (
            <div className={`grid gap-3 ${previewHasMap && previewHasElevation ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {previewHasMap && previewActivity?.streams?.latlng && previewRange && (
                <div className="h-[250px] rounded-md overflow-hidden border border-border/60">
                  <ActivityMap
                    coordinates={previewActivity.streams.latlng}
                    showMarkers={false}
                    hoverPosition={null}
                    highlightRange={previewRange}
                    showHighlightMarkers={true}
                    focusHighlight={true}
                  />
                </div>
              )}
              {previewHasElevation && (
                <div className="h-[250px] rounded-md border border-border/60 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={previewElevationData ?? []}>
                      <defs>
                        <linearGradient id="segmentDetailPreviewGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#fc4c02" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#fc4c02" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="distance"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        stroke={chartColors.axis}
                        fontSize={10}
                        tickFormatter={(value) => `${Number(value).toFixed(1)}`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke={chartColors.axis}
                        fontSize={10}
                        tickFormatter={(value) => `${Math.round(Number(value))}m`}
                        width={46}
                        domain={previewElevationDomain ?? ['dataMin', 'dataMax']}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                        labelFormatter={(label: number | string) => `${Number(label).toFixed(2)} km`}
                        formatter={(value: number | string | undefined) => {
                          if (value === undefined || value === null) return ['--', t('segment.detail.stats.elevationDiff')]
                          return [`${Math.round(Number(value))} m`, t('segment.detail.stats.elevationDiff')]
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="altitude"
                        stroke="#fc4c02"
                        strokeWidth={1.5}
                        fill="url(#segmentDetailPreviewGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-8 text-center">
              {t('segment.detail.previewUnavailable')}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="m7 14 4-4 4 4 5-5" />
                </svg>
                {t('segment.detail.timelineTitle')}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {filterOptions.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      size="sm"
                      variant={rangeFilter === option.id ? 'default' : 'outline'}
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setRangeFilter(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColors.accent1 }} />
                  PR
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {t('segment.detail.fastTimesTop')}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasTimelineFallback && (
              <div className="mb-2 text-[11px] text-muted-foreground">
                {t('segment.detail.timelineFallback')}
              </div>
            )}
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis
                    dataKey="label"
                    type="category"
                    stroke={chartColors.axis}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    stroke={chartColors.axis}
                    tickFormatter={(value) => formatSegmentDuration(Number(value))}
                    tick={{ fontSize: 11 }}
                    domain={yDomain}
                    width={48}
                    reversed
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    labelFormatter={(_value, payload) => {
                      const first = payload?.[0]?.payload
                      return first?.dateLabel ?? ''
                    }}
                    formatter={(value: number | string | undefined) => {
                      if (value === undefined || value === null) {
                        return ['--', 'Zeit']
                      }
                      const numeric = typeof value === 'number' ? value : Number(value)
                      return [formatSegmentDuration(Number.isFinite(numeric) ? numeric : null), t('segment.detail.timeLabel')]
                    }}
                  />
                  {chartBestElapsed !== null && (
                    <ReferenceLine
                      y={Number(chartBestElapsed)}
                      stroke={chartColors.primaryLight}
                      strokeDasharray="3 3"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="elapsed"
                    stroke={chartColors.primary}
                    strokeWidth={2}
                    dot={renderEffortDot}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                  {chartData.length >= 3 && (
                    <Line
                      type="monotone"
                      dataKey="movingAvg"
                      stroke={chartColors.secondary}
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="6 4"
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-muted-foreground py-8 text-center">
                {t('segment.detail.timelineEmpty')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={bestCardClass}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
              </svg>
              {t('segment.detail.bestTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">{t('segment.detail.bestTime')}</div>
                <div className="text-2xl font-semibold">{formatSegmentDuration(bestEffort?.elapsed_time ?? null)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {bestEffort?.elapsed_time && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-emerald-500/40 text-emerald-500">
                    {t('segment.detail.pr')}
                  </Badge>
                )}
                <div className="text-[11px] text-muted-foreground">
                  {t('segment.detail.avgPrefix')} {formatSegmentDuration(stats.avgElapsed ?? null)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.avgWatts')}</div>
                <div className="font-semibold">
                  {bestEffort?.average_watts ? `${Math.round(Number(bestEffort.average_watts))} W` : '--'}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.avgHr')}</div>
                <div className="font-semibold">
                  {bestEffort?.average_heartrate ? `${Math.round(Number(bestEffort.average_heartrate))} bpm` : '--'}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.vam')}</div>
                <div className="font-semibold">
                  {bestVam ? `${bestVam} m/h` : '--'}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.elevationGain')}</div>
                <div className="font-semibold">
                  {elevationGainMeters !== null ? formatElevation(elevationGainMeters) : '--'}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.distance')}</div>
                <div className="font-semibold">
                  {segmentDistance ? formatDistance(Number(segmentDistance)) : '--'}
                </div>
              </div>
              <div className="rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.avgGrade')}</div>
                <div className="font-semibold">{avgGrade}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.attempts')}</div>
                <div className="font-semibold">{stats.attempts}</div>
              </div>
              <div className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('segment.detail.lastAttempt')}</div>
                <div className="font-semibold">
                  {stats.lastEffort ? format(stats.lastEffort.date, 'dd.MM.yyyy') : '--'}
                </div>
              </div>
            </div>

            {bestEffort?.activity_id && (
              <Link to={`/activity/${bestEffort.activity_id}`} className="text-xs text-primary hover:underline">
                {t('segment.detail.toPrActivity')}
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m8 6 4-4 4 4" />
                <path d="M12 2v20" />
              </svg>
            {t('segment.detail.trendTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('segment.detail.trend.last5')}</span>
              <span className="font-semibold">{trendStats.lastAvg ? formatSegmentDuration(trendStats.lastAvg) : '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('segment.detail.trend.prev5')}</span>
              <span className="font-semibold">{trendStats.prevAvg ? formatSegmentDuration(trendStats.prevAvg) : '--'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('segment.detail.trend.delta')}</span>
              <span className={`font-semibold ${trendStats.delta !== null && trendStats.delta < 0 ? 'text-emerald-500' : trendStats.delta !== null ? 'text-amber-500' : ''}`}>
                {trendStats.delta !== null
                  ? formatSignedDuration(trendStats.delta)
                  : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('segment.detail.trend.slope')}</span>
              <span className={`font-semibold ${trendStats.slope !== null && trendStats.slope < 0 ? 'text-emerald-500' : trendStats.slope !== null ? 'text-amber-500' : ''}`}>
                {trendStats.slope !== null ? `${trendStats.slope > 0 ? '+' : ''}${trendStats.slope}` : '--'}
              </span>
            </div>
            {trendStats.deltaPercent !== null && (
              <div className="text-xs text-muted-foreground">
                {trendStats.deltaPercent > 0
                  ? t('segment.detail.trend.slower', { value: Math.abs(trendStats.deltaPercent) })
                  : t('segment.detail.trend.faster', { value: Math.abs(trendStats.deltaPercent) })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19h16" />
              <path d="M4 15h16" />
              <path d="M4 11h16" />
              <path d="M4 7h16" />
            </svg>
            {t('segment.detail.attemptsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          {effortsByDate.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              {t('segment.detail.noAttempts')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground mb-2">
                <span>{t('segment.detail.attemptsCount', { count: effortsByDate.length })}</span>
                <span>{t('segment.detail.sortAllAttempts')}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleEffortsSort('date')}
                        className={`inline-flex items-center gap-1 ${effortsSortBy === 'date' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.detail.table.date')}
                        {effortsSortBy === 'date' ? (effortsSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleEffortsSort('activity')}
                        className={`inline-flex items-center gap-1 ${effortsSortBy === 'activity' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.detail.table.activity')}
                        {effortsSortBy === 'activity' ? (effortsSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleEffortsSort('elapsed')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${effortsSortBy === 'elapsed' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.detail.table.time')}
                        {effortsSortBy === 'elapsed' ? (effortsSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleEffortsSort('watts')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${effortsSortBy === 'watts' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.detail.table.avgWatts')}
                        {effortsSortBy === 'watts' ? (effortsSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleEffortsSort('hr')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${effortsSortBy === 'hr' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.detail.table.avgHr')}
                        {effortsSortBy === 'hr' ? (effortsSortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEfforts.map(({ effort, date }) => {
                    const isBest = bestEffort?.effort_id === effort.effort_id
                    return (
                      <tr key={effort.effort_id} className="border-b border-border/50">
                        <td className="py-2 px-2 whitespace-nowrap">
                          {format(date, 'dd.MM.yyyy')}
                        </td>
                        <td className="py-2 px-2">
                          <Link to={`/activity/${effort.activity_id}`} className="text-primary hover:underline">
                          {effort.activity_name || t('segment.detail.activityFallback', { id: effort.activity_id })}
                          </Link>
                          {isBest && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0.5 border-yellow-500/40 text-yellow-500">
                              {t('segment.detail.pr')}
                            </Badge>
                          )}
                        </td>
                        <td className="text-right py-2 px-2 font-semibold">
                          {formatSegmentDuration(effort.elapsed_time ?? null)}
                        </td>
                        <td className="text-right py-2 px-2 text-muted-foreground">
                          {effort.average_watts ? `${Math.round(Number(effort.average_watts))} W` : '—'}
                        </td>
                        <td className="text-right py-2 px-2 text-muted-foreground">
                          {effort.average_heartrate ? `${Math.round(Number(effort.average_heartrate))} bpm` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
