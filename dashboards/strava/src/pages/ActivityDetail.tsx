import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  createManualLocalSegment,
  deleteActivity,
  getActivity,
  getActivityKmSplits,
  getActivityPowerCurve,
  getActivityPowerMetrics,
  getActivitySegments,
  getGear,
  getActivityVAM,
  getTrainingLoadPMC,
  rebuildActivityLocalSegments,
  updateActivityGear,
} from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { formatClimbCategory, formatDuration, formatElevation, formatDistance } from '../lib/utils'
import { ActivityMap } from '../components/ActivityMap'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceDot, ReferenceArea, CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { useTheme } from '../components/ThemeProvider'
import { getChartColors, getHeartRateZoneColors, getPowerZoneColors } from '../lib/chartTheme'
import { useUserProfile } from '../hooks/useUserProfile'
import { getTrainingInsights } from '../lib/trainingInsights'

// Helper to safely parse numeric values from API
const safeNumber = (val: string | number | null | undefined): number => {
  if (val === null || val === undefined) return 0
  return typeof val === 'number' ? val : parseFloat(val) || 0
}

const isValidLatLng = (value: [number, number] | null | undefined): value is [number, number] => {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
}

const parseSettingNumber = (val: string | number | null | undefined): number | null => {
  if (val === null || val === undefined || val === '') return null
  const parsed = typeof val === 'number' ? val : parseFloat(val)
  return Number.isFinite(parsed) ? parsed : null
}

const findLowerBoundIndex = (distances: number[], target: number): number => {
  if (distances.length === 0) return 0
  let low = 0
  let high = distances.length - 1
  let result = distances.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (distances[mid] >= target) {
      result = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  return result
}

const findNearestIndex = (distances: number[], target: number): number => {
  if (distances.length === 0) return 0
  const upper = findLowerBoundIndex(distances, target)
  if (upper <= 0) return 0
  const lower = upper - 1
  return Math.abs(distances[upper] - target) < Math.abs(distances[lower] - target) ? upper : lower
}

const sampleStreamRange = (
  values: number[] | undefined,
  distances: number[] | undefined,
  range: { startIndex: number; endIndex: number } | null,
  maxPoints: number = 320
): Array<{ distance: number; value: number; streamIndex: number }> => {
  if (!values || !distances) return []
  const length = Math.min(values.length, distances.length)
  if (length === 0) return []
  let start = 0
  let end = length - 1
  if (range) {
    start = Math.max(0, Math.min(range.startIndex, length - 1))
    end = Math.max(start, Math.min(range.endIndex, length - 1))
  }
  const rangeLength = end - start + 1
  const step = Math.max(1, Math.floor(rangeLength / maxPoints))
  const result: Array<{ distance: number; value: number; streamIndex: number }> = []
  for (let i = start; i <= end; i += step) {
    result.push({
      distance: distances[i] / 1000,
      value: values[i],
      streamIndex: i,
    })
  }
  if (result.length === 0 || result[result.length - 1].streamIndex !== end) {
    result.push({
      distance: distances[end] / 1000,
      value: values[end],
      streamIndex: end,
    })
  }
  return result
}

const formatHoverValue = (
  value: number | null | undefined,
  unit: string,
  digits: number = 0,
  fallback: string = '--'
): string => {
  if (value === null || value === undefined) return fallback
  return `${value.toFixed(digits)} ${unit}`
}

const formatSegmentDuration = (seconds: number | null | undefined, fallback: string = '--'): string => {
  if (seconds === null || seconds === undefined) return fallback
  const totalSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const normalizeSelection = (selection: { startKm: number; endKm: number } | null) => {
  if (!selection) {
    return { startKm: null, endKm: null, hasRange: false }
  }
  const startKm = Math.min(selection.startKm, selection.endKm)
  const endKm = Math.max(selection.startKm, selection.endKm)
  return {
    startKm,
    endKm,
    hasRange: Math.abs(endKm - startKm) >= 0.05,
  }
}

type SelectionSource = 'elevation' | 'speed' | 'heartrate' | 'power' | 'cadence' | null
type BestStatsType = 'best_power' | 'best_wkg' | 'best_np' | 'best_xpower' | 'best_tempo' | 'max_hr' | 'best_vam'

const RIDE_TYPES = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide']

const POWER_DURATION_KEYS: Record<string, string> = {
  '5s': 's5',
  '10s': 's10',
  '30s': 's30',
  '1min': 'm1',
  '2min': 'm2',
  '5min': 'm5',
  '10min': 'm10',
  '20min': 'm20',
  '30min': 'm30',
  '45min': 'm45',
  '1hr': 'h1',
  '1:30h': 'h90',
  '2hr': 'h2',
}


// Compact stat component
function StatItem({ label, value, unit, secondary }: {
  label: string
  value: string | number
  unit?: string
  secondary?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-lg font-semibold">
        {value}{unit && <span className="text-sm font-normal text-muted-foreground ml-0.5">{unit}</span>}
      </span>
      {secondary && <span className="text-xs text-muted-foreground">{secondary}</span>}
    </div>
  )
}

export function ActivityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { resolvedTheme } = useTheme()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [analysisDraft, setAnalysisDraft] = useState<{ startKm: number; endKm: number } | null>(null)
  const [analysisRange, setAnalysisRange] = useState<{ startKm: number; endKm: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionSource, setSelectionSource] = useState<SelectionSource>(null)
  const [bestStatsType, setBestStatsType] = useState<BestStatsType>('best_power')
  const [activePowerIndex, setActivePowerIndex] = useState<number | null>(null)
  const [selectedSegmentEffortId, setSelectedSegmentEffortId] = useState<number | null>(null)
  const [isSegmentsExpanded, setIsSegmentsExpanded] = useState(false)
  const [activityGearId, setActivityGearId] = useState('')

  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const notAvailable = t('common.notAvailable')
  const unitKm = t('activityDetail.units.km')
  const unitMeters = t('activityDetail.units.m')
  const unitKmh = t('activityDetail.units.kmh')
  const unitMinPerKm = t('activityDetail.units.minPerKm')
  const unitBpm = t('activityDetail.units.bpm')
  const unitWatt = t('activityDetail.units.watt')
  const unitWattPerKg = t('activityDetail.units.wattPerKg')
  const unitRpm = t('activityDetail.units.rpm')
  const unitKj = t('activityDetail.units.kj')
  const unitVam = t('activityDetail.units.vam')

  const formatActivityDateTime = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(dateString))
    } catch {
      return dateString
    }
  }

  const { data: activity, isLoading } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => getActivity(Number(id)),
  })

  const { data: gearList = [] } = useQuery({
    queryKey: ['gear'],
    queryFn: getGear,
  })

  const { data: segmentsData, isLoading: segmentsLoading } = useQuery({
    queryKey: ['activity-segments', id],
    queryFn: () => getActivitySegments(Number(id)),
    enabled: !!id,
  })

  const { data: profile } = useUserProfile()

  const { data: powerCurve } = useQuery({
    queryKey: ['activity-power-curve', id],
    queryFn: () => getActivityPowerCurve(Number(id)),
    enabled: !!activity?.streams?.watts,
  })

  const { data: powerMetrics } = useQuery({
    queryKey: ['activity-power-metrics', id],
    queryFn: () => getActivityPowerMetrics(Number(id)),
    enabled: !!activity?.streams?.watts,
  })

  const { data: kmSplits } = useQuery({
    queryKey: ['activity-km-splits', id],
    queryFn: () => getActivityKmSplits(Number(id)),
    enabled: !!activity && (activity.type === 'Run' || activity.type === 'TrailRun' || activity.type === 'VirtualRun'),
  })

  const { data: vamData } = useQuery({
    queryKey: ['activity-vam', id],
    queryFn: () => getActivityVAM(Number(id)),
    enabled: !!activity && !!activity.streams?.altitude && safeNumber(activity.total_elevation_gain) > 0,
  })

  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: number) => deleteActivity(activityId),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      navigate('/activities')
    },
    onError: (error: any) => {
      const backendError = error?.response?.data?.error
      window.alert(backendError || t('activityDetail.delete.error'))
    },
  })

  const updateGearMutation = useMutation({
    mutationFn: (gearId: string | null) => updateActivityGear(Number(id), gearId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['activity', id] })
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      await queryClient.invalidateQueries({ queryKey: ['gear'] })
    },
    onError: (error: any) => {
      const backendError = error?.response?.data?.error
      window.alert(backendError || t('activityDetail.gear.assignError'))
    },
  })

  useEffect(() => {
    setActivityGearId(activity?.gear_id || '')
  }, [activity?.gear_id])

  const rebuildLocalClimbsMutation = useMutation({
    mutationFn: (activityId: number) => rebuildActivityLocalSegments(activityId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['activity-segments', id] })
      await queryClient.invalidateQueries({ queryKey: ['segments-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['segments-list'] })
      window.alert(t('activityDetail.localClimbs.result', { persisted: result.persisted, detected: result.detected }))
    },
    onError: () => {
      window.alert(t('activityDetail.localClimbs.error'))
    },
  })

  const createManualSegmentMutation = useMutation({
    mutationFn: (input: { activityId: number; startIndex: number; endIndex: number; name?: string }) => (
      createManualLocalSegment(input.activityId, {
        startIndex: input.startIndex,
        endIndex: input.endIndex,
        name: input.name,
      })
    ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['activity-segments', id] })
      await queryClient.invalidateQueries({ queryKey: ['segments-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['segments-list'] })
      window.alert(t('activityDetail.segments.manual.success', {
        name: result.name,
        activities: result.matchedActivities,
        efforts: result.persistedEfforts,
      }))
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.error
      window.alert(detail || t('activityDetail.segments.manual.error'))
    },
  })

  // IMPORTANT: All hooks must be called before any conditional returns!
  // Store last hover index ref to avoid unnecessary updates
  const lastHoverIndexRef = useRef<number | null>(null)

  const handleChartHover = useCallback((state: any) => {
    const label = state?.activeLabel
    if (label === undefined || label === null || !activity?.streams?.distance) return
    const target = Number(label) * 1000
    const idx = findNearestIndex(activity.streams.distance, target)
    if (lastHoverIndexRef.current !== idx) {
      lastHoverIndexRef.current = idx
      setHoverIndex(idx)
    }
  }, [activity?.streams?.distance])

  const handleChartLeave = useCallback(() => {
    setHoverIndex(null)
    lastHoverIndexRef.current = null
  }, [])

  const handleAnalysisStart = useCallback((state: any, source: SelectionSource) => {
    if (!source) return
    handleChartHover(state)
    const label = state?.activeLabel
    if (label === undefined || label === null) return
    const start = Number(label)
    setAnalysisDraft({ startKm: start, endKm: start })
    setIsSelecting(true)
    setSelectionSource(source)
  }, [handleChartHover])

  const handleElevationStart = useCallback((state: any) => {
    handleAnalysisStart(state, 'elevation')
  }, [handleAnalysisStart])

  const handleAnalysisMove = useCallback((state: any) => {
    if (!isSelecting) return
    const label = state?.activeLabel
    if (label === undefined || label === null) return
    const end = Number(label)
    setAnalysisDraft(prev => prev ? { ...prev, endKm: end } : { startKm: end, endKm: end })
  }, [isSelecting])

  const handleChartMove = useCallback((state: any) => {
    handleChartHover(state)
    handleAnalysisMove(state)
  }, [handleChartHover, handleAnalysisMove])

  const handleAnalysisEnd = useCallback(() => {
    if (!isSelecting || !analysisDraft) return
    const start = Math.min(analysisDraft.startKm, analysisDraft.endKm)
    const end = Math.max(analysisDraft.startKm, analysisDraft.endKm)
    if (end - start < 0.05) {
      setAnalysisRange(null)
    } else {
    setAnalysisRange({ startKm: start, endKm: end })
    }
    setAnalysisDraft(null)
    setIsSelecting(false)
    setSelectionSource(null)
  }, [analysisDraft, isSelecting])

  const clearAnalysis = useCallback(() => {
    setAnalysisRange(null)
    setAnalysisDraft(null)
    setIsSelecting(false)
    setSelectionSource(null)
    setSelectedSegmentEffortId(null)
  }, [])

  const chartColors = {
    grid: resolvedTheme === 'dark' ? '#374151' : '#e5e7eb',
    text: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
  }

  const colors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')
  const hrRangeColors = useMemo(() => getHeartRateZoneColors(), [])
  const powerZoneColors = useMemo(() => getPowerZoneColors(), [])

  const isRun = activity?.type === 'Run' || activity?.type === 'TrailRun' || activity?.type === 'VirtualRun'
  const isRideType = activity ? RIDE_TYPES.includes(activity.type) : false
  const segmentEfforts = segmentsData?.segments || []
  const selectedSegment = useMemo(() => (
    selectedSegmentEffortId !== null
      ? segmentEfforts.find((segment) => segment.effort_id === selectedSegmentEffortId) ?? null
      : null
  ), [segmentEfforts, selectedSegmentEffortId])
  const selectedIsPr = selectedSegment?.is_pr === true
  const segmentsToShow = segmentEfforts.slice(0, 12)
  const segmentsRemaining = Math.max(segmentEfforts.length - segmentsToShow.length, 0)
  const selectionFill = selectedIsPr ? 'rgba(234, 179, 8, 0.22)' : 'rgba(251, 146, 60, 0.15)'
  const selectionFillStrong = selectedIsPr ? 'rgba(234, 179, 8, 0.32)' : 'rgba(251, 146, 60, 0.2)'

  const pmcDateRange = useMemo(() => {
    if (!activity?.start_date) return null
    const start = new Date(activity.start_date)
    start.setDate(start.getDate() - 90)
    const end = new Date(activity.start_date)
    end.setDate(end.getDate() + 1)
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    }
  }, [activity?.start_date])

  const { data: pmcData } = useQuery({
    queryKey: ['training-load-activity', activity?.type, pmcDateRange?.startDate, pmcDateRange?.endDate],
    queryFn: () => getTrainingLoadPMC({
      startDate: pmcDateRange!.startDate,
      endDate: pmcDateRange!.endDate,
      type: activity?.type,
    }),
    enabled: !!pmcDateRange && isRideType && !!powerMetrics?.ftp,
    staleTime: 5 * 60 * 1000,
  })

  const pmcContext = useMemo(() => {
    const activityDate = activity?.start_date?.split('T')[0]
    if (!pmcData?.dailyValues?.length || !activityDate) return null

    const values = [...pmcData.dailyValues].sort((a, b) => a.date.localeCompare(b.date))
    const index = values.findIndex((entry) => entry.date === activityDate)
    if (index === -1) return null

    const current = values[index]
    const previous = index > 0 ? values[index - 1] : null
    if (!current) return null

    const ctlBaseline = previous?.ctl ?? current.ctl

    return {
      ctlBaseline,
      ctlDelta: previous ? current.ctl - previous.ctl : null,
      atlDelta: previous ? current.atl - previous.atl : null,
      tsbDelta: previous ? current.tsb - previous.tsb : null,
    }
  }, [activity?.start_date, pmcData?.dailyValues])

  const powerZones = useMemo(() => {
    const powerStream = activity?.streams?.watts
    if (!powerStream || powerStream.length === 0) return []

    const ftp = parseSettingNumber(profile?.settings?.ftp)
    if (!ftp || ftp <= 0) return []

    const timeStream = activity?.streams?.time
    const zoneSeconds = [0, 0, 0, 0, 0, 0, 0]
    const hasTimeStream = timeStream && timeStream.length === powerStream.length

    for (let i = 0; i < powerStream.length; i += 1) {
      const watts = powerStream[i]
      if (!watts || watts <= 0) continue

      let deltaSeconds = 1
      if (hasTimeStream && timeStream) {
        if (i < timeStream.length - 1) {
          deltaSeconds = Math.max(1, (timeStream[i + 1] ?? timeStream[i]) - timeStream[i])
        } else if (i > 0) {
          deltaSeconds = Math.max(1, timeStream[i] - timeStream[i - 1])
        }
      }

      const intensity = watts / ftp
      let zoneIndex = 0
      if (intensity < 0.55) zoneIndex = 0
      else if (intensity < 0.76) zoneIndex = 1
      else if (intensity < 0.91) zoneIndex = 2
      else if (intensity < 1.06) zoneIndex = 3
      else if (intensity < 1.21) zoneIndex = 4
      else if (intensity < 1.51) zoneIndex = 5
      else zoneIndex = 6

      zoneSeconds[zoneIndex] += deltaSeconds
    }

    const totalSeconds = zoneSeconds.reduce((sum, value) => sum + value, 0)
    if (totalSeconds <= 0) return []

    return powerZoneColors.map((zone, index) => ({
      zone: zone.zone,
      name: t(`activityDetail.powerZones.names.z${zone.zone}`),
      value: Math.round(zoneSeconds[index]),
      percent: Math.round((zoneSeconds[index] / totalSeconds) * 100),
      color: zone.color,
    }))
  }, [activity?.streams?.watts, activity?.streams?.time, profile?.settings?.ftp, powerZoneColors, t])

  const powerZoneTotal = useMemo(() => {
    return powerZones.reduce((sum, zone) => sum + zone.value, 0)
  }, [powerZones])

  const heartRateRanges = useMemo(() => {
    const heartRateStream = activity?.streams?.heartrate
    if (!heartRateStream || heartRateStream.length === 0) return []

    const timeStream = activity?.streams?.time
    const ranges = [
      { label: '<120', min: 0, max: 120 },
      { label: '120-139', min: 120, max: 140 },
      { label: '140-159', min: 140, max: 160 },
      { label: '160-179', min: 160, max: 180 },
      { label: '>=180', min: 180, max: Number.POSITIVE_INFINITY },
    ]
    const rangeSeconds = new Array(ranges.length).fill(0)
    const hasTimeStream = timeStream && timeStream.length === heartRateStream.length

    for (let i = 0; i < heartRateStream.length; i += 1) {
      const rate = heartRateStream[i]
      if (!rate || rate <= 0) continue

      let deltaSeconds = 1
      if (hasTimeStream && timeStream) {
        if (i < timeStream.length - 1) {
          deltaSeconds = Math.max(1, (timeStream[i + 1] ?? timeStream[i]) - timeStream[i])
        } else if (i > 0) {
          deltaSeconds = Math.max(1, timeStream[i] - timeStream[i - 1])
        }
      }

      let rangeIndex = 0
      if (rate < ranges[0].max) rangeIndex = 0
      else if (rate < ranges[1].max) rangeIndex = 1
      else if (rate < ranges[2].max) rangeIndex = 2
      else if (rate < ranges[3].max) rangeIndex = 3
      else rangeIndex = 4

      rangeSeconds[rangeIndex] += deltaSeconds
    }

    const totalSeconds = rangeSeconds.reduce((sum, value) => sum + value, 0)
    if (totalSeconds <= 0) return []

    return ranges.map((range, index) => ({
      label: range.label,
      value: Math.round(rangeSeconds[index]),
      percent: Math.round((rangeSeconds[index] / totalSeconds) * 100),
      color: hrRangeColors[index]?.color ?? '#9ca3af',
    }))
  }, [activity?.streams?.heartrate, activity?.streams?.time, hrRangeColors])

  const heartRateRangeTotal = useMemo(() => {
    return heartRateRanges.reduce((sum, range) => sum + range.value, 0)
  }, [heartRateRanges])

  const trainingStimulus = useMemo(() => {
    if (!powerMetrics || !powerMetrics.has_power) {
      return { state: 'no_power', message: t('activityDetail.trainingStimulus.noPower') } as const
    }

    if (!powerMetrics.ftp || !powerMetrics.metrics?.intensity_factor || !powerMetrics.metrics?.training_stress_score) {
      return { state: 'no_ftp', message: t('activityDetail.trainingStimulus.noFtp') } as const
    }

    const tss = powerMetrics.metrics.training_stress_score
    const intensityFactor = powerMetrics.metrics.intensity_factor
    const normalizedPower = powerMetrics.metrics.normalized_power
    const durationSeconds = activity?.moving_time ?? powerMetrics.metrics.duration_seconds
    const durationLabel = formatDuration(durationSeconds)
    const trainingInsights = getTrainingInsights({
      tss,
      intensityFactor,
      durationSeconds,
      ctl: pmcContext?.ctlBaseline ?? null,
      ctlDelta: pmcContext?.ctlDelta ?? null,
      atlDelta: pmcContext?.atlDelta ?? null,
      tsbDelta: pmcContext?.tsbDelta ?? null,
    })

    let levelKey: 'veryEasy' | 'easy' | 'moderate' | 'high' | 'veryHigh' | 'extreme' = 'easy'
    let levelClass = 'text-muted-foreground'
    if (tss >= 150) { levelKey = 'extreme'; levelClass = 'text-red-500' }
    else if (tss >= 120) { levelKey = 'veryHigh'; levelClass = 'text-orange-500' }
    else if (tss >= 90) { levelKey = 'high'; levelClass = 'text-yellow-500' }
    else if (tss >= 60) { levelKey = 'moderate'; levelClass = 'text-primary' }
    else if (tss >= 30) { levelKey = 'easy'; levelClass = 'text-muted-foreground' }
    else { levelKey = 'veryEasy'; levelClass = 'text-muted-foreground' }

    let intensityKey: 'easy' | 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'anaerobic' = 'easy'
    if (intensityFactor >= 1.2) intensityKey = 'anaerobic'
    else if (intensityFactor >= 1.05) intensityKey = 'vo2max'
    else if (intensityFactor >= 0.95) intensityKey = 'threshold'
    else if (intensityFactor >= 0.85) intensityKey = 'tempo'
    else if (intensityFactor >= 0.75) intensityKey = 'endurance'
    else if (intensityFactor >= 0.6) intensityKey = 'recovery'

    const level = t(`activityDetail.trainingStimulus.levels.${levelKey}`)
    const intensityLabel = t(`activityDetail.trainingStimulus.intensity.${intensityKey}`)

    return {
      state: 'ok',
      level,
      levelClass,
      intensityLabel,
      tss,
      intensityFactor,
      normalizedPower,
      durationLabel,
      insights: trainingInsights,
    } as const
  }, [
    activity?.moving_time,
    pmcContext?.atlDelta,
    pmcContext?.ctlBaseline,
    pmcContext?.ctlDelta,
    pmcContext?.tsbDelta,
    powerMetrics?.ftp,
    powerMetrics?.has_power,
    powerMetrics?.metrics?.duration_seconds,
    powerMetrics?.metrics?.intensity_factor,
    powerMetrics?.metrics?.normalized_power,
    powerMetrics?.metrics?.training_stress_score,
    t,
  ])

  const trainingStimulusCardClass = useMemo(() => {
    if (trainingStimulus.state !== 'ok') {
      return 'bg-secondary/20 border-border/50'
    }

    const tss = trainingStimulus.tss
    if (tss >= 150) return 'bg-gradient-to-br from-red-500/20 via-red-500/10 to-background border-red-500/30'
    if (tss >= 120) return 'bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30'
    if (tss >= 90) return 'bg-gradient-to-br from-yellow-500/20 via-yellow-500/10 to-background border-yellow-500/30'
    if (tss >= 60) return 'bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-background border-emerald-500/30'
    if (tss >= 30) return 'bg-gradient-to-br from-sky-500/20 via-sky-500/10 to-background border-sky-500/30'
    return 'bg-gradient-to-br from-slate-500/20 via-slate-500/10 to-background border-slate-500/30'
  }, [trainingStimulus])

  const bestStatsOptions = useMemo<Array<{ id: BestStatsType; label: string }>>(() => ([
    { id: 'best_power', label: t('activityDetail.bestStats.options.bestPower') },
    { id: 'best_wkg', label: t('activityDetail.bestStats.options.bestWkg') },
    { id: 'best_np', label: t('activityDetail.bestStats.options.bestNp') },
    { id: 'best_xpower', label: t('activityDetail.bestStats.options.bestXpower') },
    { id: 'best_tempo', label: t('activityDetail.bestStats.options.bestTempo') },
    { id: 'max_hr', label: t('activityDetail.bestStats.options.maxHr') },
    { id: 'best_vam', label: t('activityDetail.bestStats.options.bestVam') },
  ]), [t])

  const bestStatsData = useMemo(() => {
    const powerRows = (powerCurve?.durations || []).map((d) => {
      const key = POWER_DURATION_KEYS[d.label]
      return {
        label: key ? t(`activityDetail.bestStats.durations.${key}`) : d.label,
        value: d.watts ? `${d.watts} ${unitWatt}` : notAvailable,
      }
    })

    const weight = parseSettingNumber(profile?.settings?.athlete_weight)
    const powerWkgRows = weight && weight > 0
      ? (powerCurve?.durations || []).map((d) => {
          const key = POWER_DURATION_KEYS[d.label]
          return {
            label: key ? t(`activityDetail.bestStats.durations.${key}`) : d.label,
            value: d.watts ? `${(d.watts / weight).toFixed(2)} ${unitWattPerKg}` : notAvailable,
          }
        })
      : []

    const npRows: Array<{ label: string; value: string }> = []
    const normalizedPower = powerMetrics?.metrics?.normalized_power ?? null
    const intensityFactor = powerMetrics?.metrics?.intensity_factor ?? null
    const variabilityIndex = powerMetrics?.metrics?.variability_index ?? null
    const trainingStress = powerMetrics?.metrics?.training_stress_score ?? null
    if (normalizedPower) npRows.push({ label: t('activityDetail.bestStats.labels.np'), value: `${normalizedPower} ${unitWatt}` })
    if (intensityFactor) npRows.push({ label: t('activityDetail.bestStats.labels.if'), value: intensityFactor.toFixed(2) })
    if (variabilityIndex) npRows.push({ label: t('activityDetail.bestStats.labels.vi'), value: variabilityIndex.toFixed(2) })
    if (trainingStress) npRows.push({ label: t('activityDetail.bestStats.labels.tss'), value: trainingStress.toFixed(1) })

    const tempoRows: Array<{ label: string; value: string }> = []
    if (isRun && kmSplits?.splits?.length) {
      const parsePaceSeconds = (pace: string) => {
        const [min, sec] = pace.split(':').map(Number)
        return min * 60 + sec
      }
      const fullKmSplits = kmSplits.splits.filter((split) => Number.isInteger(split.km))
      const paceCandidates = fullKmSplits.length > 0 ? fullKmSplits : kmSplits.splits
      const bestSplit = paceCandidates.reduce((best, split) => (
        parsePaceSeconds(split.pace) < parsePaceSeconds(best.pace) ? split : best
      ), paceCandidates[0])
      tempoRows.push({ label: t('activityDetail.bestStats.labels.bestKm'), value: bestSplit.pace })
    } else if (!isRun && safeNumber(activity?.max_speed_kmh) > 0) {
      tempoRows.push({ label: t('activityDetail.bestStats.labels.maxSpeed'), value: `${safeNumber(activity?.max_speed_kmh).toFixed(1)} ${unitKmh}` })
    }

    const hrStream = activity?.streams?.heartrate || []
    const hrStreamMax = hrStream.length > 0
      ? Math.max(...hrStream.filter((rate) => typeof rate === 'number' && rate > 0))
      : 0
    const maxHrValue = Math.max(safeNumber(activity?.max_heartrate), hrStreamMax)
    const maxHrRows = maxHrValue > 0 ? [{ label: t('activityDetail.bestStats.labels.maxHr'), value: `${Math.round(maxHrValue)} ${unitBpm}` }] : []

    const vamRows = vamData?.vam && vamData.vam > 0
      ? [{ label: t('activityDetail.bestStats.labels.vam'), value: `${vamData.vam} ${unitVam}` }]
      : []

    return {
      best_power: {
        rows: powerRows,
        emptyMessage: t('activityDetail.bestStats.empty.power'),
      },
      best_wkg: {
        rows: powerWkgRows,
        emptyMessage: weight ? t('activityDetail.bestStats.empty.power') : t('activityDetail.bestStats.empty.weightMissing'),
      },
      best_np: {
        rows: npRows,
        emptyMessage: t('activityDetail.bestStats.empty.np'),
      },
      best_xpower: {
        rows: [],
        emptyMessage: t('activityDetail.bestStats.empty.xpower'),
      },
      best_tempo: {
        rows: tempoRows,
        emptyMessage: t('activityDetail.bestStats.empty.tempo'),
      },
      max_hr: {
        rows: maxHrRows,
        emptyMessage: t('activityDetail.bestStats.empty.hr'),
      },
      best_vam: {
        rows: vamRows,
        emptyMessage: t('activityDetail.bestStats.empty.vam'),
      },
    } satisfies Record<BestStatsType, { rows: Array<{ label: string; value: string }>; emptyMessage: string }>
  }, [
    powerCurve?.durations,
    profile?.settings?.athlete_weight,
    powerMetrics?.metrics?.normalized_power,
    powerMetrics?.metrics?.intensity_factor,
    powerMetrics?.metrics?.variability_index,
    powerMetrics?.metrics?.training_stress_score,
    isRun,
    kmSplits?.splits,
    activity?.max_speed_kmh,
    activity?.max_heartrate,
    activity?.streams?.heartrate,
    vamData?.vam,
    notAvailable,
    t,
    unitBpm,
    unitKmh,
    unitVam,
    unitWatt,
    unitWattPerKg,
  ])

  // Convert speed to pace for runs (min/km)
  const calculatePace = (speedKmh: number): string => {
    if (speedKmh === 0) return notAvailable
    const paceMinPerKm = 60 / speedKmh
    const minutes = Math.floor(paceMinPerKm)
    const seconds = Math.round((paceMinPerKm - minutes) * 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const elevationSelection = selectionSource === 'elevation'
    ? (analysisDraft ?? analysisRange)
    : analysisRange
  const chartSelection = selectionSource === 'elevation'
    ? (analysisDraft ?? analysisRange)
    : analysisRange
  const liveSelection = analysisDraft ?? analysisRange

  const elevationRange = normalizeSelection(elevationSelection)
  const chartRange = normalizeSelection(chartSelection)
  const liveRange = normalizeSelection(liveSelection)

  const selectionDomain = chartRange.hasRange && chartRange.startKm !== null && chartRange.endKm !== null
    ? [chartRange.startKm, chartRange.endKm]
    : ['dataMin', 'dataMax']

  const analysisStats = useMemo(() => {
    if (!elevationSelection || !activity?.streams?.distance || !activity.streams?.time) return null

    const distances = activity.streams.distance
    const times = activity.streams.time
    if (distances.length === 0 || times.length === 0) return null

    const startMeters = Math.min(elevationSelection.startKm, elevationSelection.endKm) * 1000
    const endMeters = Math.max(elevationSelection.startKm, elevationSelection.endKm) * 1000

    let startIdx = findLowerBoundIndex(distances, startMeters)
    let endIdx = findLowerBoundIndex(distances, endMeters)

    const maxIdx = Math.min(distances.length, times.length) - 1
    startIdx = Math.min(startIdx, maxIdx)
    endIdx = Math.min(endIdx, maxIdx)
    if (endIdx < startIdx) [startIdx, endIdx] = [endIdx, startIdx]

    const distanceKm = (distances[endIdx] - distances[startIdx]) / 1000
    const durationSec = Math.max(0, (times[endIdx] || 0) - (times[startIdx] || 0))
    const avgSpeedKmh = durationSec > 0 ? distanceKm / (durationSec / 3600) : 0
    const avgPace = isRun && avgSpeedKmh > 0 ? calculatePace(avgSpeedKmh) : null

    const averageInRange = (values?: number[]) => {
      if (!values || values.length === 0) return null
      let sum = 0
      let count = 0
      const upper = Math.min(endIdx, values.length - 1)
      for (let i = startIdx; i <= upper; i++) {
        const value = values[i]
        if (typeof value === 'number' && value > 0) {
          sum += value
          count += 1
        }
      }
      return count > 0 ? Math.round(sum / count) : null
    }

    let elevationGain: number | null = null
    if (activity.streams.altitude && activity.streams.altitude.length > 1) {
      const altitudes = activity.streams.altitude
      const upper = Math.min(endIdx, altitudes.length - 1)
      let gain = 0
      for (let i = Math.max(startIdx + 1, 1); i <= upper; i++) {
        const diff = altitudes[i] - altitudes[i - 1]
        if (diff > 0) gain += diff
      }
      elevationGain = Math.round(gain)
    }

    return {
      distanceKm,
      durationSec,
      avgSpeedKmh,
      avgPace,
      elevationGain,
      avgHr: averageInRange(activity.streams.heartrate),
      avgPower: averageInRange(activity.streams.watts),
      avgCadence: averageInRange(activity.streams.cadence),
    }
  }, [elevationSelection, activity, isRun])

  const distanceStream = activity?.streams?.distance
  const timeStream = activity?.streams?.time
  const altitudeStream = activity?.streams?.altitude
  const heartRateStream = activity?.streams?.heartrate
  const powerStream = activity?.streams?.watts
  const cadenceStream = activity?.streams?.cadence

  const speedStream = useMemo(() => {
    if (!distanceStream || !timeStream) return null
    const length = Math.min(distanceStream.length, timeStream.length)
    if (length < 2) return null
    const speeds = new Array(length).fill(0)
    for (let i = 1; i < length; i++) {
      const deltaDistance = distanceStream[i] - distanceStream[i - 1]
      const deltaTime = timeStream[i] - timeStream[i - 1]
      if (deltaTime > 0 && deltaDistance >= 0) {
        speeds[i] = (deltaDistance / 1000) / (deltaTime / 3600)
      } else {
        speeds[i] = speeds[i - 1] || 0
      }
    }
    speeds[0] = speeds[1] || 0
    return speeds
  }, [distanceStream, timeStream])

  const chartSelectionIndices = useMemo(() => {
    if (!chartRange.hasRange || chartRange.startKm === null || chartRange.endKm === null || !distanceStream || distanceStream.length === 0) return null
    const startMeters = chartRange.startKm * 1000
    const endMeters = chartRange.endKm * 1000
    const startIndex = findLowerBoundIndex(distanceStream, startMeters)
    const endIndex = findLowerBoundIndex(distanceStream, endMeters)
    return {
      startIndex: Math.min(startIndex, endIndex),
      endIndex: Math.max(startIndex, endIndex),
    }
  }, [chartRange, distanceStream])

  const liveSelectionIndices = useMemo(() => {
    if (!liveRange.hasRange || liveRange.startKm === null || liveRange.endKm === null || !distanceStream || distanceStream.length === 0) return null
    const startMeters = liveRange.startKm * 1000
    const endMeters = liveRange.endKm * 1000
    const startIndex = findLowerBoundIndex(distanceStream, startMeters)
    const endIndex = findLowerBoundIndex(distanceStream, endMeters)
    return {
      startIndex: Math.min(startIndex, endIndex),
      endIndex: Math.max(startIndex, endIndex),
    }
  }, [liveRange, distanceStream])

  const segmentPreviewData = useMemo(() => {
    if (!liveSelectionIndices || !distanceStream || !altitudeStream) return null
    const maxIdx = Math.min(distanceStream.length, altitudeStream.length) - 1
    if (maxIdx < 1) return null

    const startIdx = Math.max(0, Math.min(liveSelectionIndices.startIndex, maxIdx))
    const endIdx = Math.max(0, Math.min(liveSelectionIndices.endIndex, maxIdx))
    if (endIdx <= startIdx) return null

    const baseDistance = distanceStream[startIdx]
    const points: Array<{ distance: number; altitude: number }> = []
    for (let i = startIdx; i <= endIdx; i++) {
      const distance = distanceStream[i]
      const altitude = altitudeStream[i]
      if (!Number.isFinite(distance) || !Number.isFinite(altitude)) continue
      points.push({
        distance: (distance - baseDistance) / 1000,
        altitude,
      })
    }
    return points.length > 1 ? points : null
  }, [liveSelectionIndices, distanceStream, altitudeStream])

  const segmentPreviewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!selectedSegmentEffortId || !segmentPreviewRef.current) return
    segmentPreviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedSegmentEffortId])

  useEffect(() => {
    if (selectedSegmentEffortId !== null) {
      setIsSegmentsExpanded(true)
    }
  }, [selectedSegmentEffortId])

  const canCreateManualSegment = Boolean(
    chartSelectionIndices
    && chartSelectionIndices.endIndex > chartSelectionIndices.startIndex
    && activity?.streams?.latlng
    && activity.streams.latlng.length > chartSelectionIndices.endIndex
  )

  const handleCreateManualSegment = useCallback(async () => {
    if (!activity || !chartSelectionIndices) return
    const startDistanceM = distanceStream?.[chartSelectionIndices.startIndex] ?? 0
    const endDistanceM = distanceStream?.[chartSelectionIndices.endIndex] ?? startDistanceM
    const distanceKm = Math.max(0.1, (endDistanceM - startDistanceM) / 1000)
    const defaultName = t('activityDetail.segments.manual.defaultName', { distance: distanceKm.toFixed(1) })
    const rawName = window.prompt(t('activityDetail.segments.manual.prompt'), defaultName)
    if (rawName === null) return
    const trimmedName = rawName.trim()
    try {
      await createManualSegmentMutation.mutateAsync({
        activityId: Number(activity.strava_activity_id),
        startIndex: chartSelectionIndices.startIndex,
        endIndex: chartSelectionIndices.endIndex,
        name: trimmedName || undefined,
      })
    } catch {
      // error handled in mutation.onError
    }
  }, [
    activity,
    chartSelectionIndices,
    createManualSegmentMutation,
    distanceStream,
    t,
  ])

  const nudgeManualSegmentBoundary = useCallback((target: 'start' | 'end', delta: number) => {
    if (!chartSelectionIndices || !distanceStream || distanceStream.length < 2) return
    const maxIdx = distanceStream.length - 1
    let startIdx = chartSelectionIndices.startIndex
    let endIdx = chartSelectionIndices.endIndex

    if (target === 'start') {
      startIdx = Math.max(0, Math.min(startIdx + delta, endIdx - 1))
    } else {
      endIdx = Math.min(maxIdx, Math.max(endIdx + delta, startIdx + 1))
    }

    setSelectedSegmentEffortId(null)
    setAnalysisDraft(null)
    setIsSelecting(false)
    setSelectionSource('elevation')
    setAnalysisRange({
      startKm: distanceStream[startIdx] / 1000,
      endKm: distanceStream[endIdx] / 1000,
    })
  }, [chartSelectionIndices, distanceStream])

  const handleSegmentHighlight = useCallback((segment: any) => {
    if (!distanceStream || distanceStream.length === 0) return
    if (segment?.start_index === null || segment?.end_index === null || segment?.start_index === undefined || segment?.end_index === undefined) return

    const maxIdx = distanceStream.length - 1
    const startIdx = Math.max(0, Math.min(Number(segment.start_index), maxIdx))
    const endIdx = Math.max(0, Math.min(Number(segment.end_index), maxIdx))
    const startKm = distanceStream[Math.min(startIdx, endIdx)] / 1000
    const endKm = distanceStream[Math.max(startIdx, endIdx)] / 1000

    if (selectedSegmentEffortId === segment.effort_id) {
      clearAnalysis()
      return
    }

    setSelectedSegmentEffortId(segment.effort_id)
    setAnalysisDraft(null)
    setIsSelecting(false)
    setSelectionSource(null)
    setAnalysisRange({ startKm, endKm })
  }, [clearAnalysis, distanceStream, selectedSegmentEffortId])

  const cursorStats = useMemo(() => {
    if (hoverIndex === null || !distanceStream || distanceStream[hoverIndex] === undefined) return null
    const distanceKm = distanceStream[hoverIndex] / 1000
    return {
      distanceKm,
      speedKmh: speedStream?.[hoverIndex] ?? null,
      heartrate: heartRateStream?.[hoverIndex] ?? null,
      power: powerStream?.[hoverIndex] ?? null,
      cadence: cadenceStream?.[hoverIndex] ?? null,
      altitude: altitudeStream?.[hoverIndex] ?? null,
    }
  }, [hoverIndex, distanceStream, speedStream, heartRateStream, powerStream, cadenceStream, altitudeStream])

  // Early returns after all hooks
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">{t('activityDetail.loading')}</p>
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">{t('activityDetail.notFound')}</p>
      </div>
    )
  }

  const activityTypeLabel = t(`activities.filters.types.${activity.type}`, { defaultValue: activity.type })
  const activitySource = typeof (activity as any).source === 'string' ? String((activity as any).source) : null
  const isImportedActivity = activity.strava_activity_id < 0 || (activitySource !== null && activitySource !== 'strava')
  const hasStravaLink = !isImportedActivity
    && Number.isFinite(Number(activity.strava_activity_id))
    && Number(activity.strava_activity_id) > 0
  const canRebuildLocalClimbs = true
  const showHeaderActions = hasStravaLink || canRebuildLocalClimbs || isImportedActivity

  const handleDeleteImportedActivity = async () => {
    const confirmed = window.confirm(t('activityDetail.delete.confirm', { name: activity.name }))
    if (!confirmed) return
    try {
      await deleteActivityMutation.mutateAsync(Number(activity.strava_activity_id))
    } catch {
      // Error is handled in mutation.onError
    }
  }

  const handleRebuildLocalClimbs = async () => {
    try {
      await rebuildLocalClimbsMutation.mutateAsync(Number(activity.strava_activity_id))
    } catch {
      // Error handled in mutation.onError
    }
  }

  const hasMap = activity.streams?.latlng && activity.streams.latlng.length > 0
  const hasElevation = activity.streams?.altitude && activity.streams.altitude.length > 0
  const hasPower = activity.streams?.watts && activity.streams.watts.length > 0

  const avgPace = isRun && activity.avg_speed_kmh ? calculatePace(safeNumber(activity.avg_speed_kmh)) : null
  const maxPace = isRun && activity.max_speed_kmh ? calculatePace(safeNumber(activity.max_speed_kmh)) : null

  // Helper function to resample data at equal distance intervals
  const resampleAtEqualIntervals = (
    values: number[],
    distances: number[],
    intervalMeters: number = 100
  ): Array<{ distance: number; value: number; streamIndex: number }> => {
    if (!values || !distances || values.length === 0 || distances.length === 0) return []

    const totalDistance = distances[distances.length - 1]
    const result: Array<{ distance: number; value: number; streamIndex: number }> = []

    let currentInterval = 0

    // Always include the first point
    result.push({
      distance: distances[0] / 1000,
      value: values[0],
      streamIndex: 0
    })

    // Generate points at regular intervals
    while (currentInterval < totalDistance) {
      currentInterval += intervalMeters
      if (currentInterval >= totalDistance) break

      // Find the two points that bracket this distance
      let lowerIdx = 0
      for (let i = 0; i < distances.length - 1; i++) {
        if (distances[i] <= currentInterval && distances[i + 1] > currentInterval) {
          lowerIdx = i
          break
        }
      }

      const upperIdx = lowerIdx + 1
      if (upperIdx >= distances.length) break

      // Linear interpolation
      const d1 = distances[lowerIdx]
      const d2 = distances[upperIdx]
      const v1 = values[lowerIdx]
      const v2 = values[upperIdx]

      const fraction = (currentInterval - d1) / (d2 - d1)
      const interpolatedValue = v1 + (v2 - v1) * fraction

      result.push({
        distance: currentInterval / 1000,
        value: interpolatedValue,
        streamIndex: lowerIdx
      })
    }

    // Always include the last point
    result.push({
      distance: distances[distances.length - 1] / 1000,
      value: values[values.length - 1],
      streamIndex: values.length - 1
    })

    return result
  }

  // Prepare combined elevation chart data with equal distance intervals
  // Use relative altitude starting from activity start height to make gradients more visible
  const elevationData = hasElevation
    ? (() => {
        const altitudes = activity.streams!.altitude!
        const distances = activity.streams!.distance!
        const baseAltitude = altitudes[0] // Start from activity start altitude

        // Resample at 100m intervals for smooth, evenly-spaced profile
        const resampled = resampleAtEqualIntervals(altitudes, distances, 100)

        return resampled.map(point => ({
          distance: point.distance,
          altitude: point.value - baseAltitude, // Relative altitude from start
          streamIndex: point.streamIndex,
        }))
      })()
    : []

  // Get the lat/lng for the current hover position
  const hoverCandidate = hoverIndex !== null && hasMap
    ? activity.streams?.latlng?.[hoverIndex]
    : null
  const hoverPosition: [number, number] | null = isValidLatLng(hoverCandidate) ? hoverCandidate : null

  const hoverDistanceKm = hoverIndex !== null && distanceStream && distanceStream[hoverIndex] !== undefined
    ? distanceStream[hoverIndex] / 1000
    : null
  const elevationBaseAltitude = altitudeStream && altitudeStream.length > 0 ? altitudeStream[0] : 0
  const hoverAltitude = hoverIndex !== null && altitudeStream && altitudeStream[hoverIndex] !== undefined
    ? altitudeStream[hoverIndex] - elevationBaseAltitude
    : null

  // Find max power in curve for highlighting
  const speedChartData = sampleStreamRange(speedStream ?? undefined, distanceStream, chartSelectionIndices)
  const heartRateChartData = sampleStreamRange(heartRateStream, distanceStream, chartSelectionIndices)
  const powerChartData = sampleStreamRange(powerStream, distanceStream, chartSelectionIndices)
  const cadenceChartData = sampleStreamRange(cadenceStream, distanceStream, chartSelectionIndices)

  const speedOverlay = normalizeSelection(
    selectionSource === 'speed' || selectionSource === 'elevation'
      ? (analysisDraft ?? analysisRange)
      : analysisRange
  )
  const heartRateOverlay = normalizeSelection(
    selectionSource === 'heartrate' || selectionSource === 'elevation'
      ? (analysisDraft ?? analysisRange)
      : analysisRange
  )
  const powerOverlay = normalizeSelection(
    selectionSource === 'power' || selectionSource === 'elevation'
      ? (analysisDraft ?? analysisRange)
      : analysisRange
  )
  const cadenceOverlay = normalizeSelection(
    selectionSource === 'cadence' || selectionSource === 'elevation'
      ? (analysisDraft ?? analysisRange)
      : analysisRange
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/activities">
            <Button variant="ghost" size="sm" className="mb-1 -ml-2 h-7 text-xs">
              {t('activityDetail.backToActivities')}
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{activity.name}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{formatActivityDateTime(activity.start_date)} • {activityTypeLabel}</span>
            {/* Engagement metrics */}
            <div className="flex items-center gap-3">
              {(activity as any).kudos_count > 0 && (
                <span className="flex items-center gap-1" title={t('activityDetail.header.kudos')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 10v12"/>
                    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>
                  </svg>
                  {(activity as any).kudos_count}
                </span>
              )}
              {(activity as any).comment_count > 0 && (
                <span className="flex items-center gap-1" title={t('activityDetail.header.comments')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  {(activity as any).comment_count}
                </span>
              )}
              {(activity as any).achievement_count > 0 && (
                <span className="flex items-center gap-1 text-orange-500" title={t('activityDetail.header.achievements')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="6"/>
                    <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
                  </svg>
                  {(activity as any).achievement_count}
                </span>
              )}
            </div>
          </div>
          {/* Device info */}
          {(activity as any).device_name && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('activityDetail.recordedWith', { device: (activity as any).device_name })}
            </p>
          )}
        </div>
        {showHeaderActions && (
          <div className="flex flex-col items-end gap-2">
            {hasStravaLink && (
              <a
                href={`https://www.strava.com/activities/${activity.strava_activity_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {t('activityDetail.viewOnStrava')}
              </a>
            )}
            {canRebuildLocalClimbs && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleRebuildLocalClimbs}
                  disabled={rebuildLocalClimbsMutation.isPending}
                >
                  {rebuildLocalClimbsMutation.isPending
                    ? t('activityDetail.localClimbs.running')
                    : t('activityDetail.localClimbs.button')}
                </Button>
                {isImportedActivity && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
                  onClick={handleDeleteImportedActivity}
                  disabled={deleteActivityMutation.isPending}
                >
                  {deleteActivityMutation.isPending
                    ? t('activityDetail.delete.deleting')
                    : t('activityDetail.delete.button')}
                </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left Side - Main Stats & Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Core Stats - Compact Row */}
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                <StatItem
                  label={t('activityDetail.stats.distance')}
                  value={safeNumber(activity.distance_km).toFixed(2)}
                  unit={unitKm}
                />
                <StatItem
                  label={t('activityDetail.stats.movingTime')}
                  value={formatDuration(activity.moving_time)}
                />
                <StatItem
                  label={t('activityDetail.stats.elevation')}
                  value={formatElevation(safeNumber(activity.total_elevation_gain))}
                  secondary={
                    vamData && vamData.vam > 0
                      ? t('activityDetail.stats.vam', { value: vamData.vam, unit: unitVam })
                      : undefined
                  }
                />
                {isRun ? (
                  <StatItem
                    label={t('activityDetail.stats.avgPace')}
                    value={avgPace || notAvailable}
                    unit={unitMinPerKm}
                    secondary={maxPace ? t('activityDetail.stats.bestPace', { value: maxPace, unit: unitMinPerKm }) : undefined}
                  />
                ) : (
                  <StatItem
                    label={t('activityDetail.stats.avgSpeed')}
                    value={safeNumber(activity.avg_speed_kmh).toFixed(1)}
                    unit={unitKmh}
                    secondary={t('activityDetail.stats.maxSpeed', { value: safeNumber(activity.max_speed_kmh).toFixed(1), unit: unitKmh })}
                  />
                )}
                {activity.average_heartrate && (
                  <StatItem
                    label={t('activityDetail.stats.avgHr')}
                    value={Math.round(safeNumber(activity.average_heartrate))}
                    unit={unitBpm}
                    secondary={activity.max_heartrate ? t('activityDetail.stats.maxHr', { value: Math.round(safeNumber(activity.max_heartrate)), unit: unitBpm }) : undefined}
                  />
                )}
                {activity.average_watts && (
                  <StatItem
                    label={t('activityDetail.stats.avgPower')}
                    value={Math.round(safeNumber(activity.average_watts))}
                    unit={unitWatt}
                    secondary={activity.kilojoules ? t('activityDetail.stats.energy', { value: Math.round(safeNumber(activity.kilojoules)), unit: unitKj }) : undefined}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Photos */}
          {activity.photos && activity.photos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                  </svg>
                  {t('activityDetail.photos.title', { count: activity.photos.length })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {activity.photos.map((photo) => (
                    <a
                      key={photo.unique_id}
                      href={photo.url_large || photo.url_medium || photo.url_small}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square overflow-hidden rounded-lg group"
                    >
                      <img
                        src={photo.url_medium || photo.url_small}
                        alt={photo.caption || t('activityDetail.photos.photoAlt')}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      {photo.is_primary && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] rounded">
                          {t('activityDetail.photos.primary')}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Map */}
          {hasMap && (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="h-[400px]">
                  <ActivityMap
                    coordinates={activity.streams!.latlng!}
                    showMarkers={true}
                    hoverPosition={hoverPosition}
                    highlightRange={liveSelectionIndices}
                    showHighlightMarkers={true}
                    focusHighlight={Boolean(liveSelectionIndices && liveSelectionIndices.endIndex > liveSelectionIndices.startIndex)}
                    highlightStyle={selectedIsPr ? { color: '#fbbf24', weight: 7, opacity: 0.95 } : undefined}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Segments (collapsible) */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="m7 14 4-4 4 4 5-5" />
                  </svg>
                  {t('activityDetail.segments.title')} {segmentsData?.count ? t('activityDetail.segments.count', { count: segmentsData.count }) : ''}
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setIsSegmentsExpanded((prev) => !prev)}
                >
                  {isSegmentsExpanded ? t('activityDetail.segments.hide') : t('activityDetail.segments.show')}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`ml-1 transition-transform ${isSegmentsExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </Button>
              </div>
            </CardHeader>
            {isSegmentsExpanded && (
              <CardContent className="space-y-3">
                {segmentsLoading ? (
                  <div className="text-xs text-muted-foreground">{t('activityDetail.segments.loading')}</div>
                ) : segmentEfforts.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {t('activityDetail.segments.empty')}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {segmentsToShow.map((segment) => {
                        const isDisabled = segment.start_index === null
                          || segment.end_index === null
                          || segment.start_index === undefined
                          || segment.end_index === undefined
                        const isActive = segment.effort_id === selectedSegmentEffortId
                        const isPr = segment.is_pr === true
                        const climbCategoryLabel = formatClimbCategory(segment.climb_category, {
                          source: segment.segment_source,
                          isAutoClimb: segment.segment_is_auto_climb,
                        })

                        return (
                          <div
                            key={segment.effort_id}
                            className={`flex items-start gap-3 border-b border-border/40 pb-2 last:border-b-0 last:pb-0 transition-colors ${
                              isActive
                                ? (isPr ? 'bg-yellow-500/15 ring-1 ring-yellow-400/40' : 'bg-yellow-500/10')
                                : 'hover:bg-secondary/30'
                            } ${isDisabled ? 'opacity-60' : ''}`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSegmentHighlight(segment)}
                              disabled={isDisabled}
                              className={`flex-1 text-left flex items-start justify-between gap-3 ${isDisabled ? 'cursor-not-allowed' : ''}`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">
                                    {segment.segment_name || segment.effort_name || t('activityDetail.segments.segmentFallback')}
                                  </span>
                                  {isPr && (
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0.5 ${isActive ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-500 font-semibold' : 'border-yellow-500/40 text-yellow-500'}`}
                                    >
                                      PR
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {segment.segment_distance ? formatDistance(Number(segment.segment_distance)) : notAvailable}
                                  {segment.average_grade !== null && segment.average_grade !== undefined
                                    ? ` · ${Number(segment.average_grade).toFixed(1)}%`
                                    : ''}
                                  {climbCategoryLabel ? ` · ${climbCategoryLabel}` : ''}
                                  {segment.city ? ` · ${segment.city}` : ''}
                                </div>
                                {isActive && (
                                  <div className={`text-[10px] mt-1 ${isPr ? 'text-yellow-500 font-semibold' : 'text-yellow-500/80'}`}>
                                    {isPr ? t('activityDetail.segments.prHighlighted') : t('activityDetail.segments.highlighted')}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold">
                                  {formatSegmentDuration(segment.elapsed_time ?? null, notAvailable)}
                                </div>
                                {(segment.average_watts || segment.average_heartrate) && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {segment.average_watts ? `${Math.round(Number(segment.average_watts))} ${unitWatt}` : ''}
                                    {segment.average_heartrate
                                      ? `${segment.average_watts ? ' · ' : ''}${Math.round(Number(segment.average_heartrate))} ${unitBpm}`
                                      : ''}
                                  </div>
                                )}
                              </div>
                            </button>
                            <Link
                              to={`/segment/${segment.segment_id}`}
                              className="shrink-0 text-[11px] text-muted-foreground hover:text-primary transition-colors pt-0.5"
                            >
                              {t('activityDetail.segments.details')}
                            </Link>
                          </div>
                        )
                      })}
                    </div>
                    {segmentsRemaining > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        {t('activityDetail.segments.more', { count: segmentsRemaining })}
                      </div>
                    )}

                    {selectedSegment && liveSelectionIndices && (hasMap || hasElevation) && (
                      <div ref={segmentPreviewRef} className="rounded-md border border-border/60 p-3">
                        <div className="mb-1 text-sm font-medium">
                          {t('activityDetail.segments.preview.title', {
                            name: selectedSegment.segment_name || selectedSegment.effort_name || t('activityDetail.segments.segmentFallback'),
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          {t('activityDetail.segments.preview.subtitle')}
                        </p>
                        <div className={`grid gap-3 ${hasMap && hasElevation ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                          {hasMap && activity?.streams?.latlng && (
                            <div className="h-[220px] rounded-md overflow-hidden border border-border/60">
                              <ActivityMap
                                coordinates={activity.streams.latlng}
                                showMarkers={false}
                                hoverPosition={null}
                                highlightRange={liveSelectionIndices}
                                showHighlightMarkers={true}
                                focusHighlight={true}
                                highlightStyle={selectedIsPr ? { color: '#fbbf24', weight: 7, opacity: 0.95 } : undefined}
                              />
                            </div>
                          )}
                          {hasElevation && (
                            <div className="h-[220px] rounded-md border border-border/60 p-2">
                              {segmentPreviewData && segmentPreviewData.length > 1 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={segmentPreviewData}>
                                    <defs>
                                      <linearGradient id="segmentPreviewGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#fc4c02" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#fc4c02" stopOpacity={0} />
                                      </linearGradient>
                                    </defs>
                                    <XAxis
                                      dataKey="distance"
                                      type="number"
                                      domain={['dataMin', 'dataMax']}
                                      stroke={chartColors.text}
                                      fontSize={10}
                                      tickFormatter={(v) => `${v.toFixed(1)}`}
                                      axisLine={false}
                                      tickLine={false}
                                    />
                                    <YAxis
                                      stroke={chartColors.text}
                                      fontSize={10}
                                      tickFormatter={(v) => `${v.toFixed(0)}${unitMeters}`}
                                      width={44}
                                      axisLine={false}
                                      tickLine={false}
                                    />
                                    <Tooltip
                                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(0)} ${unitMeters}`, t('activityDetail.charts.tooltip.elevation')] : [notAvailable, t('activityDetail.charts.tooltip.elevation')]}
                                      labelFormatter={(label: number) => `${label.toFixed(2)} ${unitKm}`}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="altitude"
                                      stroke="#fc4c02"
                                      strokeWidth={1.5}
                                      fill="url(#segmentPreviewGradient)"
                                      isAnimationActive={false}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                  {t('activityDetail.segments.preview.elevationEmpty')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            )}
          </Card>

          {/* Elevation Profile - Compact */}
          {hasElevation && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m8 3 4 8 5-5 5 15H2L8 3z"/>
                  </svg>
                  {t('activityDetail.charts.elevationProfile')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-2">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart
                    data={elevationData}
                    onMouseLeave={handleChartLeave}
                    onMouseDown={handleElevationStart}
                    onMouseMove={handleChartMove}
                    onMouseUp={handleAnalysisEnd}
                  >
                    <defs>
                      <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fc4c02" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#fc4c02" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="distance"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v.toFixed(0)}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v}${unitMeters}`}
                      width={40}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(0)} ${unitMeters}`, t('activityDetail.charts.tooltip.elevation')] : [notAvailable, t('activityDetail.charts.tooltip.elevation')]}
                      labelFormatter={(label: number) => `${label.toFixed(1)} ${unitKm}`}
                    />
                    {liveRange.hasRange && liveRange.startKm !== null && liveRange.endKm !== null && (
                      <ReferenceArea
                        x1={liveRange.startKm}
                        x2={liveRange.endKm}
                        strokeOpacity={0}
                        fill={selectionFillStrong}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="altitude"
                      stroke="#fc4c02"
                      strokeWidth={1.5}
                      fill="url(#elevationGradient)"
                      isAnimationActive={false}
                    />
                    {/* Show reference dot at hover position */}
                    {hoverDistanceKm !== null && hoverAltitude !== null && (
                      <ReferenceDot
                        x={hoverDistanceKm}
                        y={hoverAltitude}
                        r={6}
                        fill="#06b6d4"
                        stroke="white"
                        strokeWidth={2}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-3 border-t border-border/60 pt-3">
                  {elevationSelection && analysisStats ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-muted-foreground">
                          {t('activityDetail.charts.analysisRange', {
                            start: elevationRange.startKm !== null ? elevationRange.startKm.toFixed(2) : notAvailable,
                            end: elevationRange.endKm !== null ? elevationRange.endKm.toFixed(2) : notAvailable,
                          })}
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleCreateManualSegment}
                            disabled={!canCreateManualSegment || createManualSegmentMutation.isPending}
                            className="h-7 px-2 text-[11px]"
                          >
                            {createManualSegmentMutation.isPending
                              ? t('activityDetail.segments.manual.creating')
                              : t('activityDetail.segments.manual.button')}
                          </Button>
                          <button
                            type="button"
                            onClick={clearAnalysis}
                            className="text-[10px] text-muted-foreground hover:text-primary"
                          >
                            {t('common.reset')}
                          </button>
                        </div>
                      </div>
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{t('activityDetail.segments.manual.hint')}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => nudgeManualSegmentBoundary('start', -1)}
                          disabled={!canCreateManualSegment || createManualSegmentMutation.isPending}
                        >
                          {t('activityDetail.segments.manual.adjustStartBack')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => nudgeManualSegmentBoundary('start', 1)}
                          disabled={!canCreateManualSegment || createManualSegmentMutation.isPending}
                        >
                          {t('activityDetail.segments.manual.adjustStartForward')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => nudgeManualSegmentBoundary('end', -1)}
                          disabled={!canCreateManualSegment || createManualSegmentMutation.isPending}
                        >
                          {t('activityDetail.segments.manual.adjustEndBack')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => nudgeManualSegmentBoundary('end', 1)}
                          disabled={!canCreateManualSegment || createManualSegmentMutation.isPending}
                        >
                          {t('activityDetail.segments.manual.adjustEndForward')}
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-muted-foreground">{t('activityDetail.stats.distance')}</div>
                          <div className="font-semibold">{formatDistance(analysisStats.distanceKm * 1000)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{t('activityDetail.stats.time')}</div>
                          <div className="font-semibold">{formatDuration(analysisStats.durationSec)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">{isRun ? t('activityDetail.stats.pace') : t('activityDetail.stats.speed')}</div>
                          <div className="font-semibold">
                            {isRun
                              ? (analysisStats.avgPace || notAvailable)
                              : (analysisStats.avgSpeedKmh > 0 ? `${analysisStats.avgSpeedKmh.toFixed(1)} ${unitKmh}` : notAvailable)}
                          </div>
                        </div>
                        {analysisStats.elevationGain !== null && (
                          <div>
                            <div className="text-muted-foreground">{t('activityDetail.stats.elevationGain')}</div>
                            <div className="font-semibold">{formatElevation(analysisStats.elevationGain)}</div>
                          </div>
                        )}
                        {analysisStats.avgHr !== null && (
                          <div>
                            <div className="text-muted-foreground">{t('activityDetail.stats.avgHr')}</div>
                            <div className="font-semibold">{analysisStats.avgHr} {unitBpm}</div>
                          </div>
                        )}
                        {analysisStats.avgPower !== null && (
                          <div>
                            <div className="text-muted-foreground">{t('activityDetail.stats.avgPower')}</div>
                            <div className="font-semibold">{analysisStats.avgPower} {unitWatt}</div>
                          </div>
                        )}
                        {analysisStats.avgCadence !== null && (
                          <div>
                            <div className="text-muted-foreground">{t('activityDetail.stats.avgCadence')}</div>
                            <div className="font-semibold">{analysisStats.avgCadence} {unitRpm}</div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t('activityDetail.charts.selectRange')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Speed Profile */}
          {speedStream && speedStream.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 17h2l-1 4h-1v-4z"/>
                    <path d="M2 17h2l-1 4H2v-4z"/>
                    <path d="M7 16h10l1 5H6l1-5z"/>
                    <path d="M5 9h14l1 4H4l1-4z"/>
                    <path d="M8 9V5a4 4 0 0 1 8 0v4"/>
                  </svg>
                  {t('activityDetail.charts.speed')}
                </CardTitle>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">{formatHoverValue(cursorStats?.speedKmh, unitKmh, 1, notAvailable)}</div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart
                    data={speedChartData.map(point => ({ distance: point.distance, speed: point.value }))}
                    onMouseLeave={handleChartLeave}
                    onMouseDown={(state) => handleAnalysisStart(state, 'speed')}
                    onMouseMove={handleChartMove}
                    onMouseUp={handleAnalysisEnd}
                  >
                    <defs>
                      <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="distance"
                      type="number"
                      domain={selectionDomain}
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v.toFixed(0)}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v}${unitKmh}`}
                      width={48}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(1)} ${unitKmh}`, t('activityDetail.charts.tooltip.speed')] : [notAvailable, t('activityDetail.charts.tooltip.speed')]}
                      labelFormatter={(label: number) => `${label.toFixed(1)} ${unitKm}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="speed"
                      stroke="#14b8a6"
                      strokeWidth={1.5}
                      fill="url(#speedGradient)"
                      isAnimationActive={false}
                    />
                    {speedOverlay.hasRange && speedOverlay.startKm !== null && speedOverlay.endKm !== null && (
                      <ReferenceArea
                        x1={speedOverlay.startKm}
                        x2={speedOverlay.endKm}
                        strokeOpacity={0}
                        fill={selectionFill}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Heart Rate Profile */}
          {activity.streams?.heartrate && activity.streams.heartrate.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  </svg>
                  {t('activityDetail.charts.heartRate')}
                </CardTitle>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">{formatHoverValue(cursorStats?.heartrate, unitBpm, 0, notAvailable)}</div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart
                    data={heartRateChartData.map(point => ({ distance: point.distance, heartrate: point.value }))}
                    onMouseLeave={handleChartLeave}
                    onMouseDown={(state) => handleAnalysisStart(state, 'heartrate')}
                    onMouseMove={handleChartMove}
                    onMouseUp={handleAnalysisEnd}
                  >
                    <defs>
                      <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="distance"
                      type="number"
                      domain={selectionDomain}
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v.toFixed(0)}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v}${unitBpm}`}
                      width={40}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(0)} ${unitBpm}`, t('activityDetail.charts.tooltip.hr')] : [notAvailable, t('activityDetail.charts.tooltip.hr')]}
                      labelFormatter={(label: number) => `${label.toFixed(1)} ${unitKm}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="heartrate"
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      fill="url(#hrGradient)"
                      isAnimationActive={false}
                    />
                    {heartRateOverlay.hasRange && heartRateOverlay.startKm !== null && heartRateOverlay.endKm !== null && (
                      <ReferenceArea
                        x1={heartRateOverlay.startKm}
                        x2={heartRateOverlay.endKm}
                        strokeOpacity={0}
                        fill={selectionFill}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Power Profile */}
          {hasPower && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  {t('activityDetail.charts.power')}
                </CardTitle>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">{formatHoverValue(cursorStats?.power, unitWatt, 0, notAvailable)}</div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart
                    data={powerChartData.map(point => ({ distance: point.distance, watts: point.value }))}
                    onMouseLeave={handleChartLeave}
                    onMouseDown={(state) => handleAnalysisStart(state, 'power')}
                    onMouseMove={handleChartMove}
                    onMouseUp={handleAnalysisEnd}
                  >
                    <defs>
                      <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="distance"
                      type="number"
                      domain={selectionDomain}
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v.toFixed(0)}`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke={chartColors.text}
                      fontSize={10}
                      tickFormatter={(v) => `${v}${unitWatt}`}
                      width={40}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(0)} ${unitWatt}`, t('activityDetail.charts.tooltip.power')] : [notAvailable, t('activityDetail.charts.tooltip.power')]}
                      labelFormatter={(label: number) => `${label.toFixed(1)} ${unitKm}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="watts"
                      stroke="#eab308"
                      strokeWidth={1.5}
                      fill="url(#powerGradient)"
                      isAnimationActive={false}
                    />
                    {powerOverlay.hasRange && powerOverlay.startKm !== null && powerOverlay.endKm !== null && (
                      <ReferenceArea
                        x1={powerOverlay.startKm}
                        x2={powerOverlay.endKm}
                        strokeOpacity={0}
                        fill={selectionFill}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Cadence Profile */}
          {activity.streams?.cadence && activity.streams.cadence.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {t('activityDetail.charts.cadence')}
                </CardTitle>
                <div className="text-right text-xs text-muted-foreground">
                  <div className="text-sm font-semibold text-foreground">{formatHoverValue(cursorStats?.cadence, unitRpm, 0, notAvailable)}</div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart
                    data={cadenceChartData.map(point => ({ distance: point.distance, cadence: point.value }))}
                    onMouseLeave={handleChartLeave}
                    onMouseDown={(state) => handleAnalysisStart(state, 'cadence')}
                    onMouseMove={handleChartMove}
                    onMouseUp={handleAnalysisEnd}
                    margin={{ top: 5, right: 5, bottom: 20, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="cadenceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light').grid} />
                    <XAxis
                      dataKey="distance"
                      type="number"
                      domain={selectionDomain}
                      stroke={getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light').axis}
                      tick={{ fill: getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light').axis, fontSize: 11 }}
                      tickFormatter={(val) => `${val.toFixed(0)}`}
                      label={{ value: t('activityDetail.charts.distanceAxis'), position: 'insideBottom', offset: -15, fill: getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light').axis }}
                    />
                    <YAxis
                      stroke={getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light').axis}
                      tick={{ fill: getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light').axis, fontSize: 11 }}
                      domain={['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      formatter={(value: number | undefined) => value !== undefined ? [`${value.toFixed(0)} ${unitRpm}`, t('activityDetail.charts.tooltip.cadence')] : [notAvailable, t('activityDetail.charts.tooltip.cadence')]}
                      labelFormatter={(label: number) => `${label.toFixed(1)} ${unitKm}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="cadence"
                      stroke="#ec4899"
                      strokeWidth={1.5}
                      fill="url(#cadenceGradient)"
                      isAnimationActive={false}
                    />
                    {cadenceOverlay.hasRange && cadenceOverlay.startKm !== null && cadenceOverlay.endKm !== null && (
                      <ReferenceArea
                        x1={cadenceOverlay.startKm}
                        x2={cadenceOverlay.endKm}
                        strokeOpacity={0}
                        fill={selectionFill}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Km Splits for running activities */}
          {isRun && kmSplits && kmSplits.splits.length > 0 && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                    {t('activityDetail.splits.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">{t('activityDetail.splits.columns.km')}</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">{t('activityDetail.splits.columns.pace')}</th>
                          <th className="text-right py-2 px-2 text-muted-foreground font-medium">{t('activityDetail.splits.columns.time')}</th>
                          {kmSplits.splits.some(s => s.avgHr) && (
                            <th className="text-right py-2 px-2 text-muted-foreground font-medium">{t('activityDetail.splits.columns.avgHr')}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {kmSplits.splits.map((split, idx) => {
                          // Find best (fastest) pace for highlighting
                          const paces = kmSplits.splits
                            .filter(s => Number.isInteger(s.km)) // Only full km for fair comparison
                            .map(s => {
                              const [min, sec] = s.pace.split(':').map(Number)
                              return min * 60 + sec
                            })
                          const bestPaceSeconds = Math.min(...paces)
                          const [splitMin, splitSec] = split.pace.split(':').map(Number)
                          const splitPaceSeconds = splitMin * 60 + splitSec
                          const isBest = Number.isInteger(split.km) && splitPaceSeconds === bestPaceSeconds

                          return (
                            <tr key={idx} className={`border-b border-border/50 ${isBest ? 'bg-primary/10' : ''}`}>
                              <td className="py-2 px-2 font-medium">
                                {Number.isInteger(split.km) ? split.km : split.km.toFixed(2)}
                              </td>
                              <td className={`text-right py-2 px-2 font-semibold ${isBest ? 'text-primary' : ''}`}>
                                {split.pace}
                              </td>
                              <td className="text-right py-2 px-2 text-muted-foreground">
                                {formatDuration(split.time)}
                              </td>
                              {kmSplits.splits.some(s => s.avgHr) && (
                                <td className="text-right py-2 px-2 text-muted-foreground">
                                  {split.avgHr ? `${split.avgHr} ${unitBpm}` : notAvailable}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Pace Development Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    {t('activityDetail.splits.paceDevelopment')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart
                      data={kmSplits.splits.map(split => {
                        const [min, sec] = split.pace.split(':').map(Number)
                        return {
                          km: Number.isInteger(split.km) ? split.km : split.km.toFixed(1),
                          paceSeconds: min * 60 + sec,
                          pace: split.pace,
                          avgHr: split.avgHr
                        }
                      })}
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="paceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis
                        dataKey="km"
                        stroke={chartColors.text}
                        style={{ fontSize: '12px' }}
                        label={{ value: t('activityDetail.splits.kilometerAxis'), position: 'insideBottom', offset: -5, fill: chartColors.text }}
                      />
                      <YAxis
                        stroke={chartColors.text}
                        style={{ fontSize: '12px' }}
                        reversed
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => {
                          const minutes = Math.floor(value / 60)
                          const seconds = Math.round(value % 60)
                          return `${minutes}:${seconds.toString().padStart(2, '0')}`
                        }}
                        label={{ value: t('activityDetail.splits.paceAxis'), angle: -90, position: 'insideLeft', fill: chartColors.text }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px'
                        }}
                        formatter={(value: any, name?: string) => {
                          if (name === 'paceSeconds') {
                            const minutes = Math.floor(value / 60)
                            const seconds = Math.round(value % 60)
                            return [`${minutes}:${seconds.toString().padStart(2, '0')} ${unitMinPerKm}`, t('activityDetail.charts.tooltip.pace')]
                          }
                          if (name === 'avgHr') {
                            return [`${value} ${unitBpm}`, t('activityDetail.charts.tooltip.avgHr')]
                          }
                          return [value, name]
                        }}
                        labelFormatter={(label) => t('activityDetail.splits.kmLabel', { value: label })}
                      />
                      <Area
                        type="monotone"
                        dataKey="paceSeconds"
                        stroke={colors.primary}
                        strokeWidth={2}
                        fill="url(#paceGradient)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Right Sidebar - Power Data */}
        <div className="lg:col-span-1 space-y-4">
          {/* Trainingsreiz */}
          <Card className={trainingStimulusCardClass}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
                </svg>
                {t('activityDetail.trainingStimulus.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {trainingStimulus.state === 'ok' ? (
                <div className="space-y-2">
                  <div className={`text-sm font-semibold ${trainingStimulus.levelClass}`}>
                    {trainingStimulus.level}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {trainingStimulus.durationLabel} · {trainingStimulus.intensityLabel}
                  </div>
                  {trainingStimulus.insights.state === 'ok' && (
                    <div className="flex flex-wrap gap-1.5">
                      {trainingStimulus.insights.zone && (
                        <Badge variant="outline" className={trainingStimulus.insights.zone.className}>
                          {trainingStimulus.insights.zone.label}
                        </Badge>
                      )}
                      {trainingStimulus.insights.impact && (
                        <Badge variant="outline" className={trainingStimulus.insights.impact.className}>
                          {trainingStimulus.insights.impact.label}
                        </Badge>
                      )}
                      {trainingStimulus.insights.relativeImpact && (
                        <Badge variant="outline" className={trainingStimulus.insights.relativeImpact.className}>
                          {trainingStimulus.insights.relativeImpact.label}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('activityDetail.trainingStimulus.metrics.if')}</div>
                      <div className="font-semibold">{trainingStimulus.intensityFactor.toFixed(2)}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('activityDetail.trainingStimulus.metrics.tss')}</div>
                      <div className="font-semibold">{trainingStimulus.tss.toFixed(0)}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('activityDetail.trainingStimulus.metrics.np')}</div>
                      <div className="font-semibold">{trainingStimulus.normalizedPower ? `${trainingStimulus.normalizedPower} ${unitWatt}` : notAvailable}</div>
                    </div>
                    <div className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('activityDetail.trainingStimulus.duration')}</div>
                      <div className="font-semibold">{trainingStimulus.durationLabel}</div>
                    </div>
                  </div>
                  {trainingStimulus.insights.pmcDeltaSummary && (
                    <div className="text-[11px] text-muted-foreground">
                      {t('activityDetail.trainingStimulus.dailyImpact', { value: trainingStimulus.insights.pmcDeltaSummary })}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    {t('activityDetail.trainingStimulus.basedOn')}
                  </div>
                </div>
              ) : (
                <div className="py-2 text-xs text-muted-foreground">
                  {trainingStimulus.message}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Best Stats Dropdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <select
                  value={bestStatsType}
                  onChange={(event) => setBestStatsType(event.target.value as BestStatsType)}
                  className="px-2 py-1 text-xs border border-border rounded-md bg-background"
                  style={{ color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--popover))' }}
                >
                  {bestStatsOptions.map((option) => (
                    <option key={option.id} value={option.id} style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {bestStatsData[bestStatsType].rows.length > 0 ? (
                <div className="divide-y divide-border">
                  {bestStatsData[bestStatsType].rows.map((row, index) => (
                    <div key={`${bestStatsType}-${index}`} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium text-primary">{row.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {bestStatsData[bestStatsType].emptyMessage}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Heart Rate Summary */}
          {activity.average_heartrate && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  </svg>
                  {t('activityDetail.charts.heartRate')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t('activityDetail.stats.average')}</span>
                    <span className="font-medium">{Math.round(safeNumber(activity.average_heartrate))} {unitBpm}</span>
                  </div>
                  {activity.max_heartrate && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('activityDetail.stats.max')}</span>
                      <span className="font-medium text-red-500">{Math.round(safeNumber(activity.max_heartrate))} {unitBpm}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Power Zones */}
          {hasPower && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  {t('activityDetail.powerZones.title')}
                </CardTitle>
                {powerZones.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {formatDuration(powerZoneTotal)}
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {powerZones.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <div className="relative h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={powerZones}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={46}
                            outerRadius={72}
                            paddingAngle={1}
                            cornerRadius={4}
                            stroke="hsl(var(--background))"
                            strokeWidth={2}
                            onMouseEnter={(_, index) => setActivePowerIndex(index)}
                            onMouseLeave={() => setActivePowerIndex(null)}
                          >
                            {powerZones.map((zone, index) => (
                              <Cell
                                key={`power-zone-${zone.zone}`}
                                fill={zone.color}
                                opacity={activePowerIndex === null || activePowerIndex === index ? 1 : 0.45}
                                stroke={activePowerIndex === index ? 'hsl(var(--foreground))' : 'hsl(var(--background))'}
                                strokeWidth={activePowerIndex === index ? 2.5 : 1}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null
                              const zone = payload[0].payload
                              return (
                                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
                                  <div className="font-semibold">{`Z${zone.zone} ${zone.name}`}</div>
                                  <div className="text-muted-foreground">{`${formatDuration(zone.value)} - ${zone.percent}%`}</div>
                                </div>
                              )
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        {activePowerIndex !== null && powerZones[activePowerIndex] ? (
                          <>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{`Z${powerZones[activePowerIndex].zone}`}</div>
                            <div className="text-xs font-semibold text-foreground">{powerZones[activePowerIndex].name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {`${formatDuration(powerZones[activePowerIndex].value)} - ${powerZones[activePowerIndex].percent}%`}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('activityDetail.powerZones.total')}</div>
                            <div className="text-sm font-semibold text-foreground">{formatDuration(powerZoneTotal)}</div>
                            <div className="text-[11px] text-muted-foreground">{t('activityDetail.powerZones.subtitle')}</div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {powerZones.map((zone, index) => {
                        const isActive = activePowerIndex === index
                        return (
                          <div key={zone.zone} className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                            <span className="w-6 font-medium">Z{zone.zone}</span>
                            <span className={`flex-1 ${isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{zone.name}</span>
                            <span className={isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{zone.percent}%</span>
                            <span className={isActive ? 'font-semibold text-foreground' : 'font-medium'}>{formatDuration(zone.value)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {t('activityDetail.powerZones.noFtp')}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Heart Rate Ranges */}
          {heartRateRanges.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  </svg>
                  {t('activityDetail.heartRateRanges.title')}
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  {formatDuration(heartRateRangeTotal)}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {heartRateRanges.map((range) => (
                    <div key={range.label} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: range.color }} />
                      <span className="w-16 font-medium">{range.label} {unitBpm}</span>
                      <span className="flex-1 text-muted-foreground">{range.percent}%</span>
                      <span className="font-medium">{formatDuration(range.value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cadence Summary */}
          {activity.average_cadence && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {t('activityDetail.charts.cadence')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">{t('activityDetail.stats.average')}</span>
                    <span className="font-medium">{Math.round(safeNumber(activity.average_cadence))} {unitRpm}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gear Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                {t('activityDetail.gear.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {gearList.length > 0 ? (
                <>
                  <select
                    value={activityGearId}
                    onChange={(event) => setActivityGearId(event.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-background border border-border text-foreground text-sm"
                    style={{ color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--popover))' }}
                  >
                    <option value="" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>
                      {t('activityDetail.gear.unassigned')}
                    </option>
                    {gearList.map((gear) => (
                      <option
                        key={gear.id}
                        value={gear.id}
                        style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}
                      >
                        {gear.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={updateGearMutation.isPending || activityGearId === (activity.gear_id || '')}
                    onClick={() => updateGearMutation.mutate(activityGearId || null)}
                  >
                    {updateGearMutation.isPending
                      ? t('activityDetail.gear.saving')
                      : t('activityDetail.gear.assign')}
                  </Button>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t('activityDetail.gear.noGear')}
                </div>
              )}
              <Link to="/gear" className="text-sm text-primary hover:underline">
                {t('activityDetail.gear.details')}
              </Link>
            </CardContent>
          </Card>

          {/* No power data message */}
          {!hasPower && (
            <Card>
              <CardContent className="py-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-muted-foreground opacity-50">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <p className="text-xs text-muted-foreground">{t('activityDetail.power.noData')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
