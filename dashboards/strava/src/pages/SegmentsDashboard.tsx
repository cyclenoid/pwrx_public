import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { LayoutGrid, List } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { SegmentMiniMap } from '../components/SegmentMiniMap'
import { getSegmentsList, getSegmentsSummary, type SegmentListItem, type SegmentsListResponse } from '../lib/api'
import { formatClimbCategory, formatDistance } from '../lib/utils'
import { useTranslation } from 'react-i18next'

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

const sortDefaults: Record<string, 'asc' | 'desc'> = {
  name: 'asc',
  attempts: 'desc',
  best_elapsed: 'asc',
  best_avg_watts: 'desc',
  best_avg_heartrate: 'desc',
  improvement: 'desc',
  last_date: 'desc',
  distance: 'desc',
  difficulty: 'desc',
}

type SegmentSourceType = 'sync' | 'auto' | 'manual'

export function SegmentsDashboard() {
  const { t, i18n } = useTranslation()
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [sortBy, setSortBy] = useState('attempts')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [sourceTypes, setSourceTypes] = useState<Record<SegmentSourceType, boolean>>({
    sync: true,
    auto: true,
    manual: true,
  })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const pageSize = viewMode === 'cards' ? 12 : 50
  const selectedSourceTypes = (Object.entries(sourceTypes) as Array<[SegmentSourceType, boolean]>)
    .filter(([, enabled]) => enabled)
    .map(([sourceType]) => sourceType)
  const selectedSourceTypesKey = [...selectedSourceTypes].sort().join(',')

  const { data: summaryData } = useQuery({
    queryKey: ['segments-summary', selectedSourceTypesKey],
    queryFn: () => getSegmentsSummary({
      types: selectedSourceTypesKey,
    }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: listData, isLoading: listLoading } = useQuery<SegmentsListResponse>({
    queryKey: ['segments-list', sortBy, sortOrder, selectedSourceTypesKey, search, page, pageSize],
    queryFn: () => getSegmentsList({
      sort: sortBy,
      order: sortOrder,
      types: selectedSourceTypesKey,
      search: search.trim() || undefined,
      limit: pageSize,
      offset: page * pageSize,
    }),
    staleTime: 2 * 60 * 1000,
  })

  const summary = summaryData?.summary
  const totalSegments = summary?.total_segments ?? null
  const totalEfforts = summary?.total_efforts ?? null
  const totalPrs = summary?.total_prs ?? null
  const prRate = totalEfforts !== null
    ? (totalEfforts > 0 ? Math.round((totalPrs ?? 0) / totalEfforts * 1000) / 10 : 0)
    : null
  const avgGrade = summary?.avg_grade ?? null
  const avgDistance = summary?.avg_distance ?? null
  const segments3plus = summary?.segments_3plus ?? null

  const segments = listData?.segments ?? []
  const totalPages = Math.max(1, Math.ceil((listData?.total ?? 0) / pageSize))
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatLocaleDate = (value: string) => new Intl.DateTimeFormat(dateLocale).format(new Date(value))

  const sortLabels: Record<string, string> = {
    name: t('segment.list.sort.name'),
    attempts: t('segment.list.sort.attempts'),
    best_elapsed: t('segment.list.sort.bestTime'),
    best_avg_watts: t('segment.list.sort.bestWatts'),
    best_avg_heartrate: t('segment.list.sort.bestHr'),
    improvement: t('segment.list.sort.improvement'),
    last_date: t('segment.list.sort.lastAttempt'),
    distance: t('segment.list.sort.distance'),
    difficulty: t('segment.list.sort.difficulty'),
  }

  const cardSortOptions = [
    { id: 'attempts', label: t('segment.list.sort.attempts') },
    { id: 'best_elapsed', label: t('segment.list.sort.bestTime') },
    { id: 'distance', label: t('segment.list.sort.distance') },
    { id: 'difficulty', label: t('segment.list.sort.difficulty') },
    { id: 'best_avg_watts', label: t('segment.list.sort.bestWatts') },
    { id: 'best_avg_heartrate', label: t('segment.list.sort.bestHr') },
    { id: 'improvement', label: t('segment.list.sort.improvement') },
    { id: 'last_date', label: t('segment.list.sort.lastAttempt') },
  ]

  const handleSortOrderToggle = () => {
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const handleSort = (columnId: string) => {
    if (sortBy === columnId) {
      handleSortOrderToggle()
      setPage(0)
      return
    }

    setSortBy(columnId)
    setSortOrder(sortDefaults[columnId] || 'desc')
    setPage(0)
  }

  const locationLabel = (segment: SegmentListItem) => {
    return [segment.city, segment.state, segment.country].filter(Boolean).join(', ')
  }

  const getSegmentSourceTag = (segment: SegmentListItem): { label: string; className: string } => {
    if (segment.source === 'strava') {
      return {
        label: t('segment.list.sourceBadges.sync'),
        className: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300',
      }
    }
    if (segment.source === 'local') {
      if (segment.is_auto_climb === false) {
        return {
          label: t('segment.list.sourceBadges.manual'),
          className: 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300',
        }
      }
      return {
        label: t('segment.list.sourceBadges.auto'),
        className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      }
    }
    return {
      label: t('segment.list.sourceBadges.unknown'),
      className: 'border-border/60 bg-secondary/20 text-foreground',
    }
  }

  const sourceFilterOptions: Array<{ id: SegmentSourceType; label: string; className: string }> = [
    {
      id: 'sync',
      label: t('segment.list.sourceBadges.sync'),
      className: 'accent-sky-500',
    },
    {
      id: 'auto',
      label: t('segment.list.sourceBadges.auto'),
      className: 'accent-emerald-500',
    },
    {
      id: 'manual',
      label: t('segment.list.sourceBadges.manual'),
      className: 'accent-violet-500',
    },
  ]

  const handleSourceTypeToggle = (sourceType: SegmentSourceType) => {
    setSourceTypes((prev) => {
      const enabledCount = Object.values(prev).filter(Boolean).length
      if (prev[sourceType] && enabledCount === 1) {
        return prev
      }
      return {
        ...prev,
        [sourceType]: !prev[sourceType],
      }
    })
    setPage(0)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('segment.list.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('segment.list.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 px-2 py-1.5">
            <span className="text-[11px] text-muted-foreground">{t('segment.list.quickFilters')}</span>
            {sourceFilterOptions.map((option) => (
              <label
                key={option.id}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                  sourceTypes[option.id] ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sourceTypes[option.id]}
                  onChange={() => handleSourceTypeToggle(option.id)}
                  className={`h-3.5 w-3.5 rounded border-border ${option.className}`}
                />
                {option.label}
              </label>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder={t('segment.list.searchPlaceholder')}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          />
          <div className="flex gap-1 bg-secondary rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setViewMode('cards')
                setPage(0)
              }}
              className={`p-2 rounded transition-colors cursor-pointer ${viewMode === 'cards' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
              title={t('segment.list.view.cards')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('table')
                setPage(0)
              }}
              className={`p-2 rounded transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
              title={t('segment.list.view.table')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('segment.list.summary.totalSegments')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalSegments !== null ? totalSegments.toLocaleString() : '--'}</div>
            <div className="text-xs text-muted-foreground">
              {segments3plus !== null ? t('segment.list.summary.withAttempts', { count: segments3plus }) : '--'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('segment.list.summary.totalEfforts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{totalEfforts !== null ? totalEfforts.toLocaleString() : '--'}</div>
            <div className="text-xs text-muted-foreground">{totalPrs !== null ? t('segment.list.summary.prs', { count: totalPrs }) : '--'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('segment.list.summary.prRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{prRate !== null ? `${prRate}%` : '--'}</div>
            <div className="text-xs text-muted-foreground">{t('segment.list.summary.prRateHint')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t('segment.list.summary.avgSegment')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-sm font-semibold">{avgDistance ? formatDistance(Number(avgDistance)) : '--'}</div>
            <div className="text-xs text-muted-foreground">
              {t('segment.list.summary.avgGrade', { value: avgGrade !== null ? `${Number(avgGrade).toFixed(1)}%` : '--' })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">{t('segment.list.rankings')}</CardTitle>
            {viewMode === 'cards' ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t('common.sorting')}:</span>
                <div className="flex flex-wrap items-center gap-1">
                  {cardSortOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSort(option.id)}
                      className={`px-2 py-1 rounded border border-border transition-colors ${
                        sortBy === option.id ? 'bg-secondary text-foreground' : 'hover:text-foreground'
                      }`}
                    >
                      {option.label}
                      {sortBy === option.id ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                {t('common.sorting')}: {sortLabels[sortBy] || sortBy} {sortOrder === 'asc' ? '↑' : '↓'}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          {listLoading ? (
            <div className="h-64 bg-muted rounded animate-pulse" />
          ) : segments.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">{t('segment.list.empty')}</div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {segments.map((segment) => {
                const location = locationLabel(segment)
                const improvement = segment.improvement
                const sourceTag = getSegmentSourceTag(segment)
                const categoryLabel = formatClimbCategory(segment.climb_category)
                return (
                  <Card key={segment.segment_id} className="overflow-hidden">
                    <div className="h-36 bg-muted/30 border-b border-border/40">
                      <SegmentMiniMap start={segment.start_latlng ?? null} end={segment.end_latlng ?? null} />
                    </div>
                    <CardContent className="p-4 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/segment/${segment.segment_id}`} className="font-semibold leading-tight hover:text-primary line-clamp-2">
                            {segment.name}
                          </Link>
                          <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0.5 ${sourceTag.className}`}>
                            {sourceTag.label}
                          </Badge>
                          {categoryLabel && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0.5">
                              {categoryLabel}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {segment.distance ? formatDistance(Number(segment.distance)) : '--'}
                          {segment.average_grade !== null && segment.average_grade !== undefined
                            ? ` · ${Number(segment.average_grade).toFixed(1)}%`
                            : ''}
                          {location ? ` · ${location}` : ''}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-muted-foreground">{t('segment.list.columns.attempts')}</div>
                          <div className="font-semibold">{segment.attempts}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t('segment.list.columns.bestTime')}</div>
                          <div className="font-semibold">{formatSegmentDuration(segment.best_elapsed)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t('segment.list.columns.improvementShort')}</div>
                          <div className={`font-semibold ${improvement !== null && improvement > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {improvement !== null ? formatSignedDuration(improvement) : '--'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            {segment.best_avg_watts !== null ? `${Math.round(segment.best_avg_watts)} W` : '-- W'}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            {segment.best_avg_heartrate !== null ? `${Math.round(segment.best_avg_heartrate)} bpm` : '-- bpm'}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground">
                          {segment.last_date ? formatLocaleDate(segment.last_date) : '--'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className={`inline-flex items-center gap-1 ${sortBy === 'name' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.segment')}
                        {sortBy === 'name' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('attempts')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'attempts' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.attempts')}
                        {sortBy === 'attempts' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('best_elapsed')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'best_elapsed' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.bestTime')}
                        {sortBy === 'best_elapsed' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('distance')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'distance' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.distance')}
                        {sortBy === 'distance' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('difficulty')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'difficulty' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.difficulty')}
                        {sortBy === 'difficulty' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('best_avg_watts')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'best_avg_watts' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.bestWatts')}
                        {sortBy === 'best_avg_watts' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('best_avg_heartrate')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'best_avg_heartrate' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.bestHr')}
                        {sortBy === 'best_avg_heartrate' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('improvement')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'improvement' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.improvement')}
                        {sortBy === 'improvement' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort('last_date')}
                        className={`inline-flex items-center justify-end gap-1 w-full ${sortBy === 'last_date' ? 'text-foreground' : 'hover:text-foreground'}`}
                      >
                        {t('segment.list.columns.lastAttempt')}
                        {sortBy === 'last_date' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((segment: SegmentListItem) => {
                    const location = locationLabel(segment)
                    const sourceTag = getSegmentSourceTag(segment)
                    const categoryLabel = formatClimbCategory(segment.climb_category)
                    return (
                      <tr key={segment.segment_id} className="border-b border-border/50">
                        <td className="py-2 px-2">
                          <div className="font-medium flex items-center gap-2">
                            <Link to={`/segment/${segment.segment_id}`} className="hover:text-primary">
                              {segment.name}
                            </Link>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${sourceTag.className}`}>
                              {sourceTag.label}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {segment.distance ? formatDistance(Number(segment.distance)) : '--'}
                            {segment.average_grade !== null && segment.average_grade !== undefined
                              ? ` · ${Number(segment.average_grade).toFixed(1)}%`
                              : ''}
                            {location ? ` · ${location}` : ''}
                          </div>
                        </td>
                        <td className="text-right py-2 px-2 font-semibold">{segment.attempts}</td>
                        <td className="text-right py-2 px-2">{formatSegmentDuration(segment.best_elapsed)}</td>
                        <td className="text-right py-2 px-2">
                          {segment.distance ? formatDistance(Number(segment.distance)) : '--'}
                        </td>
                        <td className="text-right py-2 px-2">
                          {categoryLabel || '--'}
                        </td>
                        <td className="text-right py-2 px-2">
                          {segment.best_avg_watts !== null ? Math.round(segment.best_avg_watts) : '--'}
                        </td>
                        <td className="text-right py-2 px-2">
                          {segment.best_avg_heartrate !== null ? Math.round(segment.best_avg_heartrate) : '--'}
                        </td>
                        <td className="text-right py-2 px-2">
                          {segment.improvement !== null
                            ? (
                              <span className={`font-semibold ${segment.improvement > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {formatSignedDuration(segment.improvement)}
                              </span>
                            )
                            : '--'}
                        </td>
                        <td className="text-right py-2 px-2 text-muted-foreground">
                          {segment.last_date ? formatLocaleDate(segment.last_date) : '--'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>{t('common.pageOf', { current: page + 1, total: totalPages })}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
                className="px-2 py-1 rounded border border-border disabled:opacity-40"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
