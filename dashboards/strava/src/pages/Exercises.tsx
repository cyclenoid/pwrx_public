import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Dumbbell,
  LineChart as LineChartIcon,
  PencilLine,
  Plus,
  Save,
  Table2,
  Timer,
  X,
} from 'lucide-react'
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
  updateExerciseEntry,
  updateExerciseType,
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
const inputClassName = 'w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm transition-colors focus:border-primary/40 focus:outline-none'

type SidebarMode = 'create-entry' | 'edit-entry' | 'create-type' | 'edit-type'

type EntryDraft = {
  exerciseTypeId: number | null
  value: string
  unit: ExerciseUnit
  performedAt: string
  notes: string
}

type TypeDraft = {
  name: string
  defaultUnit: ExerciseUnit
  category: string
}

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
    return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} ${labels.seconds}`
  }
  return `${formatNumber(value, value % 1 === 0 ? 0 : 1)} ${labels.reps}`
}

const formatDurationHint = (value: number) => {
  if (!Number.isFinite(value) || value < 60) return null
  const minutes = Math.floor(value / 60)
  const seconds = Math.round(value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')} min`
}

const createEntryDraft = (type?: ExerciseType | null): EntryDraft => ({
  exerciseTypeId: type?.id ?? null,
  value: '',
  unit: type?.default_unit ?? 'reps',
  performedAt: toLocalInputValue(new Date()),
  notes: '',
})

const createEntryDraftFromEntry = (entry: ExerciseEntry): EntryDraft => ({
  exerciseTypeId: entry.exercise_type_id,
  value: String(entry.value),
  unit: entry.unit,
  performedAt: toLocalInputValue(new Date(entry.performed_at)),
  notes: entry.notes || '',
})

const createTypeDraft = (type?: ExerciseType | null): TypeDraft => ({
  name: type?.name || '',
  defaultUnit: type?.default_unit ?? 'reps',
  category: type?.category || 'strength',
})

const extractErrorMessage = (error: any, fallback: string) => {
  const apiMessage = error?.response?.data?.error
  if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return fallback
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
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/5 bg-gradient-to-br from-primary/[0.08] via-card to-card px-4 py-3 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="truncate text-xl font-semibold leading-tight">{value}</div>
      </div>
    </div>
  )
}

function getCategoryBadgeClass(category: string) {
  switch (category) {
    case 'strength':
      return 'border-orange-500/30 bg-orange-500/10 text-orange-200'
    case 'core':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-200'
    case 'mobility':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    case 'hold':
      return 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200'
    default:
      return 'border-border/70 bg-secondary/40 text-muted-foreground'
  }
}

function ExerciseChartCard({
  type,
  entries,
  unitLabels,
  unitLongLabels,
  cardLabels,
  categoryLabel,
  locale,
  isSelected,
  onSelect,
  onLog,
}: {
  type: ExerciseType
  entries: ExerciseEntry[]
  unitLabels: { reps: string; seconds: string }
  unitLongLabels: { reps: string; seconds: string }
  cardLabels: { logs: string; best: string; last: string; value: string; empty: string; log: string }
  categoryLabel: string
  locale?: string
  isSelected: boolean
  onSelect: () => void
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
  const bestDurationHint = type.default_unit === 'seconds' ? formatDurationHint(bestValue) : null

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-sm transition-colors',
        isSelected ? 'border-primary/30 ring-1 ring-primary/20' : 'hover:border-primary/20'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onSelect}
            className="min-w-0 text-left"
          >
            <CardTitle className="truncate text-lg">{type.name}</CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={getCategoryBadgeClass(type.category || 'custom')}>
                {categoryLabel}
              </Badge>
              <Badge variant="secondary" className="bg-background/70 text-muted-foreground">
                {type.default_unit === 'seconds' ? unitLongLabels.seconds : unitLongLabels.reps}
              </Badge>
            </div>
          </button>
          <Button type="button" variant={isSelected ? 'default' : 'outline'} size="sm" onClick={onLog}>
            {cardLabels.log}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{cardLabels.logs}</div>
            <div className="mt-1 text-lg font-semibold">{entries.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{cardLabels.best}</div>
            <div className="mt-1 truncate text-lg font-semibold">
              {bestValue > 0 ? formatExerciseValue(bestValue, type.default_unit, unitLabels) : '-'}
            </div>
            {bestDurationHint && <div className="text-xs text-muted-foreground">{bestDurationHint}</div>}
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{cardLabels.last}</div>
            <div className="mt-1 truncate text-lg font-semibold">{formatShortDate(latest?.performed_at, locale)}</div>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.14)" />
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
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null)
  const [windowDays, setWindowDays] = useState(90)
  const [entryFilterTypeId, setEntryFilterTypeId] = useState<number | 'all'>('all')
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('create-entry')
  const [entryDraft, setEntryDraft] = useState<EntryDraft>(() => createEntryDraft(null))
  const [typeDraft, setTypeDraft] = useState<TypeDraft>(() => createTypeDraft(null))
  const [entryError, setEntryError] = useState<string | null>(null)
  const [typeError, setTypeError] = useState<string | null>(null)

  const unitLabels = {
    reps: t('exercises.units.repsShort', { defaultValue: 'reps' }),
    seconds: t('exercises.units.secondsShort', { defaultValue: 's' }),
  }
  const unitLongLabels = {
    reps: t('exercises.units.reps', { defaultValue: 'Repetitions' }),
    seconds: t('exercises.units.seconds', { defaultValue: 'Seconds' }),
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
    if (exerciseTypes.length > 0 && selectedTypeId === null) {
      setSelectedTypeId(exerciseTypes[0].id)
    }
  }, [exerciseTypes, selectedTypeId])

  const selectedType = useMemo(
    () => exerciseTypes.find((type) => type.id === selectedTypeId) || null,
    [exerciseTypes, selectedTypeId]
  )

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

  const latestEntry = entries[0] || null
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedEntryId) || null,
    [entries, selectedEntryId]
  )

  const filteredEntries = useMemo(
    () => entries.filter((entry) => entryFilterTypeId === 'all' || entry.exercise_type_id === entryFilterTypeId),
    [entries, entryFilterTypeId]
  )

  const createTypeMutation = useMutation({
    mutationFn: () => createExerciseType({
      name: typeDraft.name.trim(),
      defaultUnit: typeDraft.defaultUnit,
      category: typeDraft.category,
    }),
    onSuccess: async (created) => {
      setTypeError(null)
      setSelectedTypeId(created.id)
      setTypeDraft(createTypeDraft(created))
      setEntryDraft(createEntryDraft(created))
      setSidebarMode('create-entry')
      await queryClient.invalidateQueries({ queryKey: ['exercise-types'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-summary'] })
    },
    onError: (error) => {
      setTypeError(extractErrorMessage(error, t('exercises.messages.typeSaveError', { defaultValue: 'Exercise could not be saved.' })))
    },
  })

  const updateTypeMutation = useMutation({
    mutationFn: () => {
      if (!selectedTypeId) throw new Error('No exercise selected')
      return updateExerciseType(selectedTypeId, {
        name: typeDraft.name.trim(),
        defaultUnit: typeDraft.defaultUnit,
        category: typeDraft.category,
      })
    },
    onSuccess: async (updated) => {
      setTypeError(null)
      setSelectedTypeId(updated.id)
      setTypeDraft(createTypeDraft(updated))
      setEntryDraft((current) => ({
        ...current,
        exerciseTypeId: updated.id ?? current.exerciseTypeId,
        unit: current.exerciseTypeId === updated.id ? current.unit : updated.default_unit,
      }))
      await queryClient.invalidateQueries({ queryKey: ['exercise-types'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-entries'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-summary'] })
    },
    onError: (error) => {
      setTypeError(extractErrorMessage(error, t('exercises.messages.typeSaveError', { defaultValue: 'Exercise could not be saved.' })))
    },
  })

  const createEntryMutation = useMutation({
    mutationFn: () => createExerciseEntry({
      exerciseTypeId: Number(entryDraft.exerciseTypeId),
      performedAt: new Date(entryDraft.performedAt).toISOString(),
      value: Number(entryDraft.value),
      unit: entryDraft.unit,
      notes: entryDraft.notes.trim() || undefined,
    }),
    onSuccess: async (created) => {
      const nextType = exerciseTypes.find((type) => type.id === created.exercise_type_id) || selectedType
      setEntryError(null)
      setSelectedEntryId(created.id)
      setSelectedTypeId(created.exercise_type_id)
      setEntryDraft(createEntryDraft(nextType || null))
      await queryClient.invalidateQueries({ queryKey: ['exercise-entries'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-types'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-summary'] })
    },
    onError: (error) => {
      setEntryError(extractErrorMessage(error, t('exercises.messages.entrySaveError', { defaultValue: 'Entry could not be saved.' })))
    },
  })

  const updateEntryMutation = useMutation({
    mutationFn: () => {
      if (!selectedEntryId) throw new Error('No entry selected')
      return updateExerciseEntry(selectedEntryId, {
        exerciseTypeId: Number(entryDraft.exerciseTypeId),
        performedAt: new Date(entryDraft.performedAt).toISOString(),
        value: Number(entryDraft.value),
        unit: entryDraft.unit,
        notes: entryDraft.notes.trim() || undefined,
      })
    },
    onSuccess: async (updated) => {
      setEntryError(null)
      setSelectedEntryId(updated.id)
      setSelectedTypeId(updated.exercise_type_id)
      await queryClient.invalidateQueries({ queryKey: ['exercise-entries'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-types'] })
      await queryClient.invalidateQueries({ queryKey: ['exercise-summary'] })
    },
    onError: (error) => {
      setEntryError(extractErrorMessage(error, t('exercises.messages.entrySaveError', { defaultValue: 'Entry could not be saved.' })))
    },
  })

  const canSubmitType = typeDraft.name.trim().length >= 2
    && !(createTypeMutation.isPending || updateTypeMutation.isPending)
  const canSubmitEntry = entryDraft.exerciseTypeId !== null
    && Number(entryDraft.value) > 0
    && !Number.isNaN(new Date(entryDraft.performedAt).getTime())
    && !(createEntryMutation.isPending || updateEntryMutation.isPending)

  const needsInitialType = !isTypesLoading && exerciseTypes.length === 0

  const startCreateEntry = (type?: ExerciseType | null) => {
    const nextType = type || selectedType || exerciseTypes[0] || null
    if (nextType?.id) setSelectedTypeId(nextType.id)
    setSelectedEntryId(null)
    setEntryError(null)
    setEntryDraft(createEntryDraft(nextType))
    setSidebarMode('create-entry')
  }

  const startEditEntry = (entry: ExerciseEntry) => {
    setSelectedEntryId(entry.id)
    setSelectedTypeId(entry.exercise_type_id)
    setEntryError(null)
    setEntryDraft(createEntryDraftFromEntry(entry))
    setSidebarMode('edit-entry')
  }

  const startCreateType = () => {
    setTypeError(null)
    setTypeDraft(createTypeDraft(null))
    setSidebarMode('create-type')
  }

  const startEditType = (type?: ExerciseType | null) => {
    const nextType = type || selectedType || exerciseTypes[0] || null
    if (!nextType) return
    setSelectedTypeId(nextType.id)
    setTypeError(null)
    setTypeDraft(createTypeDraft(nextType))
    setSidebarMode('edit-type')
  }

  const selectType = (type: ExerciseType) => {
    setSelectedTypeId(type.id)
    if (sidebarMode === 'create-entry') {
      setEntryDraft((current) => ({
        ...current,
        exerciseTypeId: type.id ?? null,
        unit: current.value.trim() ? current.unit : type.default_unit,
      }))
    }
    if (sidebarMode === 'edit-type') {
      setTypeDraft(createTypeDraft(type))
    }
  }

  const entryFormTitle = sidebarMode === 'edit-entry'
    ? t('exercises.sidebar.editEntryTitle', { defaultValue: 'Edit entry' })
    : t('exercises.entryForm.title', { defaultValue: 'Log entry' })
  const entryFormSubtitle = sidebarMode === 'edit-entry'
    ? t('exercises.sidebar.editEntrySubtitle', { defaultValue: 'Correct value, time, unit or note for the selected log.' })
    : t('exercises.entryForm.subtitle', { defaultValue: 'Record one value for the selected exercise.' })
  const typeFormTitle = sidebarMode === 'edit-type'
    ? t('exercises.sidebar.editTypeTitle', { defaultValue: 'Edit exercise' })
    : t('exercises.typeForm.title', { defaultValue: 'Create exercise' })
  const typeFormSubtitle = sidebarMode === 'edit-type'
    ? t('exercises.sidebar.editTypeSubtitle', { defaultValue: 'Adjust name, unit or category without leaving the overview.' })
    : t('exercises.typeForm.subtitle', { defaultValue: 'Add the movement once, then log values over time.' })

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            {t('exercises.kicker', { defaultValue: 'Manual log' })}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {t('exercises.title', { defaultValue: 'Exercises' })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('exercises.subtitle', {
              defaultValue: 'Track reps and timed holds alongside your imported training data.',
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <Button type="button" size="sm" className="gap-2" onClick={() => startCreateEntry()}>
            <Timer size={16} />
            {t('exercises.actions.openLog', { defaultValue: 'Log entry' })}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={startCreateType}>
            <Plus size={16} />
            {t('exercises.actions.createType', { defaultValue: 'Create exercise' })}
          </Button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryPill
          label={t('exercises.stats.entries', { defaultValue: 'Entries' })}
          value={summary?.totalEntries ?? 0}
          icon={<CalendarDays size={18} />}
        />
        <SummaryPill
          label={t('exercises.stats.activeTypes', { defaultValue: 'Active exercises' })}
          value={summary?.activeTypes ?? 0}
          icon={<Dumbbell size={18} />}
        />
        <SummaryPill
          label={t('exercises.stats.last', { defaultValue: 'Last entry' })}
          value={latestEntry ? formatDateTime(latestEntry.performed_at, i18n.language) : '-'}
          icon={<LineChartIcon size={18} />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-[28px] bg-gradient-to-br from-primary/[0.05] via-transparent to-transparent p-1">
            <div className="rounded-[24px] bg-background/70 px-5 py-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t('exercises.types.title', { defaultValue: 'Exercise types' })}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('exercises.types.subtitle', { defaultValue: 'Select an exercise to inspect its results or log a new value.' })}
                </p>
              </div>
              {selectedType && (
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => startEditType(selectedType)}>
                  <PencilLine size={15} />
                  {t('exercises.actions.editType', { defaultValue: 'Edit exercise' })}
                </Button>
              )}
            </div>

            {exerciseTypes.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {exerciseTypes.map((type) => (
                  <ExerciseChartCard
                    key={type.id}
                    type={type}
                    entries={entriesByType.get(type.id) || []}
                    unitLabels={unitLabels}
                    unitLongLabels={unitLongLabels}
                    cardLabels={cardLabels}
                    categoryLabel={t(`exercises.categories.${type.category}`, { defaultValue: type.category })}
                    locale={i18n.language}
                    isSelected={type.id === selectedTypeId}
                    onSelect={() => selectType(type)}
                    onLog={() => startCreateEntry(type)}
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
          </section>

          <Card className="rounded-[24px] border-white/5 bg-gradient-to-br from-card via-card to-primary/[0.03] shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Table2 size={18} />
                    {t('exercises.entries.title', { defaultValue: 'Recent entries' })}
                  </CardTitle>
                  <CardDescription>
                    {t('exercises.entries.subtitle', { defaultValue: 'Filtered by exercise and time window.' })}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={entryFilterTypeId === 'all' ? 'default' : 'outline'}
                    onClick={() => setEntryFilterTypeId('all')}
                  >
                    {t('exercises.filters.all', { defaultValue: 'All exercises' })}
                  </Button>
                  {selectedType && (
                    <Button
                      type="button"
                      size="sm"
                      variant={entryFilterTypeId === selectedType.id ? 'default' : 'outline'}
                      onClick={() => setEntryFilterTypeId(selectedType.id)}
                    >
                      {selectedType.name}
                    </Button>
                  )}
                  <select
                    value={entryFilterTypeId}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setEntryFilterTypeId(nextValue === 'all' ? 'all' : Number(nextValue))
                    }}
                    className="h-9 min-w-44 rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
                  >
                    <option value="all">{t('exercises.filters.all', { defaultValue: 'All exercises' })}</option>
                    {exerciseTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isEntriesLoading || isTypesLoading ? (
                <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                  {t('common.loading', { defaultValue: 'Loading...' })}
                </div>
              ) : filteredEntries.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-white/5 bg-background/40">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.03] text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{t('exercises.fields.date', { defaultValue: 'Date' })}</th>
                        <th className="px-3 py-2 text-left font-medium">{t('exercises.fields.exercise', { defaultValue: 'Exercise' })}</th>
                        <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">{t('exercises.fields.notes', { defaultValue: 'Notes' })}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('exercises.fields.value', { defaultValue: 'Value' })}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('exercises.actions.editEntry', { defaultValue: 'Edit' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.slice(0, 24).map((entry) => (
                        <tr
                          key={entry.id}
                          className={cn(
                            'border-t border-white/5 transition-colors',
                            selectedEntryId === entry.id ? 'bg-primary/[0.08]' : 'hover:bg-white/[0.03]'
                          )}
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                            {formatDateTime(entry.performed_at, i18n.language)}
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2 font-medium">
                            <button
                              type="button"
                              className="truncate text-left hover:text-primary"
                              onClick={() => {
                                const type = exerciseTypes.find((candidate) => candidate.id === entry.exercise_type_id)
                                if (type) selectType(type)
                              }}
                            >
                              {entry.exercise_name}
                            </button>
                          </td>
                          <td className="hidden max-w-[220px] truncate px-3 py-2 text-muted-foreground lg:table-cell">
                            {entry.notes || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-primary">
                            <div>{formatExerciseValue(Number(entry.value), entry.unit, unitLabels)}</div>
                            {entry.unit === 'seconds' && formatDurationHint(Number(entry.value)) && (
                              <div className="text-xs font-normal text-muted-foreground">{formatDurationHint(Number(entry.value))}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => startEditEntry(entry)}>
                              <PencilLine size={14} />
                              {t('exercises.actions.editEntry', { defaultValue: 'Edit' })}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {t('exercises.empty.entries', { defaultValue: 'No entries match this filter.' })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card className="rounded-[24px] border-white/5 bg-gradient-to-b from-card via-card to-primary/[0.03] shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">{t('exercises.sidebar.title', { defaultValue: 'Workspace' })}</CardTitle>
              <CardDescription>
                {t('exercises.sidebar.subtitle', {
                  defaultValue: 'Keep input and corrections in one place without blocking the training overview.',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={sidebarMode === 'create-entry' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => startCreateEntry()}
                >
                  <Timer size={15} />
                  {t('exercises.actions.openLog', { defaultValue: 'Log entry' })}
                </Button>
                <Button
                  type="button"
                  variant={sidebarMode === 'edit-entry' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2"
                  disabled={!selectedEntry}
                  onClick={() => selectedEntry && startEditEntry(selectedEntry)}
                >
                  <PencilLine size={15} />
                  {t('exercises.actions.editEntry', { defaultValue: 'Edit' })}
                </Button>
                <Button
                  type="button"
                  variant={sidebarMode === 'create-type' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2"
                  onClick={startCreateType}
                >
                  <Plus size={15} />
                  {t('exercises.actions.createType', { defaultValue: 'Create exercise' })}
                </Button>
                <Button
                  type="button"
                  variant={sidebarMode === 'edit-type' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2"
                  disabled={!selectedType}
                  onClick={() => startEditType(selectedType)}
                >
                  <Dumbbell size={15} />
                  {t('exercises.actions.editType', { defaultValue: 'Edit exercise' })}
                </Button>
              </div>

              {(sidebarMode === 'create-entry' || sidebarMode === 'edit-entry') && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">{entryFormTitle}</h3>
                      {sidebarMode === 'edit-entry' && selectedEntry && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => startCreateEntry(selectedType)}>
                          <X size={15} />
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{entryFormSubtitle}</p>
                  </div>

                  {selectedType && (
                    <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm">
                      <div className="font-medium">{selectedType.name}</div>
                      <div className="text-muted-foreground">
                        {t(`exercises.categories.${selectedType.category}`, { defaultValue: selectedType.category })} ·{' '}
                        {selectedType.default_unit === 'seconds' ? unitLongLabels.seconds : unitLongLabels.reps}
                      </div>
                    </div>
                  )}

                  {entryError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {entryError}
                    </div>
                  )}

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.exercise', { defaultValue: 'Exercise' })}</span>
                    <select
                      value={entryDraft.exerciseTypeId ?? ''}
                      onChange={(event) => {
                        const typeId = Number(event.target.value)
                        const type = exerciseTypes.find((candidate) => candidate.id === typeId) || null
                        setSelectedTypeId(type?.id ?? null)
                        setEntryDraft((current) => ({
                          ...current,
                          exerciseTypeId: type?.id ?? null,
                          unit: type?.default_unit ?? current.unit,
                        }))
                      }}
                      className={cn(inputClassName, 'h-10 py-0')}
                    >
                      <option value="" disabled>
                        {t('exercises.entryForm.selectExercise', { defaultValue: 'Select exercise' })}
                      </option>
                      {exerciseTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('exercises.fields.value', { defaultValue: 'Value' })}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={entryDraft.value}
                        onChange={(event) => setEntryDraft((current) => ({ ...current, value: event.target.value }))}
                        className={cn(inputClassName, 'h-10 py-0')}
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('exercises.fields.unit', { defaultValue: 'Unit' })}</span>
                      <select
                        value={entryDraft.unit}
                        onChange={(event) => setEntryDraft((current) => ({ ...current, unit: event.target.value as ExerciseUnit }))}
                        className={cn(inputClassName, 'h-10 py-0')}
                      >
                        <option value="reps">{t('exercises.units.reps', { defaultValue: 'Repetitions' })}</option>
                        <option value="seconds">{t('exercises.units.seconds', { defaultValue: 'Seconds' })}</option>
                      </select>
                    </label>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.date', { defaultValue: 'Date' })}</span>
                    <input
                      type="datetime-local"
                      value={entryDraft.performedAt}
                      onChange={(event) => setEntryDraft((current) => ({ ...current, performedAt: event.target.value }))}
                      className={cn(inputClassName, 'h-10 py-0')}
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.notes', { defaultValue: 'Notes' })}</span>
                    <textarea
                      value={entryDraft.notes}
                      onChange={(event) => setEntryDraft((current) => ({ ...current, notes: event.target.value }))}
                      rows={3}
                      className={inputClassName}
                    />
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!canSubmitEntry}
                      className="gap-2"
                      onClick={() => {
                        if (sidebarMode === 'edit-entry') {
                          updateEntryMutation.mutate()
                        } else {
                          createEntryMutation.mutate()
                        }
                      }}
                    >
                      <Save size={15} />
                      {sidebarMode === 'edit-entry'
                        ? (updateEntryMutation.isPending
                          ? t('exercises.actions.updating', { defaultValue: 'Updating...' })
                          : t('exercises.actions.updateEntry', { defaultValue: 'Save changes' }))
                        : (createEntryMutation.isPending
                          ? t('exercises.actions.saving', { defaultValue: 'Saving...' })
                          : t('exercises.actions.saveEntry', { defaultValue: 'Save entry' }))}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => startCreateEntry(selectedType)}>
                      {t('exercises.actions.resetEntry', { defaultValue: 'Reset form' })}
                    </Button>
                  </div>
                </div>
              )}

              {(sidebarMode === 'create-type' || sidebarMode === 'edit-type' || needsInitialType) && (
                <div className="space-y-4 border-t border-border pt-5">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold">{typeFormTitle}</h3>
                      {sidebarMode === 'edit-type' && selectedType && (
                        <Button type="button" variant="ghost" size="sm" onClick={startCreateType}>
                          <X size={15} />
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{typeFormSubtitle}</p>
                  </div>

                  {typeError && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {typeError}
                    </div>
                  )}

                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">{t('exercises.fields.name', { defaultValue: 'Name' })}</span>
                    <input
                      value={typeDraft.name}
                      onChange={(event) => setTypeDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder={t('exercises.typeForm.namePlaceholder', { defaultValue: 'Push-ups' })}
                      className={cn(inputClassName, 'h-10 py-0')}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('exercises.fields.unit', { defaultValue: 'Unit' })}</span>
                      <select
                        value={typeDraft.defaultUnit}
                        onChange={(event) => setTypeDraft((current) => ({ ...current, defaultUnit: event.target.value as ExerciseUnit }))}
                        className={cn(inputClassName, 'h-10 py-0')}
                      >
                        <option value="reps">{t('exercises.units.reps', { defaultValue: 'Repetitions' })}</option>
                        <option value="seconds">{t('exercises.units.seconds', { defaultValue: 'Seconds' })}</option>
                      </select>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">{t('exercises.fields.category', { defaultValue: 'Category' })}</span>
                      <select
                        value={typeDraft.category}
                        onChange={(event) => setTypeDraft((current) => ({ ...current, category: event.target.value }))}
                        className={cn(inputClassName, 'h-10 py-0')}
                      >
                        {categoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {t(`exercises.categories.${category}`, { defaultValue: category })}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!canSubmitType}
                      className="gap-2"
                      onClick={() => {
                        if (sidebarMode === 'edit-type') {
                          updateTypeMutation.mutate()
                        } else {
                          createTypeMutation.mutate()
                        }
                      }}
                    >
                      <Save size={15} />
                      {sidebarMode === 'edit-type'
                        ? (updateTypeMutation.isPending
                          ? t('exercises.actions.updating', { defaultValue: 'Updating...' })
                          : t('exercises.actions.updateType', { defaultValue: 'Save exercise' }))
                        : (createTypeMutation.isPending
                          ? t('exercises.actions.creating', { defaultValue: 'Creating...' })
                          : t('exercises.actions.createType', { defaultValue: 'Create exercise' }))}
                    </Button>
                    <Button type="button" variant="ghost" onClick={startCreateType}>
                      {t('exercises.actions.resetType', { defaultValue: 'Reset form' })}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
