import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Dumbbell, LineChart as LineChartIcon, Plus, Table2, Timer } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import {
  createExerciseEntry,
  createExerciseType,
  getExerciseEntries,
  getExerciseSummary,
  getExerciseTypes,
  type ExerciseEntry,
  type ExerciseType,
  type ExerciseUnit,
} from '../lib/api'
import { formatNumber } from '../lib/formatters'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'

const categoryOptions = ['strength', 'core', 'mobility', 'hold', 'custom']
const windowOptions = [30, 90, 365]

const toLocalInputValue = (date: Date) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const formatDateTime = (value?: string | null, locale?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale?.startsWith('de') ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const formatShortDate = (value?: string | null, locale?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale?.startsWith('de') ? 'de-DE' : 'en-US', {
    month: 'short',
    day: '2-digit',
  }).format(date)
}

const formatExerciseValue = (value: number, unit: ExerciseUnit, labels: { reps: string; seconds: string }) => {
  if (unit === 'seconds') {
    if (value >= 60) {
      const minutes = Math.floor(value / 60)
      const seconds = Math.round(value % 60)
      return `${minutes}:${seconds.toString().padStart(2, '0')} ${labels.seconds}`
    }
    return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} ${labels.seconds}`
  }
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} ${labels.reps}`
}

function SummaryPill({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-lg font-semibold leading-tight">{value}</div>
      </div>
    </div>
  )
}

function ExerciseChartCard({
  type,
  entries,
  unitLabels,
  cardLabels,
  categoryLabel,
  locale,
  onLog,
}: {
  type: ExerciseType
  entries: ExerciseEntry[]
  unitLabels: { reps: string; seconds: string }
  cardLabels: { logs: string; best: string; last: string; value: string; empty: string; log: string }
  categoryLabel: string
  locale?: string
  onLog: () => void
}) {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
  )
  const chartData = sortedEntries.map((entry) => ({
    label: formatShortDate(entry.performed_at, locale),
    date: entry.performed_at,
    value: Number(entry.value),
    unit: entry.unit,
  }))
  const latest = sortedEntries[sortedEntries.length - 1] || null
  const bestValue = type.best_value !== null && type.best_value !== undefined
    ? Number(type.best_value)
    : sortedEntries.reduce((best, entry) => Math.max(best, Number(entry.value)), 0)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{type.name}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{categoryLabel}</Badge>
              <Badge variant="secondary">
                {type.default_unit === 'seconds' ? unitLabels.seconds : unitLabels.reps}
              </Badge>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onLog}>
            {cardLabels.log}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{cardLabels.logs}</div>
            <div className="mt-1 font-semibold">{entries.length}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{cardLabels.best}</div>
            <div className="mt-1 truncate font-semibold">
              {bestValue > 0 ? formatExerciseValue(bestValue, type.default_unit, unitLabels) : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{cardLabels.last}</div>
            <div className="mt-1 truncate font-semibold">{formatShortDate(latest?.performed_at, locale)}</div>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" hide />
                <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip
                  formatter={(value, _name, item) => {
                    const payload = item.payload as { unit: ExerciseUnit }
                    return [formatExerciseValue(Number(value || 0), payload.unit, unitLabels), cardLabels.value]
                  }}
                  labelFormatter={(_, payload) => {
                    const first = payload?.[0]?.payload as { date?: string } | undefined
                    return formatDateTime(first?.date, locale)
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            {cardLabels.empty}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function Exercises() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [logTypeId, setLogTypeId] = useState<number | null>(null)
  const [windowDays, setWindowDays] = useState(90)
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [showCreateType, setShowCreateType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeUnit, setNewTypeUnit] = useState<ExerciseUnit>('reps')
  const [newTypeCategory, setNewTypeCategory] = useState('strength')
  const [entryValue, setEntryValue] = useState('')
  const [entryUnit, setEntryUnit] = useState<ExerciseUnit>('reps')
  const [entryDate, setEntryDate] = useState(() => toLocalInputValue(new Date()))
  const [entryNotes, setEntryNotes] = useState('')

  const unitLabels = {
    reps: t('exercises.units.repsShort', { defaultValue: 'reps' }),
    seconds: t('exercises.units.secondsShort', { defaultValue: 's' }),
  }
  const cardLabels = {
    logs: t('exercises.cards.logs', { defaultValue: 'Logs' }),
    best: t('exercises.cards.best', { defaultValue: 'Best' }),
    last: t('exercises.cards.last', { defaultValue: 'Last' }),
    value: t('exercises.cards.value', { defaultValue: 'Value' }),
    empty: t('exercises.cards.empty', { defaultValue: 'No values' }),
    log: t('exercises.actions.openLog', { defaultValue: 'Log entry' }),
  }

  const { data: exerciseTypes = [], isLoading: isTypesLoading } = useQuery({
    queryKey: ['exercise-types'],
    queryFn: getExerciseTypes,
  })

  useEffect(() => {
    if (exerciseTypes.length > 0 && logTypeId === null) {
      setLogTypeId(exerciseTypes[0].id)
      setEntryUnit(exerciseTypes[0].default_unit)
    }
  }, [exerciseTypes, logTypeId])

  const selectedLogType = useMemo(
    () => exerciseTypes.find((type) => type.id === logTypeId) || null,
    [exerciseTypes, logTypeId]
  )

  useEffect(() => {
    if (selectedLogType) {
      setEntryUnit(selectedLogType.default_unit)
    }
  }, [selectedLogType])

  const { data: entries = [], isLoading: isEntriesLoading } = useQuery({
    queryKey: ['exercise-entries', windowDays],
    queryFn: () => getExerciseEntries({ days: windowDays, limit: 500 }),
  })

  const { data: summary } = useQuery({
    queryKey: ['exercise-summary', windowDays],
    queryFn: () => getExerciseSummary(windowDays),
  })

  const entriesByType = useMemo(() => {
    const grouped = new Map<number, ExerciseEntry[]>()
    entries.forEach((entry) => {
      const current = grouped.get(entry.exercise_type_id) || []
      current.push(entry)
      grouped.set(entry.exercise_type_id, current)
    })
    return grouped
  }, [entries])

  const latestEntry = entries[0]

  const createTypeMutation = useMutation({
    mutationFn: () => createExerciseType({
      name: newTypeName.trim(),
      defaultUnit: newTypeUnit,
      category: newTypeCategory,
    }),
    onSuccess: async (created) => {
      setNewTypeName('')
      setShowCreateType(false)
      setLogTypeId(created.id)
      setEntryUnit(created.default_unit)
      setShowLogPanel(true)
      await queryClient.invalidateQueries({ queryKey: ['exercise-types'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-summary'] })
    },
  })

  const createEntryMutation = useMutation({
    mutationFn: () => createExerciseEntry({
      exerciseTypeId: Number(logTypeId),
      performedAt: new Date(entryDate).toISOString(),
      value: Number(entryValue),
      unit: entryUnit,
      notes: entryNotes.trim() || undefined,
    }),
    onSuccess: async () => {
      setEntryValue('')
      setEntryNotes('')
      setEntryDate(toLocalInputValue(new Date()))
      await queryClient.invalidateQueries({ queryKey: ['exercise-entries'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-types'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-summary'] })
    },
  })

  const canCreateType = newTypeName.trim().length >= 2 && !createTypeMutation.isPending
  const canCreateEntry = logTypeId !== null
    && Number(entryValue) > 0
    && !Number.isNaN(new Date(entryDate).getTime())
    && !createEntryMutation.isPending
  const needsInitialType = !isTypesLoading && exerciseTypes.length === 0

  const openLogForType = (type: ExerciseType) => {
    setLogTypeId(type.id)
    setEntryUnit(type.default_unit)
    setShowLogPanel(true)
  }

  const openLogForEntry = (entry: ExerciseEntry) => {
    const type = exerciseTypes.find((candidate) => candidate.id === entry.exercise_type_id)
    if (type) openLogForType(type)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {t('exercises.kicker', { defaultValue: 'Manual log' })}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('exercises.title', { defaultValue: 'Exercises' })}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t('exercises.subtitle', {
              defaultValue: 'Track reps and timed holds alongside your imported training data.',
            })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {windowOptions.map((days) => (
            <Button
              key={days}
              type="button"
              variant={windowDays === days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setWindowDays(days)}
            >
              {t('exercises.windowDays', { defaultValue: '{{days}}d', days })}
            </Button>
          ))}
          <Button type="button" size="sm" className="gap-2" onClick={() => setShowLogPanel((current) => !current)}>
            <Timer size={16} />
            {t('exercises.actions.openLog', { defaultValue: 'Log entry' })}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setShowCreateType((current) => !current)}>
            <Plus size={16} />
            {t('exercises.actions.createType', { defaultValue: 'Create exercise' })}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryPill
          label={t('exercises.stats.entries', { defaultValue: 'Entries' })}
          value={summary?.totalEntries ?? 0}
          icon={<CalendarDays size={17} />}
        />
        <SummaryPill
          label={t('exercises.stats.activeTypes', { defaultValue: 'Active exercises' })}
          value={summary?.activeTypes ?? 0}
          icon={<Dumbbell size={17} />}
        />
        <SummaryPill
          label={t('exercises.stats.last', { defaultValue: 'Last entry' })}
          value={latestEntry ? formatDateTime(latestEntry.performed_at, i18n.language) : '-'}
          icon={<LineChartIcon size={17} />}
        />
      </div>

      {(showLogPanel || showCreateType || needsInitialType) && (
        <Card className="border-primary/30">
          <CardContent className="grid gap-6 pt-6 lg:grid-cols-2">
            {showLogPanel && exerciseTypes.length > 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Timer size={18} />
                    {t('exercises.entryForm.title', { defaultValue: 'Log entry' })}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('exercises.entryForm.subtitle', {
                      defaultValue: 'Record one value for the selected exercise.',
                    })}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="block space-y-1.5 md:col-span-2">
                    <span className="text-sm font-medium">{t('exercises.fields.exercise', { defaultValue: 'Exercise' })}</span>
                    <select
                      value={logTypeId ?? ''}
                      onChange={(event) => {
                        const typeId = Number(event.target.value)
                        const type = exerciseTypes.find((candidate) => candidate.id === typeId)
                        setLogTypeId(typeId)
                        if (type) setEntryUnit(type.default_unit)
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="" disabled>{t('exercises.entryForm.selectExercise', { defaultValue: 'Select exercise' })}</option>
                      {exerciseTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.value', { defaultValue: 'Value' })}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={entryValue}
                      onChange={(event) => setEntryValue(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.unit', { defaultValue: 'Unit' })}</span>
                    <select
                      value={entryUnit}
                      onChange={(event) => setEntryUnit(event.target.value as ExerciseUnit)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="reps">{t('exercises.units.reps', { defaultValue: 'Repetitions' })}</option>
                      <option value="seconds">{t('exercises.units.seconds', { defaultValue: 'Seconds' })}</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.date', { defaultValue: 'Date' })}</span>
                    <input
                      type="datetime-local"
                      value={entryDate}
                      onChange={(event) => setEntryDate(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.notes', { defaultValue: 'Notes' })}</span>
                    <input
                      value={entryNotes}
                      onChange={(event) => setEntryNotes(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </label>

                  <Button
                    type="button"
                    disabled={!canCreateEntry}
                    onClick={() => createEntryMutation.mutate()}
                    className="gap-2"
                  >
                    <Plus size={16} />
                    {createEntryMutation.isPending
                      ? t('exercises.actions.saving', { defaultValue: 'Saving...' })
                      : t('exercises.actions.saveEntry', { defaultValue: 'Save entry' })}
                  </Button>
                </div>
              </div>
            )}

            {(showCreateType || needsInitialType) && (
              <div className={cn('space-y-4', showLogPanel && 'border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0')}>
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <Plus size={18} />
                    {t('exercises.typeForm.title', { defaultValue: 'Create exercise' })}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('exercises.typeForm.subtitle', {
                      defaultValue: 'Add the movement once, then log values over time.',
                    })}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_auto] md:items-end">
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.name', { defaultValue: 'Name' })}</span>
                    <input
                      value={newTypeName}
                      onChange={(event) => setNewTypeName(event.target.value)}
                      placeholder={t('exercises.typeForm.namePlaceholder', { defaultValue: 'Push-ups' })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.unit', { defaultValue: 'Unit' })}</span>
                    <select
                      value={newTypeUnit}
                      onChange={(event) => setNewTypeUnit(event.target.value as ExerciseUnit)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="reps">{t('exercises.units.reps', { defaultValue: 'Repetitions' })}</option>
                      <option value="seconds">{t('exercises.units.seconds', { defaultValue: 'Seconds' })}</option>
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.category', { defaultValue: 'Category' })}</span>
                    <select
                      value={newTypeCategory}
                      onChange={(event) => setNewTypeCategory(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {categoryOptions.map((category) => (
                        <option key={category} value={category}>
                          {t(`exercises.categories.${category}`, { defaultValue: category })}
                        </option>
                      ))}
                    </select>
                  </label>

                  <Button
                    type="button"
                    disabled={!canCreateType}
                    onClick={() => createTypeMutation.mutate()}
                    className="gap-2"
                  >
                    <Plus size={16} />
                    {createTypeMutation.isPending
                      ? t('exercises.actions.creating', { defaultValue: 'Creating...' })
                      : t('exercises.actions.createType', { defaultValue: 'Create exercise' })}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[430px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Table2 size={18} />
              {t('exercises.entries.title', { defaultValue: 'Recent entries' })}
            </CardTitle>
            <CardDescription>
              {t('exercises.entries.subtitle', { defaultValue: 'Filtered by exercise and time window.' })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEntriesLoading || isTypesLoading ? (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                {t('common.loading', { defaultValue: 'Loading...' })}
              </div>
            ) : entries.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{t('exercises.fields.date', { defaultValue: 'Date' })}</th>
                      <th className="px-3 py-2 text-left font-medium">{t('exercises.fields.exercise', { defaultValue: 'Exercise' })}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('exercises.fields.value', { defaultValue: 'Value' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.slice(0, 18).map((entry) => (
                      <tr
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-t border-border/70 transition-colors hover:bg-primary/5 focus:bg-primary/5 focus:outline-none"
                        onClick={() => openLogForEntry(entry)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openLogForEntry(entry)
                          }
                        }}
                      >
                        <td className="px-3 py-2 text-muted-foreground">{formatShortDate(entry.performed_at, i18n.language)}</td>
                        <td className="max-w-[150px] truncate px-3 py-2 font-medium">{entry.exercise_name}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-primary">
                          {formatExerciseValue(Number(entry.value), entry.unit, unitLabels)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {t('exercises.empty.entries', { defaultValue: 'No entries match this filter.' })}
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t('exercises.types.title', { defaultValue: 'Exercise types' })}</h2>
              <p className="text-sm text-muted-foreground">
                {t('exercises.types.subtitle', { defaultValue: 'Select an exercise to inspect its results or log a new value.' })}
              </p>
            </div>
          </div>

          {exerciseTypes.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {exerciseTypes.map((type) => (
                <ExerciseChartCard
                  key={type.id}
                  type={type}
                  entries={entriesByType.get(type.id) || []}
                  unitLabels={unitLabels}
                  cardLabels={cardLabels}
                  categoryLabel={t(`exercises.categories.${type.category}`, { defaultValue: type.category })}
                  locale={i18n.language}
                  onLog={() => openLogForType(type)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {t('exercises.empty.types', { defaultValue: 'Create your first exercise, then log values from the quick entry panel.' })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
