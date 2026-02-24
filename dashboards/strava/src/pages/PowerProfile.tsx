import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Label,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import {
  getCachedYearlyPowerCurve,
  getCachedPowerCurve,
  calculatePowerCurve,
  getSettings,
  updateSetting,
  getFTP,
  getPowerCurve,
  type YearlyPowerCurveEntry
} from '../lib/api'
import { getChartColors } from '../lib/chartTheme'
import { useTheme } from '../components/ThemeProvider'
import { useTranslation } from 'react-i18next'

// Generate distinct colors for each year
const yearColors: Record<number, string> = {
  2026: '#ef4444', // Red (newest year)
  2025: '#fc4c02', // Strava orange
  2024: '#3b82f6', // Blue
  2023: '#22c55e', // Green
  2022: '#a855f7', // Purple
  2021: '#f59e0b', // Amber
  2020: '#ec4899', // Pink
  2019: '#14b8a6', // Teal
  2018: '#8b5cf6', // Violet
  2017: '#f97316', // Orange
  2016: '#06b6d4', // Cyan
}

const defaultColors = ['#fc4c02', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b']

// Logarithmic scale durations for power curve (in seconds)
// Higher resolution for short durations, lower for long durations
const LOG_DURATIONS = [
  { seconds: 1, label: '1s' },
  { seconds: 2, label: '2s' },
  { seconds: 3, label: '3s' },
  { seconds: 5, label: '5s' },
  { seconds: 10, label: '10s' },
  { seconds: 15, label: '15s' },
  { seconds: 20, label: '20s' },
  { seconds: 30, label: '30s' },
  { seconds: 45, label: '45s' },
  { seconds: 60, label: '1min' },
  { seconds: 90, label: '1:30' },
  { seconds: 120, label: '2min' },
  { seconds: 180, label: '3min' },
  { seconds: 300, label: '5min' },
  { seconds: 480, label: '8min' },
  { seconds: 600, label: '10min' },
  { seconds: 900, label: '15min' },
  { seconds: 1200, label: '20min' },
  { seconds: 1800, label: '30min' },
  { seconds: 2700, label: '45min' },
  { seconds: 3600, label: '1hr' },
  { seconds: 5400, label: '1:30h' },
  { seconds: 7200, label: '2hr' },
  { seconds: 10800, label: '3hr' },
]

const MAX_YEARS_COMPARE = 5

export function PowerProfile() {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const queryClient = useQueryClient()
  const [selectedYears, setSelectedYears] = useState<number[]>([])
  const [showDetails, setShowDetails] = useState(false)

  // Fetch user settings (including weight)
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch FTP and power zones
  const { data: ftpData } = useQuery({
    queryKey: ['ftp'],
    queryFn: getFTP,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch power curve analysis (rider type & strengths) - cached for 24 hours
  const { data: powerCurveAnalysis } = useQuery({
    queryKey: ['power-curve-analysis'],
    queryFn: () => getPowerCurve({ months: 12 }),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours cache
    gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  // State for editing FTP
  const [editingFTP, setEditingFTP] = useState(false)
  const [ftpInput, setFtpInput] = useState('')

  // Mutation to update FTP
  const ftpMutation = useMutation({
    mutationFn: (ftp: string) => updateSetting('ftp', ftp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ftp'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setEditingFTP(false)
    },
  })

  const athleteWeight = parseFloat(settings?.athlete_weight || '75')

  // Use cached power curve data (fast)
  const { data: yearlyData, isLoading: yearlyLoading, refetch: refetchYearly } = useQuery({
    queryKey: ['power-curve-yearly-cached'],
    queryFn: () => getCachedYearlyPowerCurve(),
    staleTime: 60 * 60 * 1000,
  })

  const { data: allTimeData, isLoading: allTimeLoading, refetch: refetchAllTime } = useQuery({
    queryKey: ['power-curve-alltime-cached'],
    queryFn: () => getCachedPowerCurve(),
    staleTime: 60 * 60 * 1000,
  })

  // Initialize selected years when data loads
  useEffect(() => {
    if (yearlyData?.years && selectedYears.length === 0) {
      // Auto-select the most recent years (up to 3)
      const years = yearlyData.years.slice(0, 3).map(y => y.year)
      setSelectedYears(years)
    }
  }, [yearlyData, selectedYears.length])

  // Mutation to recalculate power curves
  const calculateMutation = useMutation({
    mutationFn: calculatePowerCurve,
    onSuccess: () => {
      refetchYearly()
      refetchAllTime()
    },
  })

  const chartColors = {
    grid: resolvedTheme === 'dark' ? '#374151' : '#e5e7eb',
    text: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
  }

  const colors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatWattCompact = (value?: number | string | null) =>
    value === null || value === undefined
      ? t('common.notAvailable')
      : t('powerProfile.units.wattCompact', { value })
  const formatWattPerKg = (value?: number | string | null) =>
    value === null || value === undefined
      ? t('common.notAvailable')
      : t('powerProfile.units.wattPerKgCompact', { value })
  const allTimeKey = t('powerProfile.allTime.key')

  // Format radar chart data for rider strengths
  const radarData = useMemo(() => {
    if (!powerCurveAnalysis) return []
    return [
      { subject: t('powerProfile.strengths.sprint'), value: Math.round(powerCurveAnalysis.strengths.sprint), fullMark: 100 },
      { subject: t('powerProfile.strengths.punch'), value: Math.round(powerCurveAnalysis.strengths.punch), fullMark: 100 },
      { subject: t('powerProfile.strengths.climbing'), value: Math.round(powerCurveAnalysis.strengths.climbing), fullMark: 100 },
      { subject: t('powerProfile.strengths.timeTrial'), value: Math.round(powerCurveAnalysis.strengths.time_trial), fullMark: 100 },
      { subject: t('powerProfile.strengths.endurance'), value: Math.round(powerCurveAnalysis.strengths.endurance), fullMark: 100 },
    ]
  }, [powerCurveAnalysis, i18n.language])

  // Toggle year selection
  const toggleYear = (year: number) => {
    if (selectedYears.includes(year)) {
      setSelectedYears(selectedYears.filter(y => y !== year))
    } else if (selectedYears.length < MAX_YEARS_COMPARE) {
      setSelectedYears([...selectedYears, year].sort((a, b) => b - a))
    }
  }

  // Get color for a year
  const getYearColor = (year: number, index: number) => {
    return yearColors[year] || defaultColors[index % defaultColors.length]
  }

  // Transform data for line chart with logarithmic X-axis
  // Map available durations to log scale positions
  const powerCurveData = useMemo(() => {
    if (!yearlyData?.durations || !yearlyData?.years) return []

    // Create data points for each available duration
    return yearlyData.durations.map((durationLabel) => {
      // Find the corresponding log duration
      const logDuration = LOG_DURATIONS.find(d => d.label === durationLabel)
      const entry: Record<string, number | string | null> = {
        duration: durationLabel,
        seconds: logDuration?.seconds || 0,
      }

      // Add values for selected years only
      yearlyData.years.forEach((year) => {
        if (selectedYears.includes(year.year)) {
          entry[year.year] = year[durationLabel as keyof YearlyPowerCurveEntry] || null
        }
      })

      // Add all-time best value
      if (allTimeData?.durations) {
        const allTimeDuration = allTimeData.durations.find(d => d.label === durationLabel)
        if (allTimeDuration) {
          entry[allTimeKey] = allTimeDuration.watts
        }
      }

      return entry
    })
  }, [yearlyData, selectedYears, allTimeData, allTimeKey])

  // Calculate Y-axis domain based on data for steeper curve display
  const yAxisDomain = useMemo(() => {
    if (!powerCurveData || powerCurveData.length === 0) return [0, 'auto']

    // Find max power value across all data
    let maxPower = 0
    let minPower = Infinity

    powerCurveData.forEach((entry) => {
      Object.keys(entry).forEach((key) => {
        if (key !== 'duration' && key !== 'seconds') {
          const value = entry[key]
          if (typeof value === 'number' && value > 0) {
            maxPower = Math.max(maxPower, value)
            minPower = Math.min(minPower, value)
          }
        }
      })
    })

    // Set minimum Y to show curve steeper - start at roughly 50% of min value
    const yMin = Math.max(0, Math.floor(minPower * 0.5 / 50) * 50) // Round down to nearest 50
    const yMax = Math.ceil(maxPower * 1.1 / 50) * 50 // Round up to nearest 50 with 10% headroom

    return [yMin, yMax]
  }, [powerCurveData])

  // Bar chart data for year comparison at each duration
  const barChartData = yearlyData?.years.map((year) => ({
    year: year.year,
    activities: year.activities,
    '5s': year['5s'] || 0,
    '1min': year['1min'] || 0,
    '5min': year['5min'] || 0,
    '20min': year['20min'] || 0,
  })) || []

  const isLoading = yearlyLoading || allTimeLoading

  // Format activity date for display
  const formatActivityDate = (dateString: string | null) => {
    if (!dateString) return null
    try {
      return new Intl.DateTimeFormat(dateLocale, { month: 'short', year: 'numeric' }).format(new Date(dateString))
    } catch {
      return null
    }
  }

  const riderTypeLabel = powerCurveAnalysis
    ? t(`powerProfile.riderTypes.${powerCurveAnalysis.rider_type}`, { defaultValue: powerCurveAnalysis.rider_type })
    : ''

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('powerProfile.title')}</h2>
        <p className="text-muted-foreground">
          {t('powerProfile.subtitle')}
        </p>
      </div>

      {/* Filter and Settings */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">{t('powerProfile.filters.weight')}</label>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 rounded border bg-background text-sm">
                  {Number.isFinite(athleteWeight) ? athleteWeight : '—'} {t('settings.units.kg')}
                </div>
                <Link to="/settings" className="text-xs text-orange-500 hover:underline">
                  {t('powerProfile.filters.weightManageInSettings')}
                </Link>
              </div>
            </div>

            {!allTimeData?.cached && (
              <button
                onClick={() => calculateMutation.mutate()}
                disabled={calculateMutation.isPending}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {calculateMutation.isPending ? t('powerProfile.cache.calculating') : t('powerProfile.cache.generate')}
              </button>
            )}

            {allTimeData?.cached && allTimeData.calculated_at && (
              <span className="text-xs text-muted-foreground">
                {t('powerProfile.cache.cachedAt', { value: new Date(allTimeData.calculated_at).toLocaleDateString(dateLocale) })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rider Type Analysis & FTP Power Zones - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rider Type Analysis - Always show card to prevent layout shift */}
        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              {t('powerProfile.riderType.title')}
            </CardTitle>
            {powerCurveAnalysis?.activities_analyzed && (
              <CardDescription>{t('powerProfile.riderType.subtitle', { count: powerCurveAnalysis.activities_analyzed })}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {powerCurveAnalysis && powerCurveAnalysis.activities_analyzed > 0 ? (
              <>
                <div className="mb-6 text-center">
                  <div className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-2">
                    {riderTypeLabel}
                  </div>
                  <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                    <span>{t('powerProfile.riderType.keyPowers.s5', { watts: formatWattCompact(powerCurveAnalysis.key_powers['5_sec']) })}</span>
                    <span>{t('powerProfile.riderType.keyPowers.m1', { watts: formatWattCompact(powerCurveAnalysis.key_powers['1_min']) })}</span>
                    <span>{t('powerProfile.riderType.keyPowers.m20', { watts: formatWattCompact(powerCurveAnalysis.key_powers['20_min']) })}</span>
                  </div>
                </div>

                {/* Radar Chart */}
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={radarData}>
                    <defs>
                      <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.8} />
                        <stop offset="30%" stopColor="#3b82f6" stopOpacity={0.7} />
                        <stop offset="60%" stopColor="#eab308" stopOpacity={0.6} />
                        <stop offset="80%" stopColor="#f97316" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
                      </radialGradient>
                    </defs>
                    <PolarGrid stroke={chartColors.grid} strokeWidth={1.5} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: chartColors.text, fontSize: 13, fontWeight: 500 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: chartColors.text, fontSize: 11 }} />
                    <Radar name={t('powerProfile.strengths.label')} dataKey="value" stroke={colors.primary} strokeWidth={2.5} fill="url(#radarGradient)" fillOpacity={0.7} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px' }}
                      formatter={(value: number | undefined) => value !== undefined
                        ? [`${value.toFixed(0)}%`, t('powerProfile.strengths.tooltip')]
                        : [t('common.notAvailable'), t('powerProfile.strengths.tooltip')]}
                    />
                  </RadarChart>
                </ResponsiveContainer>

                {/* Rider Type Explanation - Collapsible */}
                <div className="mt-6">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/40 transition-colors"
                  >
                    <span className="text-sm font-semibold text-primary">{t('powerProfile.details.title')}</span>
                    {showDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {showDetails && (
                    <div className="mt-2 p-4 bg-secondary/30 rounded-lg space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-2 text-primary">{t('powerProfile.details.whatMakes', { type: riderTypeLabel })}</h4>
                        <div className="text-xs text-muted-foreground space-y-2">
                      {powerCurveAnalysis.rider_type === 'Sprinter' && (
                        <>
                          <p>{t('powerProfile.details.types.sprinter.desc')}</p>
                          <p className="text-primary">{t('powerProfile.details.types.sprinter.strength', {
                            watts: powerCurveAnalysis.key_powers['5_sec'],
                            wkg: (powerCurveAnalysis.key_powers['5_sec'] / 70).toFixed(1),
                          })}</p>
                        </>
                      )}
                      {powerCurveAnalysis.rider_type === 'Puncheur' && (
                        <>
                          <p>{t('powerProfile.details.types.puncheur.desc')}</p>
                          <p className="text-primary">{t('powerProfile.details.types.puncheur.strength', {
                            watts: powerCurveAnalysis.key_powers['1_min'],
                            wkg: (powerCurveAnalysis.key_powers['1_min'] / 70).toFixed(1),
                          })}</p>
                        </>
                      )}
                      {powerCurveAnalysis.rider_type === 'Kletterer' && (
                        <>
                          <p>{t('powerProfile.details.types.climber.desc')}</p>
                          <p className="text-primary">{t('powerProfile.details.types.climber.strength', {
                            watts: powerCurveAnalysis.key_powers['20_min'],
                            wkg: (powerCurveAnalysis.key_powers['20_min'] / 70).toFixed(1),
                          })}</p>
                        </>
                      )}
                      {powerCurveAnalysis.rider_type === 'Zeitfahrer' && (
                        <>
                          <p>{t('powerProfile.details.types.tt.desc')}</p>
                          <p className="text-primary">{t('powerProfile.details.types.tt.strength', {
                            watts: powerCurveAnalysis.key_powers['20_min'],
                            wkg: (powerCurveAnalysis.key_powers['20_min'] / 70).toFixed(1),
                          })}</p>
                        </>
                      )}
                      {powerCurveAnalysis.rider_type === 'Allrounder' && (
                        <>
                          <p>{t('powerProfile.details.types.allrounder.desc')}</p>
                          <p className="text-primary">{t('powerProfile.details.types.allrounder.strength', {
                            s5: powerCurveAnalysis.key_powers['5_sec'],
                            m1: powerCurveAnalysis.key_powers['1_min'],
                            m20: powerCurveAnalysis.key_powers['20_min'],
                          })}</p>
                        </>
                      )}
                      {powerCurveAnalysis.rider_type === 'Ausdauerspezialist' && (
                        <>
                          <p>{t('powerProfile.details.types.endurance.desc')}</p>
                          <p className="text-primary">{t('powerProfile.details.types.endurance.strength', {
                            watts: powerCurveAnalysis.key_powers['60_min'],
                            wkg: (powerCurveAnalysis.key_powers['60_min'] / 70).toFixed(1),
                          })}</p>
                        </>
                      )}
                      {!['Sprinter', 'Puncheur', 'Kletterer', 'Zeitfahrer', 'Allrounder', 'Ausdauerspezialist'].includes(powerCurveAnalysis.rider_type) && (
                        <p>{t('powerProfile.details.types.default')}</p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-3">
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{t('powerProfile.details.strengthsTitle')}</h4>
                    <div className="space-y-2 text-xs">
                      <div className={powerCurveAnalysis.strengths.sprint >= 70 ? 'text-primary font-semibold' : ''}>
                        <div className="flex justify-between items-center">
                          <span>{t('powerProfile.strengthLabels.sprint')}</span>
                          <span>{Math.round(powerCurveAnalysis.strengths.sprint)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>{t('powerProfile.details.yours', { watts: powerCurveAnalysis.key_powers['5_sec'], wkg: (powerCurveAnalysis.key_powers['5_sec'] / athleteWeight).toFixed(1) })}</span>
                          <span>{t('powerProfile.details.target', { watts: Math.round(20 * athleteWeight), wkg: '20' })}</span>
                        </div>
                      </div>
                      <div className={powerCurveAnalysis.strengths.punch >= 70 ? 'text-primary font-semibold' : ''}>
                        <div className="flex justify-between items-center">
                          <span>{t('powerProfile.strengthLabels.punch')}</span>
                          <span>{Math.round(powerCurveAnalysis.strengths.punch)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>{t('powerProfile.details.yours', { watts: powerCurveAnalysis.key_powers['1_min'], wkg: (powerCurveAnalysis.key_powers['1_min'] / athleteWeight).toFixed(1) })}</span>
                          <span>{t('powerProfile.details.target', { watts: Math.round(6.4 * athleteWeight), wkg: '6.4' })}</span>
                        </div>
                      </div>
                      <div className={powerCurveAnalysis.strengths.climbing >= 70 ? 'text-primary font-semibold' : ''}>
                        <div className="flex justify-between items-center">
                          <span>{t('powerProfile.strengthLabels.climbing')}</span>
                          <span>{Math.round(powerCurveAnalysis.strengths.climbing)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>{t('powerProfile.details.yours', { watts: powerCurveAnalysis.key_powers['5_min'], wkg: (powerCurveAnalysis.key_powers['5_min'] / athleteWeight).toFixed(1) })}</span>
                          <span>{t('powerProfile.details.target', { watts: Math.round(6.0 * athleteWeight), wkg: '6.0' })}</span>
                        </div>
                      </div>
                      <div className={powerCurveAnalysis.strengths.time_trial >= 70 ? 'text-primary font-semibold' : ''}>
                        <div className="flex justify-between items-center">
                          <span>{t('powerProfile.strengthLabels.timeTrial')}</span>
                          <span>{Math.round(powerCurveAnalysis.strengths.time_trial)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>{t('powerProfile.details.yours', { watts: powerCurveAnalysis.key_powers['20_min'], wkg: (powerCurveAnalysis.key_powers['20_min'] / athleteWeight).toFixed(1) })}</span>
                          <span>{t('powerProfile.details.target', { watts: Math.round(5.6 * athleteWeight), wkg: '5.6' })}</span>
                        </div>
                      </div>
                      <div className={powerCurveAnalysis.strengths.endurance >= 70 ? 'text-primary font-semibold' : ''}>
                        <div className="flex justify-between items-center">
                          <span>{t('powerProfile.strengthLabels.endurance')}</span>
                          <span>{Math.round(powerCurveAnalysis.strengths.endurance)}%</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>{t('powerProfile.details.yours', { watts: powerCurveAnalysis.key_powers['60_min'], wkg: (powerCurveAnalysis.key_powers['60_min'] / athleteWeight).toFixed(1) })}</span>
                          <span>{t('powerProfile.details.target', { watts: Math.round(5.2 * athleteWeight), wkg: '5.2' })}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 italic">
                      {t('powerProfile.details.strengthNote')}
                    </p>
                  </div>

                  <div className="border-t border-border/50 pt-3">
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground">{t('powerProfile.details.benchmarksTitle')}</h4>
                    <div className="space-y-1 text-xs">
                      <div className="grid grid-cols-4 gap-2 font-medium text-muted-foreground border-b border-border pb-1">
                        <span>{t('powerProfile.details.benchmarks.category')}</span>
                        <span className="text-right">5s</span>
                        <span className="text-right">1min</span>
                        <span className="text-right">20min</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <span className="font-medium">{t('powerProfile.details.benchmarks.worldClass')}</span>
                        <span className="text-right">24+</span>
                        <span className="text-right">7.5+</span>
                        <span className="text-right">6.4+</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <span className="font-medium">{t('powerProfile.details.benchmarks.excellent')}</span>
                        <span className="text-right">20-24</span>
                        <span className="text-right">6.4-7.5</span>
                        <span className="text-right">5.6-6.4</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <span className="font-medium">{t('powerProfile.details.benchmarks.veryGood')}</span>
                        <span className="text-right">17-20</span>
                        <span className="text-right">5.6-6.4</span>
                        <span className="text-right">5.1-5.6</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <span className="font-medium">{t('powerProfile.details.benchmarks.good')}</span>
                        <span className="text-right">15-17</span>
                        <span className="text-right">5.1-5.6</span>
                        <span className="text-right">4.8-5.1</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <span className="font-medium">{t('powerProfile.details.benchmarks.average')}</span>
                        <span className="text-right">13-15</span>
                        <span className="text-right">4.5-5.1</span>
                        <span className="text-right">4.0-4.8</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 italic">
                      {t('powerProfile.details.benchmarksNote')}
                    </p>
                  </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <div className="animate-pulse text-muted-foreground mb-2">{t('powerProfile.riderType.loading')}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* FTP and Power Zones */}
        {ftpData && (
          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              {t('powerProfile.ftp.title')}
            </CardTitle>
            <CardDescription>
              {ftpData.ftp_source === 'manual'
                ? t('powerProfile.ftp.source.manual')
                : ftpData.ftp_source === 'estimated_60min'
                  ? t('powerProfile.ftp.source.estimated60')
                  : t('powerProfile.ftp.source.estimated20')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* FTP Value */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl p-4 border border-blue-500/30 flex-1">
                    <p className="text-xs text-muted-foreground mb-1">{t('powerProfile.ftp.label')}</p>
                    {editingFTP ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={ftpInput}
                          onChange={(e) => setFtpInput(e.target.value)}
                          className="w-24 px-2 py-1 rounded border bg-background text-2xl font-bold"
                          placeholder={String(ftpData.ftp || 0)}
                        />
                        <span className="text-xl">{t('powerProfile.units.watt')}</span>
                        <button
                          onClick={() => {
                            if (ftpInput) ftpMutation.mutate(ftpInput)
                          }}
                          disabled={ftpMutation.isPending}
                          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                          {t('common.save')}
                        </button>
                        <button
                          onClick={() => setEditingFTP(false)}
                          className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <button
                          onClick={() => {
                            setFtpInput(String(ftpData.ftp || 0))
                            setEditingFTP(true)
                          }}
                          className="text-3xl font-bold text-blue-500 hover:text-blue-400 transition-colors"
                        >
                          {ftpData.ftp || t('common.notAvailable')}
                        </button>
                        <span className="text-xl text-muted-foreground">{t('powerProfile.units.watt')}</span>
                        {ftpData.ftp_wkg && (
                          <span className="text-sm text-muted-foreground ml-2">
                            ({formatWattPerKg(ftpData.ftp_wkg)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Estimates - side by side */}
                <div className="flex gap-3 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3 flex-1">
                    <p className="text-xs text-muted-foreground">{t('powerProfile.ftp.estimates.min20')}</p>
                    <p className="font-semibold">{formatWattCompact(ftpData.estimates.from_20min)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 flex-1">
                    <p className="text-xs text-muted-foreground">{t('powerProfile.ftp.estimates.min60')}</p>
                    <p className="font-semibold">{formatWattCompact(ftpData.estimates.from_60min)}</p>
                  </div>
                </div>
              </div>

              {/* Power Zones */}
              <div className="space-y-2">
                <p className="text-sm font-medium mb-3">{t('powerProfile.ftp.zonesTitle')}</p>
                {ftpData.zones.map((zone) => (
                  <div key={zone.zone} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: zone.color }}
                    />
                    <span className="w-6 text-xs font-medium">{t('powerProfile.ftp.zoneLabel', { zone: zone.zone })}</span>
                    <span className="flex-1 text-sm">{zone.name}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {t('powerProfile.ftp.zoneRange', {
                        min: zone.min,
                        max: zone.max ?? t('powerProfile.units.infinity'),
                        unit: t('powerProfile.units.watt'),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* All-Time Best Power integrated below */}
            {allTimeData && allTimeData.durations && allTimeData.durations.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  <h3 className="text-sm font-medium">{t('powerProfile.allTime.title')}</h3>
                  <span className="text-xs text-muted-foreground">
                    {t('powerProfile.allTime.subtitle', { count: allTimeData.activities_analyzed, weight: allTimeData.athlete_weight })}
                  </span>
                </div>
                <div className="space-y-3">
                  {/* First row - 7 items */}
                  <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3">
                    {allTimeData.durations.slice(0, 7).map((d) => (
                      <Link
                        key={d.label}
                        to={d.activity_id ? `/activity/${d.activity_id}` : '#'}
                        className={`block ${d.activity_id ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                      >
                        <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg p-2.5 text-center border border-yellow-500/30">
                          <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{d.label}</p>
                          <p className="text-lg font-bold text-yellow-500 leading-tight">{formatWattCompact(d.watts)}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatWattPerKg(d.watts_per_kg?.toFixed(2) || ((d.watts || 0) / athleteWeight).toFixed(2))}
                          </p>
                          {d.activity_date && (
                            <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                              {formatActivityDate(d.activity_date)}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                  {/* Second row - remaining items (6 items if 13 total) */}
                  {allTimeData.durations.length > 7 && (
                    <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                      {allTimeData.durations.slice(7).map((d) => (
                        <Link
                          key={d.label}
                          to={d.activity_id ? `/activity/${d.activity_id}` : '#'}
                          className={`block ${d.activity_id ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                        >
                          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg p-2.5 text-center border border-yellow-500/30">
                            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{d.label}</p>
                            <p className="text-lg font-bold text-yellow-500 leading-tight">{formatWattCompact(d.watts)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatWattPerKg(d.watts_per_kg?.toFixed(2) || ((d.watts || 0) / athleteWeight).toFixed(2))}
                            </p>
                            {d.activity_date && (
                              <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                                {formatActivityDate(d.activity_date)}
                              </p>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">{t('powerProfile.loading')}</p>
        </div>
      ) : (
        <>
          {/* Cache Not Available Message */}
          {allTimeData && !allTimeData.cached && (
            <Card>
              <CardContent className="py-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-muted-foreground opacity-50">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <h3 className="text-lg font-medium mb-2">{t('powerProfile.cache.notGeneratedTitle')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('powerProfile.cache.notGeneratedHint')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Yearly Power Curve Comparison Chart */}
          {yearlyData && yearlyData.years.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('powerProfile.yearlyComparison.title')}</CardTitle>
                <CardDescription>
                  {t('powerProfile.yearlyComparison.subtitle', { count: MAX_YEARS_COMPARE })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Year Selection Checkboxes */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {yearlyData.years.map((year, idx) => {
                    const isSelected = selectedYears.includes(year.year)
                    const isDisabled = !isSelected && selectedYears.length >= MAX_YEARS_COMPARE
                    const color = getYearColor(year.year, idx)

                    return (
                      <button
                        key={year.year}
                        onClick={() => toggleYear(year.year)}
                        disabled={isDisabled}
                        className={`
                          flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all
                          ${isSelected
                            ? 'border-2'
                            : 'border-muted hover:border-muted-foreground/50'
                          }
                          ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                        style={{
                          borderColor: isSelected ? color : undefined,
                          backgroundColor: isSelected ? `${color}20` : undefined,
                        }}
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className={isSelected ? 'font-medium' : ''}>
                          {year.year}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({year.activities})
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Power Curve Chart with Logarithmic X-axis */}
                {selectedYears.length > 0 || allTimeData?.durations ? (
                  <ResponsiveContainer width="100%" height={600} className="min-h-[500px]">
                    <LineChart data={powerCurveData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                      <XAxis
                        dataKey="duration"
                        stroke={chartColors.text}
                        fontSize={11}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tick={{ fontSize: 10 }}
                      >
                        <Label
                          value={t('powerProfile.chart.duration')}
                          position="bottom"
                          offset={35}
                          style={{ fill: chartColors.text, fontSize: 13, fontWeight: 500 }}
                        />
                      </XAxis>
                      <YAxis
                        stroke={chartColors.text}
                        fontSize={12}
                        tickFormatter={(v) => `${v}`}
                        domain={yAxisDomain as [number, number | string]}
                        width={60}
                      >
                        <Label
                          value={t('powerProfile.chart.power')}
                          angle={-90}
                          position="insideLeft"
                          offset={5}
                          style={{ fill: chartColors.text, fontSize: 13, fontWeight: 500, textAnchor: 'middle' }}
                        />
                      </YAxis>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                          border: `1px solid ${chartColors.grid}`,
                          borderRadius: '8px',
                        }}
                        formatter={(value, name) => {
                          if (typeof value === 'number') {
                            const wpkg = value / athleteWeight
                            return [t('powerProfile.chart.tooltipValue', {
                              watts: formatWattCompact(value),
                              wkg: formatWattPerKg(wpkg.toFixed(2)),
                            }), name]
                          }
                          return [String(value), name]
                        }}
                        labelFormatter={(label) => t('powerProfile.chart.durationLabel', { value: label })}
                      />
                      <Legend verticalAlign="top" height={36} />

                      {/* All-Time Best curve (always shown, dashed gold line) */}
                      {allTimeData?.durations && allTimeData.durations.length > 0 && (
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
                      )}

                      {/* Yearly curves */}
                      {selectedYears.map((year, idx) => (
                        <Line
                          key={year}
                          type="monotone"
                          dataKey={year.toString()}
                          name={year.toString()}
                          stroke={getYearColor(year, idx)}
                          strokeWidth={idx === 0 ? 2.5 : 2}
                          dot={{ r: idx === 0 ? 4 : 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    {t('powerProfile.yearlyComparison.selectPrompt')}
                  </div>
                )}

                <p className="text-xs text-muted-foreground mt-4 text-center">
                  {t('powerProfile.yearlyComparison.note')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Year by Year Table */}
          {yearlyData && yearlyData.years.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('powerProfile.yearlyTable.title')}</CardTitle>
                <CardDescription>
                  {t('powerProfile.yearlyTable.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium">{t('records.yearOverYear.table.year')}</th>
                        <th className="text-right p-3 font-medium">{t('records.yearOverYear.table.activities')}</th>
                        {yearlyData.durations.map((d) => (
                          <th key={d} className="text-right p-3 font-medium">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyData.years.map((year, idx) => (
                        <tr key={year.year} className="border-b hover:bg-muted/50">
                          <td className="p-3 font-medium">
                            <span
                              className="inline-block w-3 h-3 rounded-full mr-2"
                              style={{ backgroundColor: getYearColor(year.year, idx) }}
                            />
                            {year.year}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {year.activities}
                          </td>
                          {yearlyData.durations.map((d) => {
                            const value = year[d as keyof YearlyPowerCurveEntry]
                            const isMax = yearlyData.years.every(
                              (y) => (y[d as keyof YearlyPowerCurveEntry] || 0) <= (value || 0)
                            )
                            return (
                              <td
                                key={d}
                                className={`p-3 text-right ${isMax && value ? 'font-bold text-yellow-500' : ''}`}
                              >
                                {value || t('common.notAvailable')}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Durations Bar Chart */}
          {barChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('powerProfile.keyDurations.title')}</CardTitle>
                <CardDescription>
                  {t('powerProfile.keyDurations.subtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                    <XAxis dataKey="year" stroke={chartColors.text} fontSize={12} />
                    <YAxis stroke={chartColors.text} fontSize={12} tickFormatter={(v) => formatWattCompact(v)} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
                        border: `1px solid ${chartColors.grid}`,
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="5s" name={t('powerProfile.keyDurations.labels.s5')} fill="#ef4444" />
                    <Bar dataKey="1min" name={t('powerProfile.keyDurations.labels.m1')} fill="#f59e0b" />
                    <Bar dataKey="5min" name={t('powerProfile.keyDurations.labels.m5')} fill="#22c55e" />
                    <Bar dataKey="20min" name={t('powerProfile.keyDurations.labels.m20')} fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* No Data Message - only show if cache is populated but empty */}
          {yearlyData?.cached && yearlyData.years.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 text-muted-foreground opacity-50">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <h3 className="text-lg font-medium mb-2">{t('powerProfile.empty.title')}</h3>
                <p className="text-muted-foreground">
                  {t('powerProfile.empty.subtitle')}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
