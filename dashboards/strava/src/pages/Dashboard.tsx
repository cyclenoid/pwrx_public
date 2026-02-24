import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bike, Footprints, Activity, RefreshCw, LayoutGrid, List, ChevronLeft, ChevronRight, Award, Globe, Clock, Mountain } from 'lucide-react'
import {
  getActivities,
  getActivity,
  getWeekStreak,
  getCalendarData,
  getSettings,
  updateSetting,
  getYearStats,
  getFTP,
  getBulkPowerMetrics,
  getGear,
  getSyncLogs,
  triggerFullSync,
  type ActivityWithRoute
} from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatNumber, formatCompactNumber, formatDurationFromSeconds, formatSpeed, formatPace } from '../lib/formatters'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, startOfWeek, subWeeks, getWeek } from 'date-fns'
import { useToast } from '../hooks/useToast'
import { Toaster } from '../components/ui/toast'
import { useTranslation } from 'react-i18next'
import { useCapabilities } from '../hooks/useCapabilities'

// Components
import { ActivityCard, ActivityCardSkeleton } from '../components/activities/ActivityCard'
import { ActivityFiltersBar, defaultFilters, type ActivityFilters } from '../components/activities/ActivityFilters'
import { Badge, ActivityBadge } from '../components/ui/badge'
import { NoActivitiesFound } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { getTrainingInsights } from '../lib/trainingInsights'

type ViewMode = 'cards' | 'table'

const ITEMS_PER_PAGE = 50

// Cycling quotes
const CYCLING_QUOTES = {
  en: [
    { text: 'Cycling is like boxing: a hard, relentless sport. You can play football—cycling you cannot.', author: 'Jean de Gribaldy' },
    { text: 'It never gets easier—you just go faster.', author: 'Greg LeMond' },
    { text: 'When it hurts, that is when you attack harder.', author: 'Jens Voigt' },
    { text: 'You win races with your legs. You win championships with your mind.', author: 'Eddy Merckx' },
    { text: 'Nothing is impossible. Pain is temporary.', author: 'Lance Armstrong' },
    { text: 'Ride as much or as little, as long or as short as you feel. But ride.', author: 'Eddy Merckx' },
    { text: 'The bicycle is a good vehicle: it respects the environment and makes you happy.', author: 'Hugh Obree' },
    { text: 'If you can still talk, you are not riding hard enough.', author: 'Training saying' },
    { text: 'Most people give up just when they are about to succeed.', author: 'Chris Boardman' },
    { text: 'The mountains do not lie.', author: 'Cycling wisdom' },
    { text: 'Cycling is suffering. Otherwise it would just be transport.', author: 'Fausto Coppi' },
    { text: 'If you think adventure is dangerous, try routine—it is lethal.', author: 'Paulo Coelho' },
    { text: 'Get a bicycle. You will not regret it if you live.', author: 'Mark Twain' },
    { text: 'The bicycle has done more for women’s emancipation than anything else.', author: 'Susan B. Anthony' },
    { text: 'Give me a bicycle and I will show you who I am.', author: 'Mario Cipollini' },
    { text: 'Cycling is the answer—whatever the question.', author: 'Unknown' },
    { text: 'You do not suffer—you get better.', author: 'Training saying' },
    { text: 'A good day on the bike beats a good day doing almost anything else.', author: 'Unknown' },
    { text: 'Life is like riding a bicycle. To keep your balance, you must keep moving.', author: 'Albert Einstein' },
    { text: 'If you are not willing to suffer, you will not know how good you can be.', author: 'Bjarne Riis' },
  ],
  de: [
    { text: 'Radfahren ist wie Boxen: ein harter, unerbittlicher Sport. Fußball spielt man – Radfahren nicht.', author: 'Jean de Gribaldy' },
    { text: 'Es wird nie leichter – du wirst nur schneller.', author: 'Greg LeMond' },
    { text: 'Wenn es weh tut, dann greifst du einfach noch härter an.', author: 'Jens Voigt' },
    { text: 'Rennen gewinnt man mit den Beinen. Meisterschaften gewinnt man mit dem Kopf.', author: 'Eddy Merckx' },
    { text: 'Nichts ist unmöglich. Schmerz ist nur vorübergehend.', author: 'Lance Armstrong' },
    { text: 'Fahre so viel oder so wenig, so lange oder so kurz, wie du willst. Aber fahr.', author: 'Eddy Merckx' },
    { text: 'Das Fahrrad ist ein gutes Fahrzeug: Es schont die Umwelt und macht glücklich.', author: 'Hugh Obree' },
    { text: 'Wenn du noch reden kannst, fährst du nicht hart genug.', author: 'Trainingsspruch' },
    { text: 'Die meisten Leute geben auf, wenn sie kurz davor sind, es zu schaffen.', author: 'Chris Boardman' },
    { text: 'Die Berge lügen nicht.', author: 'Radsport-Weisheit' },
    { text: 'Radfahren ist Leiden. Sonst wäre es ja nur Fortbewegung.', author: 'Fausto Coppi' },
    { text: "Wenn du denkst, Abenteuer seien gefährlich, versuch's mal mit Routine – die ist tödlich.", author: 'Paulo Coelho' },
    { text: 'Kauf dir ein Fahrrad. Wenn du lebst, wirst du es nicht bereuen.', author: 'Mark Twain' },
    { text: 'Das Fahrrad hat mehr für die Emanzipation der Frau getan als irgendetwas anderes.', author: 'Susan B. Anthony' },
    { text: 'Gib mir ein Fahrrad und ich zeige dir, wer ich bin.', author: 'Mario Cipollini' },
    { text: 'Radfahren ist die Antwort. Egal, wie die Frage lautet.', author: 'Unbekannt' },
    { text: 'Du leidest nicht – du wirst besser.', author: 'Trainingsspruch' },
    { text: 'Ein guter Tag auf dem Rad schlägt einen guten Tag in fast allem anderen.', author: 'Unbekannt' },
    { text: 'Das Leben ist wie Fahrradfahren: Um die Balance zu halten, musst du in Bewegung bleiben.', author: 'Albert Einstein' },
    { text: 'Wenn du nicht bereit bist zu leiden, wirst du nicht wissen, wie gut du sein kannst.', author: 'Bjarne Riis' },
  ],
}

export function Dashboard() {
  const { t, i18n } = useTranslation()
  const { capabilities } = useCapabilities()
  const queryClient = useQueryClient()
  const { toast, toasts, dismiss } = useToast()
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [filters, setFilters] = useState<ActivityFilters>(defaultFilters)
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE)
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [goalMode, setGoalMode] = useState<'ride' | 'run'>('ride')

  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const quoteLocale = i18n.language?.startsWith('de') ? 'de' : 'en'
  const unitKm = t('records.units.km')
  const unitMeters = t('records.units.m')
  const unitHours = t('dashboard.units.hoursShort')
  const supportsSync = capabilities.supportsSync
  const currentYear = new Date().getFullYear()

  const formatMonthYear = (date: Date) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { month: 'long', year: 'numeric' }).format(date)
    } catch {
      return date.toLocaleDateString()
    }
  }

  const formatWeekdayShort = (date: Date) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(date)
    } catch {
      return date.toLocaleDateString()
    }
  }

  // Random quote - pick one on mount and keep it stable
  const randomQuote = useMemo(() => {
    const quotes = CYCLING_QUOTES[quoteLocale] ?? CYCLING_QUOTES.en
    const seed = quoteLocale.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) + currentYear
    const index = seed % quotes.length
    return quotes[index]
  }, [quoteLocale, currentYear])
  const calendarYear = calendarDate.getFullYear()
  const calendarMonth = calendarDate.getMonth() + 1

  // Data queries
  const { data: yearStats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['yearStats', currentYear],
    queryFn: () => getYearStats(currentYear),
    staleTime: 5 * 60 * 1000,
  })

  const { data: ftpData } = useQuery({
    queryKey: ['ftp'],
    queryFn: getFTP,
    staleTime: 5 * 60 * 1000,
  })

  const { data: activities, isLoading: activitiesLoading, isError: activitiesError, refetch: refetchActivities } = useQuery({
    queryKey: ['activities', 'all-metadata'],
    queryFn: () => getActivities({ limit: 10000, include_route: false }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: weekStreak } = useQuery({
    queryKey: ['week-streak'],
    queryFn: getWeekStreak,
    staleTime: 5 * 60 * 1000,
  })

  const { data: gearList } = useQuery({
    queryKey: ['gear'],
    queryFn: getGear,
    staleTime: 5 * 60 * 1000,
  })

  const { data: calendar } = useQuery({
    queryKey: ['calendar', calendarYear, calendarMonth],
    queryFn: () => getCalendarData(calendarYear, calendarMonth),
    staleTime: 5 * 60 * 1000, // 5 minutes - data doesn't change often
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes for instant navigation
  })

  // Prefetch adjacent months for instant navigation
  useEffect(() => {
    const prefetchPrevMonth = () => {
      const d = new Date(calendarYear, calendarMonth - 2) // month is 1-indexed
      queryClient.prefetchQuery({
        queryKey: ['calendar', d.getFullYear(), d.getMonth() + 1],
        queryFn: () => getCalendarData(d.getFullYear(), d.getMonth() + 1),
        staleTime: 5 * 60 * 1000,
      })
    }
    const prefetchNextMonth = () => {
      const d = new Date(calendarYear, calendarMonth) // month is 1-indexed
      queryClient.prefetchQuery({
        queryKey: ['calendar', d.getFullYear(), d.getMonth() + 1],
        queryFn: () => getCalendarData(d.getFullYear(), d.getMonth() + 1),
        staleTime: 5 * 60 * 1000,
      })
    }

    // Small delay to avoid blocking initial render
    const timer = setTimeout(() => {
      prefetchPrevMonth()
      prefetchNextMonth()
    }, 100)

    return () => clearTimeout(timer)
  }, [calendarYear, calendarMonth, queryClient])

  const goToPrevMonth = () => {
    setCalendarDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  const goToNextMonth = () => {
    setCalendarDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const goToToday = () => setCalendarDate(new Date())

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })
  const dismissFirstRunMutation = useMutation({
    mutationFn: () => updateSetting('onboarding_first_steps_dismissed', 'true'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const { data: syncLogsData } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: () => getSyncLogs(5),
    staleTime: 30 * 1000,
    refetchInterval: 30000,
    enabled: supportsSync,
  })
  const syncLogs = syncLogsData?.logs || []
  const isSyncRunning = syncLogs.some((log) => log.status === 'running')
  const showInitialSyncHint = isSyncRunning && !activitiesLoading && (activities?.length ?? 0) === 0
  const hasAnyActivities = (activities?.length ?? 0) > 0
  const profileBasicsConfirmed = String(settings?.onboarding_profile_basics_confirmed || '').toLowerCase() === 'true'
  const hasFtpSetting = typeof ftpData?.ftp === 'number' && ftpData.ftp > 0
  const hasGearConfigured = (gearList?.length ?? 0) > 0
  const firstRunDismissed = String(settings?.onboarding_first_steps_dismissed || '').toLowerCase() === 'true'
  const showFirstRunGuide = !activitiesLoading && !activitiesError && !hasAnyActivities && !firstRunDismissed

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: triggerFullSync,
    onSuccess: () => {
      // Show success notification
      toast({
        title: t('dashboard.sync.successTitle'),
        description: t('dashboard.sync.successBody'),
        variant: 'success',
      })

      // Invalidate all data queries to refresh after sync
      queryClient.invalidateQueries({ queryKey: ['activities'] })
      queryClient.invalidateQueries({ queryKey: ['yearStats'] })
      queryClient.invalidateQueries({ queryKey: ['weekStreak'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
    },
    onError: () => {
      // Show error notification
      toast({
        title: t('dashboard.sync.errorTitle'),
        description: t('dashboard.sync.errorBody'),
        variant: 'error',
      })
    }
  })

  // Calendar data
  const calendarDays = useMemo(() => {
    const start = startOfMonth(new Date(calendarYear, calendarMonth - 1))
    const end = endOfMonth(start)
    const days = eachDayOfInterval({ start, end })

    const activityMap = new Map<string, { count: number; types: string[] }>()
    calendar?.days.forEach(d => {
      activityMap.set(d.date.split('T')[0], { count: Number(d.count), types: d.types })
    })

    // Pad start to Monday
    const startDay = getDay(start)
    const padStart = startDay === 0 ? 6 : startDay - 1
    const paddedDays: Array<{ date: Date; inMonth: boolean; count: number; types: string[] }> = []

    // Add padding days from previous month (with activity data from backend)
    for (let i = padStart; i > 0; i--) {
      const d = new Date(start)
      d.setDate(d.getDate() - i)
      const key = format(d, 'yyyy-MM-dd')
      const activity = activityMap.get(key)
      paddedDays.push({ date: d, inMonth: false, count: activity?.count || 0, types: activity?.types || [] })
    }

    // Add days from current month
    days.forEach(date => {
      const key = format(date, 'yyyy-MM-dd')
      const activity = activityMap.get(key)
      paddedDays.push({ date, inMonth: true, count: activity?.count || 0, types: activity?.types || [] })
    })

    return paddedDays
  }, [calendar, calendarYear, calendarMonth])

  // Filter and sort activities
  const filteredActivities = useMemo(() => {
    if (!activities) return []
    let result = [...activities]

    if (filters.types.length > 0) {
      result = result.filter(a => filters.types.includes(a.type))
    }
    if (filters.gearId) {
      result = result.filter(a => a.gear_id === filters.gearId)
    }
    if (filters.search) {
      const search = filters.search.toLowerCase()
      result = result.filter(a => a.name.toLowerCase().includes(search) || a.type.toLowerCase().includes(search))
    }
    if (filters.minDistance) result = result.filter(a => Number(a.distance_km) >= filters.minDistance!)
    if (filters.minElevation) result = result.filter(a => Number(a.total_elevation_gain) >= filters.minElevation!)
    if (filters.dateFrom) result = result.filter(a => a.start_date >= filters.dateFrom!)
    if (filters.dateTo) result = result.filter(a => a.start_date <= filters.dateTo!)

    result.sort((a, b) => {
      let comparison = 0
      switch (filters.sortBy) {
        case 'date': comparison = new Date(b.start_date).getTime() - new Date(a.start_date).getTime(); break
        case 'distance': comparison = Number(b.distance_km) - Number(a.distance_km); break
        case 'elevation': comparison = Number(b.total_elevation_gain) - Number(a.total_elevation_gain); break
        case 'time': comparison = b.moving_time - a.moving_time; break
        case 'power': comparison = (Number(b.average_watts) || 0) - (Number(a.average_watts) || 0); break
      }
      return filters.sortOrder === 'asc' ? -comparison : comparison
    })
    return result
  }, [activities, filters])

  useMemo(() => setDisplayCount(ITEMS_PER_PAGE), [filters])

  const displayedActivitiesBase = useMemo(() => filteredActivities.slice(0, displayCount), [filteredActivities, displayCount])

  const todayDate = useMemo(() => new Date().toISOString().split('T')[0], [])

  const earliestDisplayedDate = useMemo(() => {
    if (displayedActivitiesBase.length === 0) return null
    let minDate = displayedActivitiesBase[0].start_date
    let minTime = new Date(minDate).getTime()

    displayedActivitiesBase.forEach((activity) => {
      const time = new Date(activity.start_date).getTime()
      if (Number.isFinite(time) && time < minTime) {
        minTime = time
        minDate = activity.start_date
      }
    })

    return minDate.split('T')[0]
  }, [displayedActivitiesBase])

  const latestActivityId = useMemo(() => {
    return activities?.[0]?.strava_activity_id ?? null
  }, [activities])

  const { data: bulkPowerMetrics } = useQuery({
    queryKey: ['bulk-power-metrics-dashboard', earliestDisplayedDate, todayDate, ftpData?.ftp, latestActivityId],
    queryFn: () => getBulkPowerMetrics({
      startDate: earliestDisplayedDate!,
      endDate: todayDate,
    }),
    enabled: !!earliestDisplayedDate && !!ftpData?.ftp,
    staleTime: 5 * 60 * 1000,
  })

  const powerMetricsMap = useMemo(() => {
    const map = new Map<number, {
      intensity_factor: number | null
      training_stress_score: number | null
      normalized_power: number | null
    }>()
    bulkPowerMetrics?.activities.forEach((metric) => {
      map.set(metric.activity_id, metric)
    })
    return map
  }, [bulkPowerMetrics?.activities])

  // Calculate weekly hours for last 4 weeks
  const weeklyHours = useMemo(() => {
    if (!activities) return []

    const last4Weeks = Array.from({ length: 4 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 })
      return weekStart
    }).reverse()

    return last4Weeks.map((weekStart) => {
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const weekActivities = activities.filter((activity: ActivityWithRoute) => {
        const activityDate = new Date(activity.start_date)
        return activityDate >= weekStart && activityDate < weekEnd
      })

      const totalSeconds = weekActivities.reduce(
        (sum: number, activity: ActivityWithRoute) => sum + (activity.moving_time || 0),
        0
      )

      const hours = totalSeconds / 3600
      const dayOfWeek = formatWeekdayShort(weekStart)

      return {
        week: `${dayOfWeek}`,
        hours: hours,
        rideHours: weekActivities
          .filter((a: ActivityWithRoute) => a.type === 'Ride' || a.type === 'VirtualRide')
          .reduce((sum: number, a: ActivityWithRoute) => sum + (a.moving_time || 0), 0) / 3600,
        runHours: weekActivities
          .filter((a: ActivityWithRoute) => a.type === 'Run' || a.type === 'TrailRun')
          .reduce((sum: number, a: ActivityWithRoute) => sum + (a.moving_time || 0), 0) / 3600,
        swimHours: weekActivities
          .filter((a: ActivityWithRoute) => a.type === 'Swim')
          .reduce((sum: number, a: ActivityWithRoute) => sum + (a.moving_time || 0), 0) / 3600,
        otherHours: weekActivities
          .filter((a: ActivityWithRoute) => !['Ride', 'VirtualRide', 'Run', 'TrailRun', 'Swim'].includes(a.type))
          .reduce((sum: number, a: ActivityWithRoute) => sum + (a.moving_time || 0), 0) / 3600,
      }
    })
  }, [activities, dateLocale])

  const maxWeeklyHours = useMemo(() => Math.max(...weeklyHours.map(w => w.hours), 1), [weeklyHours])

  const weeklyMetricData = useMemo(() => {
    if (!activities) return { distance: [], elevation: [], time: [] }

    const weeks = Array.from({ length: 12 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(new Date(), 11 - i), { weekStartsOn: 1 })
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)
      return {
        start: weekStart,
        end: weekEnd,
        label: t('dashboard.weeklyCharts.weekLabel', { week: getWeek(weekStart, { weekStartsOn: 1 }) }),
      }
    })

    const totals = weeks.map(() => ({ distance: 0, elevation: 0, time: 0 }))

    activities.forEach((activity: ActivityWithRoute) => {
      const activityDate = new Date(activity.start_date)
      for (let i = 0; i < weeks.length; i++) {
        const week = weeks[i]
        if (activityDate >= week.start && activityDate < week.end) {
          totals[i].distance += Number(activity.distance_km) || 0
          totals[i].elevation += Number(activity.total_elevation_gain) || 0
          totals[i].time += (activity.moving_time || 0) / 3600
          break
        }
      }
    })

    return {
      distance: totals.map((t, i) => ({ label: weeks[i].label, value: Math.round(t.distance) })),
      elevation: totals.map((t, i) => ({ label: weeks[i].label, value: Math.round(t.elevation) })),
      time: totals.map((t, i) => ({ label: weeks[i].label, value: Math.round(t.time * 10) / 10 })),
    }
  }, [activities, t])

  const routeQueries = useQueries({
    queries: displayedActivitiesBase.map(activity => ({
      queryKey: ['activity-route', activity.strava_activity_id],
      queryFn: async () => {
        const fullActivity = await getActivity(activity.strava_activity_id)
        return { id: activity.strava_activity_id, route_data: fullActivity.streams?.latlng || (fullActivity as any).route_data || null }
      },
      staleTime: 10 * 60 * 1000,
      enabled: !activity.route_data
    }))
  })

  const displayedActivities = useMemo(() => {
    const routeMap = new Map<number, [number, number][] | null>()
    routeQueries.forEach(query => { if (query.data) routeMap.set(query.data.id, query.data.route_data) })
    return displayedActivitiesBase.map((activity) => {
      const powerMetric = powerMetricsMap.get(activity.strava_activity_id)
      return {
        ...activity,
        route_data: activity.route_data || routeMap.get(activity.strava_activity_id) || null,
        intensity_factor: powerMetric?.intensity_factor ?? activity.intensity_factor,
        training_stress_score: powerMetric?.training_stress_score ?? activity.training_stress_score,
        normalized_power: powerMetric?.normalized_power ?? activity.normalized_power,
      }
    })
  }, [displayedActivitiesBase, powerMetricsMap, routeQueries])

  const hasMore = displayCount < filteredActivities.length
  const loadMore = () => setDisplayCount(prev => Math.min(prev + ITEMS_PER_PAGE, filteredActivities.length))

  // Goals
  const yearlyGoalRide = settings?.yearly_distance_goal_ride ? parseFloat(settings.yearly_distance_goal_ride) : 0
  const yearlyGoalRun = settings?.yearly_distance_goal_run ? parseFloat(settings.yearly_distance_goal_run) : 0

  // Calculate stats by sport type
  const weekStart = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - diff)
    weekStart.setHours(0, 0, 0, 0)
    return weekStart
  }, [])
  const monthRange = useMemo(() => {
    const start = startOfMonth(new Date())
    const end = endOfMonth(start)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    return { start, end, days: end.getDate() }
  }, [])

  const statsByType = useMemo(() => {
    if (!activities) return { ride: { week: 0, month: 0, year: 0 }, run: { week: 0, month: 0, year: 0 } }

    const rideTypes = ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide']
    const runTypes = ['Run', 'Walk', 'Hike']

    let rideWeek = 0, rideMonth = 0, rideYear = 0, runWeek = 0, runMonth = 0, runYear = 0

    activities.forEach(activity => {
      const activityDate = new Date(activity.start_date)
      const isThisWeek = activityDate >= weekStart
      const isThisMonth = activityDate >= monthRange.start && activityDate <= monthRange.end
      const isThisYear = activityDate.getFullYear() === currentYear
      const distance = Number(activity.distance_km) || 0

      if (rideTypes.includes(activity.type)) {
        if (isThisWeek) rideWeek += distance
        if (isThisMonth) rideMonth += distance
        if (isThisYear) rideYear += distance
      } else if (runTypes.includes(activity.type)) {
        if (isThisWeek) runWeek += distance
        if (isThisMonth) runMonth += distance
        if (isThisYear) runYear += distance
      }
    })

    return {
      ride: { week: Math.round(rideWeek), month: Math.round(rideMonth), year: Math.round(rideYear) },
      run: { week: Math.round(runWeek), month: Math.round(runMonth), year: Math.round(runYear) }
    }
  }, [activities, weekStart, monthRange, currentYear])

  // Calculate daily goal progress
  const getDailyGoalStatus = (currentDistance: number, yearlyGoal: number) => {
    if (!yearlyGoal) return null
    const dayOfYear = Math.floor((new Date().getTime() - new Date(currentYear, 0, 0).getTime()) / 86400000)
    const expectedDistance = (yearlyGoal / 365) * dayOfYear
    const difference = currentDistance - expectedDistance
    return {
      expected: Math.round(expectedDistance),
      difference: Math.round(difference),
      ahead: difference > 0
    }
  }

  const rideYearStatus = getDailyGoalStatus(statsByType.ride.year, yearlyGoalRide)
  const runYearStatus = getDailyGoalStatus(statsByType.run.year, yearlyGoalRun)

  const rideToGo = yearlyGoalRide > 0 ? Math.max(yearlyGoalRide - statsByType.ride.year, 0) : 0
  const runToGo = yearlyGoalRun > 0 ? Math.max(yearlyGoalRun - statsByType.run.year, 0) : 0
  const rideDelta = rideYearStatus?.difference ?? 0
  const runDelta = runYearStatus?.difference ?? 0
  const formatGoalValue = (value: number, goal: number) =>
    goal > 0 ? `${formatNumber(value)} ${unitKm}` : t('common.notAvailable')
  const formatDeltaValue = (value: number, goal: number) => {
    if (goal <= 0) return t('common.notAvailable')
    const sign = value > 0 ? '+' : value < 0 ? '-' : ''
    return `${sign}${formatNumber(Math.abs(value))} ${unitKm}`
  }
  const deltaTone = (value: number, goal: number) => {
    if (goal <= 0) return 'text-muted-foreground'
    if (value > 0) return 'text-green-600 dark:text-green-400'
    if (value < 0) return 'text-orange-600 dark:text-orange-400'
    return 'text-muted-foreground'
  }

  const activeGoalValue = goalMode === 'ride' ? yearlyGoalRide : yearlyGoalRun
  const activeCurrent = goalMode === 'ride' ? statsByType.ride.year : statsByType.run.year
  const activeToGo = goalMode === 'ride' ? rideToGo : runToGo
  const activeDelta = goalMode === 'ride' ? rideDelta : runDelta
  const activeLabel = goalMode === 'ride' ? t('dashboard.goals.allRide') : t('dashboard.goals.allRun')
  const activeStrokeClass = goalMode === 'ride' ? 'stroke-orange-500' : 'stroke-amber-500'
  const activeIconClass = goalMode === 'ride' ? 'text-orange-500' : 'text-amber-500'
  const activeProgress = activeGoalValue > 0 ? Math.min(activeCurrent / activeGoalValue, 1) : 0
  const ringSize = 44
  const ringStroke = 4
  const ringRadius = (ringSize - ringStroke) / 2
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference * (1 - activeProgress)


  if (statsError || activitiesError) {
    return <ErrorState onRetry={() => { refetchStats(); refetchActivities() }} />
  }

  const maxWeeklyDistance = Math.max(...weeklyMetricData.distance.map(d => d.value), 1)
  const maxWeeklyElevation = Math.max(...weeklyMetricData.elevation.map(d => d.value), 1)
  const maxWeeklyTime = Math.max(...weeklyMetricData.time.map(d => d.value), 1)

  // Draft palette for sidebar charts and bars; set to false to revert
  const useDraftSidebarChartPalette = true

  const weeklyBarColors = useDraftSidebarChartPalette
    ? {
        rideDot: 'bg-orange-500',
        runDot: 'bg-amber-500',
        swimDot: 'bg-yellow-500',
        otherDot: 'bg-stone-500',
        ride: 'bg-orange-500/80',
        run: 'bg-amber-500/80',
        swim: 'bg-yellow-500/70',
        other: 'bg-stone-500/70',
      }
    : {
        rideDot: 'bg-blue-500',
        runDot: 'bg-green-500',
        swimDot: 'bg-cyan-500',
        otherDot: 'bg-purple-500',
        ride: 'bg-blue-500/80',
        run: 'bg-green-500/80',
        swim: 'bg-cyan-500/80',
        other: 'bg-purple-500/80',
      }
  const weeklyMetricBarColors = useDraftSidebarChartPalette
    ? {
        distance: { bar: 'bg-orange-500/80', value: 'text-orange-400' },
        elevation: { bar: 'bg-amber-500/80', value: 'text-amber-400' },
        time: { bar: 'bg-stone-400/80', value: 'text-stone-300' },
      }
    : {
        distance: { bar: 'bg-green-500/80', value: 'text-green-400' },
        elevation: { bar: 'bg-purple-500/80', value: 'text-purple-400' },
        time: { bar: 'bg-blue-500/80', value: 'text-blue-400' },
      }

  return (
    <>
      <Toaster toasts={toasts} onDismiss={dismiss} />
      <div className="flex gap-6">
        {/* Left: Activities */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <blockquote className="border-l-4 border-primary pl-4 italic">
              <p className="text-base font-medium text-foreground leading-relaxed">
                "{randomQuote.text}"
              </p>
              <footer className="text-sm text-muted-foreground mt-2">
                — {randomQuote.author}
              </footer>
            </blockquote>
          </div>
          <div className="flex gap-2">
            {supportsSync && (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
                title={t('dashboard.sync.title')}
              >
                <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
                {syncMutation.isPending ? t('dashboard.sync.inProgress') : t('dashboard.sync.button')}
              </button>
            )}
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              <button onClick={() => setViewMode('cards')} className={`p-2 rounded transition-colors cursor-pointer ${viewMode === 'cards' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`} title={t('dashboard.view.cards')}>
                <LayoutGrid size={18} />
              </button>
              <button onClick={() => setViewMode('table')} className={`p-2 rounded transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`} title={t('dashboard.view.table')}>
                <List size={18} />
              </button>
            </div>
          </div>
        </div>

        {supportsSync && isSyncRunning && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            <div className="space-y-0.5">
              <div className="font-medium text-foreground">{t('dashboard.sync.runningTitle')}</div>
              <div className="text-muted-foreground">{t('dashboard.sync.runningBody')}</div>
              {showInitialSyncHint && (
                <div className="text-muted-foreground">{t('dashboard.sync.runningSettingsHint')}</div>
              )}
            </div>
          </div>
        )}

        {showFirstRunGuide && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  {t('dashboard.firstRun.title')}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('dashboard.firstRun.subtitle')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissFirstRunMutation.mutate()}
                disabled={dismissFirstRunMutation.isPending}
                className="px-3 py-1.5 rounded-md border border-border bg-background text-xs hover:bg-muted disabled:opacity-50"
              >
                {dismissFirstRunMutation.isPending
                  ? t('dashboard.firstRun.dismissSaving')
                  : t('dashboard.firstRun.dismiss')}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-muted-foreground">{t('dashboard.firstRun.step1Label')}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${profileBasicsConfirmed ? 'border-green-500/30 bg-green-500/10 text-green-600' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700'}`}>
                    {profileBasicsConfirmed ? t('dashboard.firstRun.statusDone') : t('dashboard.firstRun.statusOpen')}
                  </span>
                </div>
                <div className="font-medium">{t('dashboard.firstRun.step1Title')}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('dashboard.firstRun.step1Body')}</div>
                {!hasFtpSetting && (
                  <div className="text-xs text-muted-foreground mt-2">{t('dashboard.firstRun.step1HintOptionalFtp')}</div>
                )}
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-muted-foreground">{t('dashboard.firstRun.step2Label')}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${hasAnyActivities ? 'border-green-500/30 bg-green-500/10 text-green-600' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700'}`}>
                    {hasAnyActivities ? t('dashboard.firstRun.statusDone') : t('dashboard.firstRun.statusOpen')}
                  </span>
                </div>
                <div className="font-medium">{t('dashboard.firstRun.step2Title')}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('dashboard.firstRun.step2Body')}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-muted-foreground">{t('dashboard.firstRun.step3Label')}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${hasGearConfigured ? 'border-green-500/30 bg-green-500/10 text-green-600' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700'}`}>
                    {hasGearConfigured ? t('dashboard.firstRun.statusDone') : t('dashboard.firstRun.statusOptional')}
                  </span>
                </div>
                <div className="font-medium">{t('dashboard.firstRun.step3Title')}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('dashboard.firstRun.step3Body')}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-muted-foreground">{t('dashboard.firstRun.step4Label')}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${hasAnyActivities ? 'border-green-500/30 bg-green-500/10 text-green-600' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-700'}`}>
                    {hasAnyActivities ? t('dashboard.firstRun.statusDone') : t('dashboard.firstRun.statusOpen')}
                  </span>
                </div>
                <div className="font-medium">{t('dashboard.firstRun.step4Title')}</div>
                <div className="text-sm text-muted-foreground mt-1">{t('dashboard.firstRun.step4Body')}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to="/import"
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
              >
                {t('dashboard.firstRun.ctaImport')}
              </Link>
              <Link
                to="/settings"
                className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-sm font-medium"
              >
                {t('dashboard.firstRun.ctaSettings')}
              </Link>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="p-4">
            <ActivityFiltersBar
              filters={filters}
              onChange={setFilters}
              gearOptions={(gearList || []).map(gear => ({ id: gear.id, name: gear.name }))}
            />
          </CardContent>
        </Card>

        {activitiesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <ActivityCardSkeleton key={i} />)}</div>
        ) : filteredActivities.length === 0 ? (
          <NoActivitiesFound onReset={() => setFilters(defaultFilters)} />
        ) : viewMode === 'cards' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedActivities.map((activity) => (
                <ActivityCard key={activity.strava_activity_id} activity={activity} showSpeed={false} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button onClick={loadMore} className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                  {t('dashboard.loadMore', { count: filteredActivities.length - displayCount })}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <Card><CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium text-sm">{t('dashboard.table.activity')}</th>
                  <th className="text-left p-4 font-medium text-sm">{t('dashboard.table.date')}</th>
                  <th className="text-left p-4 font-medium text-sm">{t('dashboard.table.type')}</th>
                  <th className="text-right p-4 font-medium text-sm">{t('dashboard.table.distance')}</th>
                  <th className="text-right p-4 font-medium text-sm">{t('dashboard.table.time')}</th>
                  <th className="text-right p-4 font-medium text-sm">{t('dashboard.table.elevation')}</th>
                  <th className="text-right p-4 font-medium text-sm">{t('dashboard.table.pace')}</th>
                </tr></thead>
                <tbody>{displayedActivities.map((activity) => <ActivityTableRow key={activity.strava_activity_id} activity={activity} />)}</tbody>
              </table>
            </div></CardContent></Card>
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button onClick={loadMore} className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
                  {t('dashboard.loadMore', { count: filteredActivities.length - displayCount })}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: Stats Sidebar */}
      <div className="hidden lg:block w-80 xl:w-96 flex-shrink-0 space-y-4">
        {/* Week Streak */}
        <Card className="bg-gradient-to-br from-orange-500/20 via-orange-500/10 to-background border-orange-500/30">
          <CardContent className="p-5">
            <div className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-3">{t('dashboard.streak.title')}</div>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                </svg>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold bg-gradient-to-br from-orange-600 to-orange-500 bg-clip-text text-transparent">{weekStreak?.week_streak || 0}</span>
                  <span className="text-lg text-muted-foreground">{t('dashboard.streak.weeks')}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('dashboard.streak.subtitle')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity Calendar */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <button
                onClick={goToPrevMonth}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title={t('dashboard.calendar.prevMonth')}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToToday}
                className="text-base font-semibold hover:text-primary transition-colors"
                title={t('dashboard.calendar.currentMonth')}
              >
                {formatMonthYear(new Date(calendarYear, calendarMonth - 1))}
              </button>
              <button
                onClick={goToNextMonth}
                className="p-1 hover:bg-secondary rounded transition-colors"
                title={t('dashboard.calendar.nextMonth')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {(t('dashboard.calendar.weekdays', { returnObjects: true }) as string[]).map((d) => (
                <div key={d} className="text-muted-foreground font-medium py-1">{d}</div>
              ))}
              {calendarDays.map((day, i) => (
                <div
                  key={i}
                  className={`aspect-square flex items-center justify-center rounded-full text-xs ${
                    !day.inMonth
                      ? day.count > 0
                        ? 'bg-orange-500/30 text-muted-foreground/50'
                        : 'text-muted-foreground/30'
                      : day.count > 0
                        ? 'bg-orange-500'
                        : 'text-muted-foreground'
                  }`}
                  title={day.count > 0 ? t('dashboard.calendar.dayTitle', {
                    count: day.count,
                    types: day.types.join(', ')
                  }) : undefined}
                >
                  {day.count > 0 ? (
                    <div className={!day.inMonth ? 'opacity-50' : ''}>
                      <CalendarActivityIcon types={day.types} />
                    </div>
                  ) : (
                    day.date.getDate()
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Goals */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-primary" />
              <span className="text-base font-semibold">{t('dashboard.goals.title')}</span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-secondary/70 p-1">
              <button
                type="button"
                onClick={() => setGoalMode('ride')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  goalMode === 'ride' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('dashboard.goals.rideShort')}
              </button>
              <button
                type="button"
                onClick={() => setGoalMode('run')}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  goalMode === 'run' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('dashboard.goals.runShort')}
              </button>
            </div>
          </div>
          <Card className="border-primary/15 shadow-lg shadow-primary/5">
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11">
                  <svg
                    width={ringSize}
                    height={ringSize}
                    viewBox={`0 0 ${ringSize} ${ringSize}`}
                    className="-rotate-90"
                  >
                    <circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      r={ringRadius}
                      stroke="hsl(var(--border))"
                      strokeOpacity="0.4"
                      strokeWidth={ringStroke}
                      fill="none"
                    />
                    <circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      r={ringRadius}
                      strokeWidth={ringStroke}
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      className={activeStrokeClass}
                    />
                  </svg>
                  <div className={`absolute inset-0 flex items-center justify-center ${activeIconClass}`}>
                    {goalMode === 'ride' ? <Bike size={18} /> : <Footprints size={18} />}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold">{t('dashboard.goals.yearlyTitle')}</div>
                  <div className="text-xs text-muted-foreground">{activeLabel}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">{t('dashboard.goals.current')}</div>
                  <div className="text-lg font-semibold">{formatGoalValue(activeCurrent, activeGoalValue)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('dashboard.goals.toGo')}</div>
                  <div className="text-lg font-semibold">{formatGoalValue(activeToGo, activeGoalValue)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('dashboard.goals.behindPlan')}</div>
                  <div className={`text-lg font-semibold ${deltaTone(activeDelta, activeGoalValue)}`}>
                    {formatDeltaValue(activeDelta, activeGoalValue)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Training Hours - Last 4 Weeks (Strava-style) */}
        <Card>
          <CardContent className="pt-4 pb-3">
            {/* Header with activity type icons */}
            <div className="flex items-center gap-3 mb-3 text-muted-foreground">
              <div className="flex items-center gap-1 cursor-help group relative" title={t('dashboard.weeklyHours.ride')}>
                <div className={`w-1.5 h-1.5 rounded-full ${weeklyBarColors.rideDot}`} />
                <Bike size={16} />
              </div>
              <div className="flex items-center gap-1 cursor-help" title={t('dashboard.weeklyHours.run')}>
                <div className={`w-1.5 h-1.5 rounded-full ${weeklyBarColors.runDot}`} />
                <Footprints size={16} />
              </div>
              <div className="flex items-center gap-1 cursor-help" title={t('dashboard.weeklyHours.swim')}>
                <div className={`w-1.5 h-1.5 rounded-full ${weeklyBarColors.swimDot}`} />
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12h1c1.5 0 2.5-1 3-2s1.5-2 3-2 2.5 1 3 2 1.5 2 3 2 2.5-1 3-2 1.5-2 3-2h1" />
                  <path d="M2 18h1c1.5 0 2.5-1 3-2s1.5-2 3-2 2.5 1 3 2 1.5 2 3 2 2.5-1 3-2 1.5-2 3-2h1" />
                </svg>
              </div>
              <div className="flex items-center gap-1 cursor-help" title={t('dashboard.weeklyHours.other')}>
                <div className={`w-1.5 h-1.5 rounded-full ${weeklyBarColors.otherDot}`} />
                <Activity size={16} />
              </div>
            </div>

            {/* Weekly bars */}
            <div className="space-y-2">
              {weeklyHours.map((weekData, index) => {
                const weekStart = startOfWeek(subWeeks(new Date(), 3 - index), { weekStartsOn: 1 })
                const weekNumber = getWeek(weekStart, { weekStartsOn: 1 })
                const year = weekStart.getFullYear().toString().slice(-2)
                const totalMinutes = Math.round((weekData.hours % 1) * 60)
                const timeLabel = totalMinutes > 0
                  ? t('dashboard.weeklyHours.timeLabel', { hours: Math.floor(weekData.hours), minutes: totalMinutes })
                  : t('dashboard.weeklyHours.timeLabelHours', { hours: Math.floor(weekData.hours) })

                return (
                  <div key={index} className="flex items-center gap-2">
                    {/* Week label */}
                    <span className="text-xs text-muted-foreground tabular-nums w-12">
                      {t('dashboard.weeklyHours.weekLabel', { week: weekNumber, year })}
                    </span>
                    {/* Stacked bar */}
                    <div className="flex-1 flex gap-0.5 h-6 bg-secondary/30 rounded overflow-hidden">
                      {/* Ride */}
                      {weekData.rideHours > 0 && (
                        <div
                          className={`${weeklyBarColors.ride} flex items-center justify-center text-white`}
                          style={{ width: `${(weekData.rideHours / maxWeeklyHours) * 100}%` }}
                          title={t('dashboard.weeklyHours.segmentTitle', { label: t('dashboard.weeklyHours.ride'), value: weekData.rideHours.toFixed(1), unit: unitHours })}
                        >
                          {weekData.rideHours >= 0.5 && <Bike size={14} strokeWidth={2.5} />}
                        </div>
                      )}
                      {/* Run */}
                      {weekData.runHours > 0 && (
                        <div
                          className={`${weeklyBarColors.run} flex items-center justify-center text-white`}
                          style={{ width: `${(weekData.runHours / maxWeeklyHours) * 100}%` }}
                          title={t('dashboard.weeklyHours.segmentTitle', { label: t('dashboard.weeklyHours.run'), value: weekData.runHours.toFixed(1), unit: unitHours })}
                        >
                          {weekData.runHours >= 0.5 && <Footprints size={14} strokeWidth={2.5} />}
                        </div>
                      )}
                      {/* Swim */}
                      {weekData.swimHours > 0 && (
                        <div
                          className={weeklyBarColors.swim}
                          style={{ width: `${(weekData.swimHours / maxWeeklyHours) * 100}%` }}
                          title={t('dashboard.weeklyHours.segmentTitle', { label: t('dashboard.weeklyHours.swim'), value: weekData.swimHours.toFixed(1), unit: unitHours })}
                        />
                      )}
                      {/* Other */}
                      {weekData.otherHours > 0 && (
                        <div
                          className={weeklyBarColors.other}
                          style={{ width: `${(weekData.otherHours / maxWeeklyHours) * 100}%` }}
                          title={t('dashboard.weeklyHours.segmentTitle', { label: t('dashboard.weeklyHours.other'), value: weekData.otherHours.toFixed(1), unit: unitHours })}
                        />
                      )}
                    </div>
                    {/* Time label next to bar */}
                    <span className="text-sm font-medium tabular-nums text-muted-foreground w-20 text-right">
                      {timeLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Year Stats */}
        <Card className="border-primary/20 shadow-lg shadow-primary/5">
          <CardHeader className="pb-2 bg-gradient-to-br from-primary/5 to-transparent">
            <CardTitle className="text-base flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
              </svg>
              {t('dashboard.yearToDate', { year: currentYear })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statsLoading ? (
              <div className="grid grid-cols-2 gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <CompactStat icon={<ActivityIcon />} label={t('dashboard.stats.activities')} value={formatNumber(Number(yearStats?.total_activities) || 0)} color="text-orange-500" />
                <CompactStat icon={<DistanceIcon />} label={t('dashboard.stats.distance')} value={`${formatNumber(Math.round(Number(yearStats?.total_distance_km) || 0))} ${unitKm}`} color="text-amber-500" />
                <CompactStat icon={<TimeIcon />} label={t('dashboard.stats.time')} value={`${formatNumber(Math.round(Number(yearStats?.total_time_hours) || 0))} ${unitHours}`} color="text-stone-400" />
                <CompactStat icon={<ElevationIcon />} label={t('dashboard.stats.elevation')} value={`${formatNumber(Math.round(Number(yearStats?.total_elevation_m) || 0))} ${unitMeters}`} color="text-yellow-500" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distance Chart */}
        <WeeklyBarChart
          title={t('dashboard.weeklyCharts.distance')}
          data={weeklyMetricData.distance}
          max={maxWeeklyDistance}
          barClass={weeklyMetricBarColors.distance.bar}
          valueClass={weeklyMetricBarColors.distance.value}
          unit={unitKm}
          loading={activitiesLoading}
        />

        {/* Elevation Chart */}
        <WeeklyBarChart
          title={t('dashboard.weeklyCharts.elevation')}
          data={weeklyMetricData.elevation}
          max={maxWeeklyElevation}
          barClass={weeklyMetricBarColors.elevation.bar}
          valueClass={weeklyMetricBarColors.elevation.value}
          unit={unitMeters}
          loading={activitiesLoading}
        />

        {/* Time Chart */}
        <WeeklyBarChart
          title={t('dashboard.weeklyCharts.time')}
          data={weeklyMetricData.time}
          max={maxWeeklyTime}
          barClass={weeklyMetricBarColors.time.bar}
          valueClass={weeklyMetricBarColors.time.value}
          unit={unitHours}
          decimals={1}
          loading={activitiesLoading}
        />

        {/* Quick Links */}
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-2">
              <QuickLink to="/heatmap" icon="map" label={t('nav.heatmap')} />
              <QuickLink to="/records" icon="trophy" label={t('nav.records')} />
              <QuickLink to="/power" icon="zap" label={t('nav.power')} />
              <QuickLink to="/analytics" icon="chart" label={t('dashboard.quickLinks.analytics')} />
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
    </>
  )
}

// Weekly bar chart component for the last 12 weeks
function WeeklyBarChart({
  title,
  data,
  max,
  barClass,
  valueClass,
  unit,
  decimals = 0,
  loading
}: {
  title: string
  data: { label: string; value: number }[]
  max: number
  barClass: string
  valueClass: string
  unit: string
  decimals?: number
  loading: boolean
}) {
  const { t } = useTranslation()
  const latest = data.length > 0 ? data[data.length - 1] : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          {latest && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{latest.label}</div>
              <div className={`text-lg font-bold tabular-nums ${valueClass}`}>
                {formatNumber(latest.value, decimals)} {unit}
              </div>
            </div>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">{t('dashboard.weeklyCharts.last12Weeks')}</div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-24 bg-muted rounded animate-pulse" />
        ) : (
          <div className="flex items-end gap-1 h-24">
            {data.map((d, i) => {
              const ratio = max > 0 ? d.value / max : 0
              const height = Math.max(ratio * 100, 12)
              const valueText = decimals > 0 ? formatNumber(d.value, decimals) : formatCompactNumber(d.value)

              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div
                    className={`w-full rounded-sm ${barClass} ${d.value === 0 ? 'opacity-40' : ''} flex items-center justify-center`}
                    style={{ height: `${height}%` }}
                    title={`${d.label}: ${formatNumber(d.value, decimals)} ${unit}`}
                  >
                    <span className="flex flex-col items-center leading-none text-[9px] text-white/90">
                      <span className="font-semibold">{valueText}</span>
                      <span className="text-[8px] text-white/70">{unit}</span>
                    </span>
                  </div>
                  <span className="mt-1 text-[9px] text-muted-foreground">{d.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Compact stat tile for Year to Date
function CompactStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/20 px-2.5 py-2">
      <div className={`${color} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  )
}

// Icons
function ActivityIcon() {
  return <Activity size={16} />
}
function DistanceIcon() {
  return <Globe size={16} />
}
function TimeIcon() {
  return <Clock size={16} />
}
function ElevationIcon() {
  return <Mountain size={16} />
}

// Quick link
function QuickLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  const icons: Record<string, React.ReactNode> = {
    map: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/></svg>,
    trophy: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
    zap: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
    chart: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
  }
  return (
    <Link to={to} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-secondary transition-colors text-sm font-medium">
      <span className="text-muted-foreground">{icons[icon]}</span>{label}
    </Link>
  )
}

// Table row
function ActivityTableRow({ activity }: { activity: ActivityWithRoute }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const unitKm = t('records.units.km')
  const unitMeters = t('records.units.m')
  const formatActivityDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dateString))
    } catch {
      return dateString
    }
  }
  const isRunType = activity.type === 'Run' || activity.type === 'Walk' || activity.type === 'Hike'
  const trainingInsights = getTrainingInsights({
    tss: activity.training_stress_score ?? null,
    intensityFactor: activity.intensity_factor ?? null,
    durationSeconds: activity.moving_time,
  })
  return (
    <tr className="border-b hover:bg-muted/30 transition-colors">
      <td className="p-4">
        <div className="flex flex-col gap-1">
          <Link to={`/activity/${activity.strava_activity_id}`} className="group">
            <span className="font-medium group-hover:text-primary transition-colors">{activity.name}</span>
          </Link>
          {trainingInsights.state === 'ok' && trainingInsights.zone && trainingInsights.impact && (
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className={trainingInsights.zone.className}>
                {trainingInsights.zone.shortLabel}
              </Badge>
              <Badge variant="outline" className={trainingInsights.impact.className}>
                {trainingInsights.impact.shortLabel}
              </Badge>
            </div>
          )}
        </div>
      </td>
      <td className="p-4 text-sm text-muted-foreground whitespace-nowrap">{formatActivityDate(activity.start_date)}</td>
      <td className="p-4"><ActivityBadge type={activity.type} showIcon={false} /></td>
      <td className="p-4 text-sm text-right tabular-nums">{formatNumber(Number(activity.distance_km), 1)} {unitKm}</td>
      <td className="p-4 text-sm text-right tabular-nums">{formatDurationFromSeconds(activity.moving_time)}</td>
      <td className="p-4 text-sm text-right tabular-nums">{formatNumber(Math.round(Number(activity.total_elevation_gain)))} {unitMeters}</td>
      <td className="p-4 text-sm text-right tabular-nums">{isRunType ? formatPace(Number(activity.avg_speed_kmh)) : formatSpeed(Number(activity.avg_speed_kmh))}</td>
    </tr>
  )
}

// Calendar activity icon - shows appropriate icon based on activity types
function CalendarActivityIcon({ types }: { types: string[] }) {
  // Check if any type is a run/walk/hike
  const hasRunType = types.some(t => t === 'Run' || t === 'Walk' || t === 'Hike')
  const hasRideType = types.some(t => t === 'Ride' || t === 'VirtualRide' || t === 'EBikeRide' || t === 'GravelRide' || t === 'MountainBikeRide')

  // If mixed activities, show a generic activity icon
  if (hasRunType && hasRideType) {
    return <Activity size={18} color="white" strokeWidth={2.5} />
  }

  if (hasRunType) {
    return <Footprints size={18} color="white" strokeWidth={2.5} />
  }

  // Default: bike icon
  return <Bike size={18} color="white" strokeWidth={2.5} />
}
