import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRightLeft, Clock3, Gauge, HeartPulse, Mountain, Route, TimerReset, Zap } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import {
  getActivityCompareData,
  getActivityCompareContext,
  getActivityKmSplits,
  type ActivityCompareAlignedPoint,
  type ActivityCompareContextCandidate,
} from '../lib/api'
import { cn, formatDistance, formatDuration, formatElevation } from '../lib/utils'

const safeNumber = (val: string | number | null | undefined): number => {
  if (val === null || val === undefined) return 0
  return typeof val === 'number' ? val : parseFloat(val) || 0
}

const isRunType = (type: string | undefined) => (
  type === 'Run' || type === 'TrailRun' || type === 'VirtualRun'
)

const formatPaceFromSpeed = (speedKmh: number, fallback: string): string => {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return fallback
  const totalSeconds = 3600 / speedKmh
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`
}

const formatPaceFromSeconds = (seconds: number | null | undefined, fallback: string): string => {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return fallback
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}/km`
}

const formatDelta = (seconds: number | null | undefined, fallback: string): string => {
  if (!Number.isFinite(seconds)) return fallback
  const rounded = Math.round(seconds || 0)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${formatDuration(Math.abs(rounded))}`
}

const formatSpeed = (speedKmh: number | null | undefined, fallback: string): string => {
  if (!Number.isFinite(speedKmh) || !speedKmh || speedKmh <= 0) return fallback
  return `${Number(speedKmh).toFixed(1)} km/h`
}

const formatDistanceLabel = (distanceKm: number): string => (
  distanceKm >= 10 ? distanceKm.toFixed(1) : distanceKm.toFixed(2)
)

const toNumericId = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

type RunSplitCompareRow = {
  km: number
  baseTime: number | null
  comparisonTime: number | null
  basePace: number | null
  comparisonPace: number | null
  deltaSec: number | null
  cumulativeDeltaSec: number | null
}

function SummaryMetric({
  icon,
  label,
  baseValue,
  comparisonValue,
  baseLabel,
  comparisonLabel,
  accent = 'text-primary',
}: {
  icon: ReactNode
  label: string
  baseValue: string
  comparisonValue: string
  baseLabel: string
  comparisonLabel: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={accent}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{baseLabel}</span>
          <span className="font-semibold text-foreground">{baseValue}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{comparisonLabel}</span>
          <span className="font-semibold text-foreground">{comparisonValue}</span>
        </div>
      </div>
    </div>
  )
}

export function ActivityCompare() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, i18n } = useTranslation()

  const activityId = Number(id)
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const notAvailable = t('common.notAvailable')
  const requestedComparison = Number(searchParams.get('target') || '')
  const preset = searchParams.get('preset')

  const { data: compareContext, isLoading: contextLoading } = useQuery({
    queryKey: ['activity-compare-context', activityId],
    queryFn: () => getActivityCompareContext(activityId, 12),
    enabled: Number.isInteger(activityId),
  })

  const baseActivity = compareContext?.base_activity ?? null
  const candidates = useMemo<ActivityCompareContextCandidate[]>(() => (
    [...(compareContext?.candidates || [])].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
  ), [compareContext?.candidates])

  const latestCandidate = candidates.find((candidate) => candidate.is_latest) ?? null
  const bestCandidate = candidates.find((candidate) => candidate.is_best) ?? null

  const resolvedComparisonId = useMemo<number | null>(() => {
    if (Number.isInteger(requestedComparison) && requestedComparison > 0) return requestedComparison
    if (preset === 'best') return toNumericId(compareContext?.best_activity_id)
    if (preset === 'latest') return toNumericId(compareContext?.latest_activity_id)
    return toNumericId(compareContext?.latest_activity_id) ?? toNumericId(compareContext?.best_activity_id)
  }, [compareContext?.best_activity_id, compareContext?.latest_activity_id, preset, requestedComparison])

  const comparisonActivity = useMemo(() => (
    candidates.find((candidate) => toNumericId(candidate.strava_activity_id) === resolvedComparisonId) ?? null
  ), [candidates, resolvedComparisonId])

  const { data: compareData } = useQuery({
    queryKey: ['activity-compare-data', activityId, resolvedComparisonId],
    queryFn: () => getActivityCompareData(activityId, Number(resolvedComparisonId)),
    enabled: Number.isInteger(activityId) && resolvedComparisonId !== null,
  })

  const isRunComparison = Boolean(
    baseActivity
    && comparisonActivity
    && isRunType(baseActivity.type)
    && isRunType(comparisonActivity.type)
  )

  const { data: baseSplits } = useQuery({
    queryKey: ['activity-km-splits', activityId, 'compare-base'],
    queryFn: () => getActivityKmSplits(activityId),
    enabled: isRunComparison,
  })

  const { data: comparisonSplits } = useQuery({
    queryKey: ['activity-km-splits', resolvedComparisonId, 'compare-comparison'],
    queryFn: () => getActivityKmSplits(Number(resolvedComparisonId)),
    enabled: isRunComparison && resolvedComparisonId !== null,
  })

  const runSplitRows = useMemo<RunSplitCompareRow[]>(() => {
    if (!baseSplits?.splits?.length || !comparisonSplits?.splits?.length) return []

    const maxKm = Math.max(baseSplits.splits.length, comparisonSplits.splits.length)
    let cumulativeDelta = 0

    return Array.from({ length: maxKm }, (_, index) => {
      const km = index + 1
      const baseSplit = baseSplits.splits.find((entry) => entry.km === km)
      const comparisonSplit = comparisonSplits.splits.find((entry) => entry.km === km)
      const deltaSec = baseSplit && comparisonSplit ? baseSplit.time - comparisonSplit.time : null

      if (deltaSec !== null) {
        cumulativeDelta += deltaSec
      }

      return {
        km,
        baseTime: baseSplit?.time ?? null,
        comparisonTime: comparisonSplit?.time ?? null,
        basePace: baseSplit?.time ?? null,
        comparisonPace: comparisonSplit?.time ?? null,
        deltaSec,
        cumulativeDeltaSec: deltaSec !== null ? cumulativeDelta : null,
      }
    })
  }, [baseSplits?.splits, comparisonSplits?.splits])

  const hasRunSplitComparison = runSplitRows.some((row) => row.baseTime !== null && row.comparisonTime !== null)
  const distanceComparePoints = compareData?.points ?? []
  const hasDistanceComparison = distanceComparePoints.length > 1

  const distanceGapDomain = useMemo<[number, number]>(() => {
    const values = distanceComparePoints
      .map((point) => point.gap_sec)
      .filter((value): value is number => Number.isFinite(value))

    if (values.length === 0) return [-60, 60]

    const minValue = Math.min(...values, 0)
    const maxValue = Math.max(...values, 0)
    const padding = Math.max((maxValue - minValue) * 0.15, 8)
    return [minValue - padding, maxValue + padding]
  }, [distanceComparePoints])

  const performanceChartDomain = useMemo<[number, number]>(() => {
    const values = distanceComparePoints
      .flatMap((point) => (
        isRunComparison
          ? [point.base_pace_sec_per_km, point.comparison_pace_sec_per_km]
          : [point.base_speed_kmh, point.comparison_speed_kmh]
      ))
      .filter((value): value is number => Number.isFinite(value))

    if (values.length === 0) return [0, 1]

    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const padding = Math.max((maxValue - minValue) * 0.12, isRunComparison ? 8 : 1)
    return [Math.max(0, minValue - padding), maxValue + padding]
  }, [distanceComparePoints, isRunComparison])

  const splitChartDomain = useMemo<[number, number]>(() => {
    const values = runSplitRows
      .flatMap((row) => [row.basePace, row.comparisonPace])
      .filter((value): value is number => Number.isFinite(value))

    if (values.length === 0) return [0, 1]

    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const padding = Math.max((maxValue - minValue) * 0.12, 8)
    return [Math.max(0, minValue - padding), maxValue + padding]
  }, [runSplitRows])

  const gapChartDomain = useMemo<[number, number]>(() => {
    const values = runSplitRows
      .map((row) => row.cumulativeDeltaSec)
      .filter((value): value is number => Number.isFinite(value))

    if (values.length === 0) return [-60, 60]

    const minValue = Math.min(...values, 0)
    const maxValue = Math.max(...values, 0)
    const padding = Math.max((maxValue - minValue) * 0.15, 8)
    return [minValue - padding, maxValue + padding]
  }, [runSplitRows])

  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(value))
    } catch {
      return value
    }
  }

  const applyComparison = (comparisonId: number, nextPreset?: 'latest' | 'best' | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('target', String(comparisonId))
    if (nextPreset) {
      next.set('preset', nextPreset)
    } else {
      next.delete('preset')
    }
    setSearchParams(next, { replace: true })
  }

  const openPreset = (nextPreset: 'latest' | 'best') => {
    const candidate = nextPreset === 'latest' ? latestCandidate : bestCandidate
    if (!candidate) return
    applyComparison(candidate.strava_activity_id, nextPreset)
  }

  const performanceLabel = baseActivity && isRunType(baseActivity.type)
    ? t('activityCompare.summary.pace')
    : t('activityCompare.summary.speed')

  const basePerformance = baseActivity
    ? (
        isRunType(baseActivity.type)
          ? formatPaceFromSpeed(safeNumber(baseActivity.avg_speed_kmh), notAvailable)
          : `${safeNumber(baseActivity.avg_speed_kmh).toFixed(1)} ${t('activityDetail.units.kmh')}`
      )
    : notAvailable

  const comparisonPerformance = comparisonActivity
    ? (
        isRunType(comparisonActivity.type)
          ? formatPaceFromSpeed(safeNumber(comparisonActivity.avg_speed_kmh), notAvailable)
          : `${safeNumber(comparisonActivity.avg_speed_kmh).toFixed(1)} ${t('activityDetail.units.kmh')}`
      )
    : notAvailable

  const compareHeadline = useMemo(() => {
    if (!baseActivity || !comparisonActivity) return t('activityCompare.selectionHint')

    const deltaSeconds = baseActivity.moving_time - comparisonActivity.moving_time
    if (deltaSeconds === 0) return t('activityCompare.headline.same')
    if (deltaSeconds < 0) {
      return t('activityCompare.headline.faster', { value: formatDuration(Math.abs(deltaSeconds)) })
    }
    return t('activityCompare.headline.slower', { value: formatDuration(deltaSeconds) })
  }, [baseActivity, comparisonActivity, t])

  const baseLabel = t('activityCompare.summary.base')
  const comparisonLabel = t('activityCompare.summary.comparison')
  const performanceChartTitle = isRunComparison
    ? t('activityCompare.performanceChart.titleRun')
    : t('activityCompare.performanceChart.titleRide')
  const performanceChartSubtitle = isRunComparison
    ? t('activityCompare.performanceChart.subtitleRun')
    : t('activityCompare.performanceChart.subtitleRide')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/activity/${activityId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('activityCompare.backToActivity')}
        </Button>
        {comparisonActivity && (
          <Link
            to={`/activity/${comparisonActivity.strava_activity_id}`}
            className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {t('activityCompare.openSelectedActivity')}
          </Link>
        )}
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                {t('activityCompare.title')}
              </CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {t('activityCompare.subtitle')}
              </div>
            </div>
            {comparisonActivity && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {t('activityCompare.matchBadge', { percent: Number(comparisonActivity.overlap_pct).toFixed(0) })}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <p className="text-sm font-medium text-foreground">{compareHeadline}</p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPreset('latest')}
              disabled={!latestCandidate}
              className="border-border/70 bg-background/70"
            >
              {t('activityCompare.quickPickLatest')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPreset('best')}
              disabled={!bestCandidate}
              className="border-border/70 bg-background/70"
            >
              {t('activityCompare.quickPickBest')}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('activityCompare.baseActivity')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {baseActivity ? (
                  <>
                    <div className="text-base font-semibold text-foreground">{baseActivity.name}</div>
                    <div className="text-sm text-muted-foreground">{formatDate(baseActivity.start_date)}</div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">{t('activityCompare.comparisonActivity')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {comparisonActivity ? (
                  <>
                    <div className="text-base font-semibold text-foreground">{comparisonActivity.name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatDate(comparisonActivity.start_date)}</span>
                      {comparisonActivity.is_latest && (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {t('activityCompare.latest')}
                        </Badge>
                      )}
                      {comparisonActivity.is_best && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                          {t('activityCompare.best')}
                        </Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {contextLoading ? t('common.loading') : t('activityCompare.noComparisonSelected')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('activityCompare.summary.title')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {baseActivity && comparisonActivity ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <SummaryMetric
                    icon={<Route className="h-4 w-4" />}
                    label={t('activityCompare.summary.distance')}
                    baseValue={formatDistance(safeNumber(baseActivity.distance_km) * 1000)}
                    comparisonValue={formatDistance(safeNumber(comparisonActivity.distance_km) * 1000)}
                    baseLabel={baseLabel}
                    comparisonLabel={comparisonLabel}
                  />
                  <SummaryMetric
                    icon={<Clock3 className="h-4 w-4" />}
                    label={t('activityCompare.summary.movingTime')}
                    baseValue={formatDuration(baseActivity.moving_time)}
                    comparisonValue={formatDuration(comparisonActivity.moving_time)}
                    baseLabel={baseLabel}
                    comparisonLabel={comparisonLabel}
                  />
                  <SummaryMetric
                    icon={<Mountain className="h-4 w-4" />}
                    label={t('activityCompare.summary.elevation')}
                    baseValue={formatElevation(safeNumber(baseActivity.total_elevation_gain))}
                    comparisonValue={formatElevation(safeNumber(comparisonActivity.total_elevation_gain))}
                    baseLabel={baseLabel}
                    comparisonLabel={comparisonLabel}
                  />
                  <SummaryMetric
                    icon={<Gauge className="h-4 w-4" />}
                    label={performanceLabel}
                    baseValue={basePerformance}
                    comparisonValue={comparisonPerformance}
                    baseLabel={baseLabel}
                    comparisonLabel={comparisonLabel}
                  />
                  <SummaryMetric
                    icon={<HeartPulse className="h-4 w-4" />}
                    label={t('activityCompare.summary.avgHr')}
                    baseValue={baseActivity.average_heartrate ? `${Math.round(safeNumber(baseActivity.average_heartrate))} ${t('activityDetail.units.bpm')}` : notAvailable}
                    comparisonValue={comparisonActivity.average_heartrate ? `${Math.round(safeNumber(comparisonActivity.average_heartrate))} ${t('activityDetail.units.bpm')}` : notAvailable}
                    baseLabel={baseLabel}
                    comparisonLabel={comparisonLabel}
                    accent="text-rose-500"
                  />
                  <SummaryMetric
                    icon={<Zap className="h-4 w-4" />}
                    label={t('activityCompare.summary.avgPower')}
                    baseValue={baseActivity.average_watts ? `${Math.round(safeNumber(baseActivity.average_watts))} ${t('activityDetail.units.watt')}` : notAvailable}
                    comparisonValue={comparisonActivity.average_watts ? `${Math.round(safeNumber(comparisonActivity.average_watts))} ${t('activityDetail.units.watt')}` : notAvailable}
                    baseLabel={baseLabel}
                    comparisonLabel={comparisonLabel}
                    accent="text-amber-500"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                  {t('activityCompare.noComparisonBody')}
                </div>
              )}
            </CardContent>
          </Card>

          {comparisonActivity ? (
            hasDistanceComparison ? (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TimerReset className="h-4 w-4 text-primary" />
                      {t('activityCompare.distanceChart.title')}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground">{t('activityCompare.distanceChart.subtitle')}</div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={distanceComparePoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                          <XAxis
                            dataKey="distance_km"
                            tickFormatter={(value) => `${Number(value).toFixed(1)}`}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            domain={distanceGapDomain}
                            tickFormatter={(value) => `${Number(value) > 0 ? '+' : ''}${Math.round(Number(value))}s`}
                            tickLine={false}
                            axisLine={false}
                            width={48}
                          />
                          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const point = payload[0].payload as ActivityCompareAlignedPoint

                              return (
                                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
                                  <div className="font-semibold">
                                    {t('activityCompare.distanceChart.tooltipDistance', { distance: formatDistanceLabel(point.distance_km) })}
                                  </div>
                                  <div className="mt-1 text-muted-foreground">
                                    {point.gap_sec < 0
                                      ? t('activityCompare.distanceChart.aheadBy', { value: formatDuration(Math.abs(point.gap_sec)) })
                                      : point.gap_sec > 0
                                        ? t('activityCompare.distanceChart.behindBy', { value: formatDuration(point.gap_sec) })
                                        : t('activityCompare.distanceChart.even')}
                                  </div>
                                  <div className="mt-2 space-y-1 text-muted-foreground">
                                    <div>{baseLabel}: {formatDuration(Math.round(point.base_elapsed_sec))}</div>
                                    <div>{comparisonLabel}: {formatDuration(Math.round(point.comparison_elapsed_sec))}</div>
                                    <div>
                                      {isRunComparison
                                        ? `${baseLabel}: ${formatPaceFromSeconds(point.base_pace_sec_per_km, notAvailable)}`
                                        : `${baseLabel}: ${formatSpeed(point.base_speed_kmh, notAvailable)}`}
                                    </div>
                                    <div>
                                      {isRunComparison
                                        ? `${comparisonLabel}: ${formatPaceFromSeconds(point.comparison_pace_sec_per_km, notAvailable)}`
                                        : `${comparisonLabel}: ${formatSpeed(point.comparison_speed_kmh, notAvailable)}`}
                                    </div>
                                  </div>
                                </div>
                              )
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="gap_sec"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{performanceChartTitle}</CardTitle>
                    <div className="text-sm text-muted-foreground">{performanceChartSubtitle}</div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={distanceComparePoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                          <XAxis
                            dataKey="distance_km"
                            tickFormatter={(value) => `${Number(value).toFixed(1)}`}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            domain={performanceChartDomain}
                            tickFormatter={(value) => (
                              isRunComparison
                                ? formatPaceFromSeconds(Number(value), notAvailable)
                                : formatSpeed(Number(value), notAvailable)
                            )}
                            tickLine={false}
                            axisLine={false}
                            width={isRunComparison ? 68 : 58}
                            reversed={isRunComparison}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null
                              const point = payload[0].payload as ActivityCompareAlignedPoint

                              return (
                                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
                                  <div className="font-semibold">
                                    {t('activityCompare.performanceChart.tooltipDistance', { distance: formatDistanceLabel(point.distance_km) })}
                                  </div>
                                  <div className="mt-1 space-y-1 text-muted-foreground">
                                    <div>
                                      {baseLabel}: {isRunComparison
                                        ? formatPaceFromSeconds(point.base_pace_sec_per_km, notAvailable)
                                        : formatSpeed(point.base_speed_kmh, notAvailable)}
                                    </div>
                                    <div>
                                      {comparisonLabel}: {isRunComparison
                                        ? formatPaceFromSeconds(point.comparison_pace_sec_per_km, notAvailable)
                                        : formatSpeed(point.comparison_speed_kmh, notAvailable)}
                                    </div>
                                    {(point.base_hr !== null || point.comparison_hr !== null) && (
                                      <div>
                                        HR: {point.base_hr !== null ? `${Math.round(point.base_hr)} ${t('activityDetail.units.bpm')}` : notAvailable}
                                        {' / '}
                                        {point.comparison_hr !== null ? `${Math.round(point.comparison_hr)} ${t('activityDetail.units.bpm')}` : notAvailable}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey={isRunComparison ? 'base_pace_sec_per_km' : 'base_speed_kmh'}
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey={isRunComparison ? 'comparison_pace_sec_per_km' : 'comparison_speed_kmh'}
                            stroke="#f59e0b"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5 }}
                            connectNulls={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('activityCompare.distanceChart.title')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                    {compareData?.message || t('activityCompare.distanceChart.noData')}
                  </div>
                </CardContent>
              </Card>
            )
          ) : null}

          {isRunComparison && hasRunSplitComparison ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TimerReset className="h-4 w-4 text-primary" />
                    {t('activityCompare.gapChart.title')}
                  </CardTitle>
                  <div className="text-sm text-muted-foreground">{t('activityCompare.gapChart.subtitle')}</div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={runSplitRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                        <XAxis dataKey="km" tickFormatter={(value) => `${value}`} tickLine={false} axisLine={false} />
                        <YAxis
                          domain={gapChartDomain}
                          tickFormatter={(value) => `${Number(value) > 0 ? '+' : ''}${Math.round(Number(value))}s`}
                          tickLine={false}
                          axisLine={false}
                          width={48}
                        />
                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0].payload as RunSplitCompareRow
                            if (row.cumulativeDeltaSec === null) return null

                            return (
                              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
                                <div className="font-semibold">
                                  {t('activityCompare.gapChart.tooltipKm', { km: row.km })}
                                </div>
                                <div className="mt-1 text-muted-foreground">
                                  {row.cumulativeDeltaSec < 0
                                    ? t('activityCompare.gapChart.aheadBy', { value: formatDuration(Math.abs(row.cumulativeDeltaSec)) })
                                    : row.cumulativeDeltaSec > 0
                                      ? t('activityCompare.gapChart.behindBy', { value: formatDuration(row.cumulativeDeltaSec) })
                                      : t('activityCompare.gapChart.even')}
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="cumulativeDeltaSec"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('activityCompare.paceChart.title')}</CardTitle>
                  <div className="text-sm text-muted-foreground">{t('activityCompare.paceChart.subtitle')}</div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={runSplitRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                        <XAxis dataKey="km" tickFormatter={(value) => `${value}`} tickLine={false} axisLine={false} />
                        <YAxis
                          domain={splitChartDomain}
                          tickFormatter={(value) => formatPaceFromSeconds(Number(value), notAvailable)}
                          tickLine={false}
                          axisLine={false}
                          width={68}
                          reversed
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const row = payload[0].payload as RunSplitCompareRow

                            return (
                              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
                                <div className="font-semibold">
                                  {t('activityCompare.paceChart.tooltipKm', { km: row.km })}
                                </div>
                                <div className="mt-1 space-y-1 text-muted-foreground">
                                  <div>{baseLabel}: {formatPaceFromSeconds(row.basePace, notAvailable)}</div>
                                  <div>{comparisonLabel}: {formatPaceFromSeconds(row.comparisonPace, notAvailable)}</div>
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="basePace"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="comparisonPace"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t('activityCompare.splits.title')}</CardTitle>
                  <div className="text-sm text-muted-foreground">{t('activityCompare.splits.subtitle')}</div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">{t('activityCompare.splits.columns.km')}</th>
                          <th className="px-3 py-2">{baseLabel}</th>
                          <th className="px-3 py-2">{comparisonLabel}</th>
                          <th className="px-3 py-2">{t('activityCompare.splits.columns.delta')}</th>
                          <th className="px-3 py-2">{t('activityCompare.splits.columns.cumulative')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runSplitRows.map((row) => (
                          <tr key={row.km} className="border-b border-border/40">
                            <td className="px-3 py-2 font-medium text-foreground">{row.km}</td>
                            <td className="px-3 py-2 text-foreground">{formatPaceFromSeconds(row.basePace, notAvailable)}</td>
                            <td className="px-3 py-2 text-foreground">{formatPaceFromSeconds(row.comparisonPace, notAvailable)}</td>
                            <td
                              className={cn(
                                'px-3 py-2 font-medium',
                                row.deltaSec === null
                                  ? 'text-muted-foreground'
                                  : row.deltaSec < 0
                                    ? 'text-emerald-500'
                                    : row.deltaSec > 0
                                      ? 'text-amber-500'
                                      : 'text-foreground'
                              )}
                            >
                              {formatDelta(row.deltaSec, notAvailable)}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 font-medium',
                                row.cumulativeDeltaSec === null
                                  ? 'text-muted-foreground'
                                  : row.cumulativeDeltaSec < 0
                                    ? 'text-emerald-500'
                                    : row.cumulativeDeltaSec > 0
                                      ? 'text-amber-500'
                                      : 'text-foreground'
                              )}
                            >
                              {formatDelta(row.cumulativeDeltaSec, notAvailable)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : !hasDistanceComparison ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('activityCompare.nextStepTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-4 text-sm text-muted-foreground">
                  {t('activityCompare.nextStepBody')}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('activityCompare.chooseComparison')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {candidates.length > 0 ? (
              candidates.map((candidate) => {
                const candidateId = toNumericId(candidate.strava_activity_id)
                const isSelected = candidateId === resolvedComparisonId
                return (
                  <button
                    key={candidate.strava_activity_id}
                    type="button"
                    onClick={() => {
                      if (candidateId !== null) applyComparison(candidateId, null)
                    }}
                    className={cn(
                      'w-full rounded-xl border px-3 py-3 text-left transition-colors transition-shadow',
                      isSelected
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : 'border-border/60 bg-card/40 hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{formatDate(candidate.start_date)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {candidate.is_latest && (
                            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                              {t('activityCompare.latest')}
                            </Badge>
                          )}
                          {candidate.is_best && (
                            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                              {t('activityCompare.best')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {t('activityCompare.matchBadge', { percent: Number(candidate.overlap_pct).toFixed(0) })}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>{formatDistance(candidate.distance_km * 1000)}</div>
                      <div className="text-right">{formatDuration(candidate.moving_time)}</div>
                      <div>
                        {baseActivity && isRunType(baseActivity.type)
                          ? formatPaceFromSpeed(Number(candidate.avg_speed_kmh), notAvailable)
                          : `${Number(candidate.avg_speed_kmh).toFixed(1)} ${t('activityDetail.units.kmh')}`}
                      </div>
                      <div className="text-right">{formatElevation(Number(candidate.total_elevation_gain))}</div>
                    </div>
                  </button>
                )
              })
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                {t('activityCompare.noCandidates')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
