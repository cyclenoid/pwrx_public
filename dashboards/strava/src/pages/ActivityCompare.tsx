import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRightLeft, Clock3, Gauge, HeartPulse, Mountain, Route, Zap } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { getActivityCompareContext, type ActivityCompareContextCandidate } from '../lib/api'
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

function SummaryMetric({
  icon,
  label,
  currentValue,
  targetValue,
  currentLabel,
  targetLabel,
  accent = 'text-primary',
}: {
  icon: ReactNode
  label: string
  currentValue: string
  targetValue: string
  currentLabel: string
  targetLabel: string
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
          <span className="text-muted-foreground">{currentLabel}</span>
          <span className="font-semibold text-foreground">{currentValue}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{targetLabel}</span>
          <span className="font-semibold text-foreground">{targetValue}</span>
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
  const requestedTarget = Number(searchParams.get('target') || '')
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

  const resolvedTargetId = useMemo(() => {
    if (Number.isInteger(requestedTarget) && requestedTarget > 0) return requestedTarget
    if (preset === 'best' && compareContext?.best_activity_id) return compareContext.best_activity_id
    if (preset === 'latest' && compareContext?.latest_activity_id) return compareContext.latest_activity_id
    return compareContext?.latest_activity_id ?? compareContext?.best_activity_id ?? null
  }, [compareContext?.best_activity_id, compareContext?.latest_activity_id, preset, requestedTarget])

  const selectedCandidate = useMemo(() => (
    candidates.find((candidate) => candidate.strava_activity_id === resolvedTargetId) ?? null
  ), [candidates, resolvedTargetId])

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

  const applyTarget = (targetId: number, nextPreset?: 'latest' | 'best' | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('target', String(targetId))
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
    applyTarget(candidate.strava_activity_id, nextPreset)
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

  const targetPerformance = selectedCandidate
    ? (
        isRunType(selectedCandidate.type)
          ? formatPaceFromSpeed(safeNumber(selectedCandidate.avg_speed_kmh), notAvailable)
          : `${safeNumber(selectedCandidate.avg_speed_kmh).toFixed(1)} ${t('activityDetail.units.kmh')}`
      )
    : notAvailable

  const compareHeadline = useMemo(() => {
    if (!baseActivity || !selectedCandidate) return t('activityCompare.selectionHint')
    const deltaSeconds = baseActivity.moving_time - selectedCandidate.moving_time
    if (deltaSeconds === 0) return t('activityCompare.headline.same')
    if (deltaSeconds < 0) {
      return t('activityCompare.headline.faster', { value: formatDuration(Math.abs(deltaSeconds)) })
    }
    return t('activityCompare.headline.slower', { value: formatDuration(deltaSeconds) })
  }, [baseActivity, selectedCandidate, t])

  const loading = contextLoading
  const currentSummaryLabel = t('activityCompare.summary.current')
  const targetSummaryLabel = t('activityCompare.summary.target')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/activity/${activityId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('activityCompare.backToActivity')}
        </Button>
        {selectedCandidate && (
          <Link
            to={`/activity/${selectedCandidate.strava_activity_id}`}
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
            {selectedCandidate && (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {t('activityCompare.matchBadge', { percent: Number(selectedCandidate.overlap_pct).toFixed(0) })}
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
                <CardTitle className="text-sm font-medium">{t('activityCompare.currentActivity')}</CardTitle>
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
                <CardTitle className="text-sm font-medium">{t('activityCompare.targetActivity')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {selectedCandidate ? (
                  <>
                    <div className="text-base font-semibold text-foreground">{selectedCandidate.name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatDate(selectedCandidate.start_date)}</span>
                      {selectedCandidate.is_latest && (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {t('activityCompare.latest')}
                        </Badge>
                      )}
                      {selectedCandidate.is_best && (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                          {t('activityCompare.best')}
                        </Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {loading ? t('common.loading') : t('activityCompare.noTargetSelected')}
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
              {baseActivity && selectedCandidate ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <SummaryMetric
                    icon={<Route className="h-4 w-4" />}
                    label={t('activityCompare.summary.distance')}
                    currentValue={formatDistance(safeNumber(baseActivity.distance_km) * 1000)}
                    targetValue={formatDistance(safeNumber(selectedCandidate.distance_km) * 1000)}
                    currentLabel={currentSummaryLabel}
                    targetLabel={targetSummaryLabel}
                  />
                  <SummaryMetric
                    icon={<Clock3 className="h-4 w-4" />}
                    label={t('activityCompare.summary.movingTime')}
                    currentValue={formatDuration(baseActivity.moving_time)}
                    targetValue={formatDuration(selectedCandidate.moving_time)}
                    currentLabel={currentSummaryLabel}
                    targetLabel={targetSummaryLabel}
                  />
                  <SummaryMetric
                    icon={<Mountain className="h-4 w-4" />}
                    label={t('activityCompare.summary.elevation')}
                    currentValue={formatElevation(safeNumber(baseActivity.total_elevation_gain))}
                    targetValue={formatElevation(safeNumber(selectedCandidate.total_elevation_gain))}
                    currentLabel={currentSummaryLabel}
                    targetLabel={targetSummaryLabel}
                  />
                  <SummaryMetric
                    icon={<Gauge className="h-4 w-4" />}
                    label={performanceLabel}
                    currentValue={basePerformance}
                    targetValue={targetPerformance}
                    currentLabel={currentSummaryLabel}
                    targetLabel={targetSummaryLabel}
                  />
                  <SummaryMetric
                    icon={<HeartPulse className="h-4 w-4" />}
                    label={t('activityCompare.summary.avgHr')}
                    currentValue={baseActivity.average_heartrate ? `${Math.round(safeNumber(baseActivity.average_heartrate))} ${t('activityDetail.units.bpm')}` : notAvailable}
                    targetValue={selectedCandidate.average_heartrate ? `${Math.round(safeNumber(selectedCandidate.average_heartrate))} ${t('activityDetail.units.bpm')}` : notAvailable}
                    currentLabel={currentSummaryLabel}
                    targetLabel={targetSummaryLabel}
                    accent="text-rose-500"
                  />
                  <SummaryMetric
                    icon={<Zap className="h-4 w-4" />}
                    label={t('activityCompare.summary.avgPower')}
                    currentValue={baseActivity.average_watts ? `${Math.round(safeNumber(baseActivity.average_watts))} ${t('activityDetail.units.watt')}` : notAvailable}
                    targetValue={selectedCandidate.average_watts ? `${Math.round(safeNumber(selectedCandidate.average_watts))} ${t('activityDetail.units.watt')}` : notAvailable}
                    currentLabel={currentSummaryLabel}
                    targetLabel={targetSummaryLabel}
                    accent="text-amber-500"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-4 py-6 text-sm text-muted-foreground">
                  {t('activityCompare.noTargetBody')}
                </div>
              )}
            </CardContent>
          </Card>

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
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('activityCompare.chooseTarget')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {candidates.length > 0 ? (
              candidates.map((candidate) => {
                const isSelected = candidate.strava_activity_id === resolvedTargetId
                return (
                  <button
                    key={candidate.strava_activity_id}
                    type="button"
                    onClick={() => applyTarget(candidate.strava_activity_id, null)}
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
