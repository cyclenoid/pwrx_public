import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { useTheme } from '../ThemeProvider'
import { getChartColors } from '../../lib/chartTheme'
import type { DailyTrainingLoad } from '../../types/activity'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Info, TrendingUp, Activity, Calendar, Target } from 'lucide-react'

interface TrainingLoadChartProps {
  data: DailyTrainingLoad[]
  currentCTL: number
  currentATL: number
  currentTSB: number
}

export function TrainingLoadChart({ data, currentCTL, currentATL, currentTSB }: TrainingLoadChartProps) {
  const { resolvedTheme } = useTheme()
  const colors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')
  const [showExplanation, setShowExplanation] = useState(false)
  const [showAllRecommendations, setShowAllRecommendations] = useState(false)

  const orderedData = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  )

  const toLoadArray = (input: DailyTrainingLoad[]): number[] =>
    input.map((item) => (Number.isFinite(item.tss) ? item.tss : 0))

  const mean = (values: number[]): number =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

  const stdDev = (values: number[]): number => {
    if (values.length === 0) return 0
    const avg = mean(values)
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  const median = (values: number[]): number | null => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2
    }
    return sorted[mid]
  }

  // Format data for chart
  const chartData = useMemo(() => {
    return orderedData.map(item => ({
      ...item,
      dateFormatted: format(parseISO(item.date), 'dd MMM', { locale: de }),
    }))
  }, [orderedData])

  const ctlLineColor = colors.primary
  const atlLineColor = colors.textMuted
  const tsbLineColor = colors.accent1

  const toRgba = (hex: string, alpha: number) => {
    const clean = hex.replace('#', '')
    if (clean.length !== 6) return hex
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const getTSBStatus = (tsb: number) => {
    if (tsb > 25) return { label: 'Sehr frisch', color: colors.info }
    if (tsb > 5) return { label: 'Optimal', color: colors.success }
    if (tsb >= -10) return { label: 'Neutral', color: colors.textMuted }
    if (tsb >= -30) return { label: 'Ermüdet', color: colors.warning }
    return { label: 'Stark ermüdet', color: colors.danger }
  }

  const tsbStatus = getTSBStatus(currentTSB)

  const acwrMetrics = useMemo(() => {
    const loads = toLoadArray(orderedData)
    if (loads.length < 28) return null

    const acuteWindow = loads.slice(-7)
    const chronicWindow = loads.slice(-28)
    const acuteAvg = mean(acuteWindow)
    const chronicAvg = mean(chronicWindow)
    if (chronicAvg <= 0) return null

    const value = acuteAvg / chronicAvg

    if (value < 0.8) {
      return { value, label: 'Unterlast', color: colors.info, hint: '7d/28d' }
    }
    if (value <= 1.3) {
      return { value, label: 'Im Ziel', color: colors.success, hint: '7d/28d' }
    }
    if (value <= 1.5) {
      return { value, label: 'Erhöht', color: colors.warning, hint: '7d/28d' }
    }
    return { value, label: 'Hoch', color: colors.danger, hint: '7d/28d' }
  }, [orderedData, colors.danger, colors.info, colors.success, colors.warning])

  const monotonyStrainMetrics = useMemo(() => {
    const loads = toLoadArray(orderedData)
    if (loads.length < 7) return null

    const windows: Array<{ monotony: number; strain: number; weeklyLoad: number }> = []
    for (let end = 6; end < loads.length; end += 1) {
      const week = loads.slice(end - 6, end + 1)
      const weeklyLoad = week.reduce((sum, value) => sum + value, 0)
      const sd = stdDev(week)
      if (sd <= 0) continue
      const monotony = mean(week) / sd
      if (!Number.isFinite(monotony)) continue
      const strain = weeklyLoad * monotony
      if (!Number.isFinite(strain)) continue
      windows.push({ monotony, strain, weeklyLoad })
    }

    if (windows.length === 0) return null
    const current = windows[windows.length - 1]
    const baseline = median(windows.slice(0, -1).map((entry) => entry.strain))
    const ratio = baseline && baseline > 0 ? current.strain / baseline : null

    let label = 'Variiert'
    let color = colors.success
    if (current.monotony > 2.0) {
      label = 'Monoton hoch'
      color = colors.warning
    } else if (current.monotony >= 1.5) {
      label = 'Monoton mittel'
      color = colors.textMuted
    }

    if (ratio !== null && ratio > 1.5) {
      label = 'Strain hoch'
      color = colors.danger
    } else if (ratio !== null && ratio > 1.2 && label === 'Variiert') {
      label = 'Strain erhöht'
      color = colors.warning
    }

    let strainBandLabel = 'ohne Basis'
    let strainBandColor = colors.textMuted
    if (ratio !== null) {
      if (ratio < 0.8) {
        strainBandLabel = 'unter Basis'
        strainBandColor = colors.info
      } else if (ratio <= 1.2) {
        strainBandLabel = 'im Rahmen'
        strainBandColor = colors.success
      } else if (ratio <= 1.5) {
        strainBandLabel = 'erhoeht'
        strainBandColor = colors.warning
      } else {
        strainBandLabel = 'deutlich erhoeht'
        strainBandColor = colors.danger
      }
    }

    return {
      monotony: current.monotony,
      strain: current.strain,
      strainRatio: ratio,
      baselineStrain: baseline,
      strainBandLabel,
      strainBandColor,
      label,
      color,
      hint: ratio !== null ? `Wochen-Strain ${ratio.toFixed(2)}x vs. Basis` : 'Wochen-Strain ohne Basis',
    }
  }, [orderedData, colors.danger, colors.info, colors.success, colors.textMuted, colors.warning])

  // Generate training recommendations based on PMC values
  const getTrainingRecommendations = useMemo(() => {
    const ctlWeeklyChange = orderedData.length >= 7
      ? ((currentCTL - orderedData[orderedData.length - 7].ctl) / orderedData[orderedData.length - 7].ctl) * 100
      : 0
    const recommendations: Array<{ type: 'info' | 'warning' | 'success' | 'tip'; title: string; text: string; icon: any }> = []

    // TSB-based recommendations (Form)
    if (currentTSB > 25) {
      recommendations.push({
        type: 'warning',
        title: 'Sehr ausgeruht - Fitness-Abbau droht',
        text: 'Dein TSB ist sehr hoch (>25). Du bist zwar ausgeruht, aber wenn du zu lange pausierst, verlierst du Fitness (CTL sinkt). Baue moderate Trainingseinheiten ein, um CTL zu halten.',
        icon: Info
      })
    } else if (currentTSB >= 5 && currentTSB <= 25) {
      recommendations.push({
        type: 'success',
        title: 'Optimale Form für Wettkämpfe',
        text: 'Dein TSB liegt im idealen Bereich (5-25). Du bist ausgeruht und in guter Form. Perfekt für wichtige Rennen oder harte Trainingseinheiten!',
        icon: Target
      })
    } else if (currentTSB >= -10 && currentTSB < 5) {
      recommendations.push({
        type: 'info',
        title: 'Ausgeglichene Form',
        text: 'Dein TSB ist neutral (-10 bis 5). Du trainierst im optimalen Bereich für kontinuierlichen Fitness-Aufbau. Halte dieses Niveau für langfristigen Fortschritt.',
        icon: Activity
      })
    } else if (currentTSB >= -30 && currentTSB < -10) {
      recommendations.push({
        type: 'warning',
        title: 'Ermüdet - Erholung empfohlen',
        text: 'Dein TSB ist negativ (-30 bis -10), was auf Ermüdung hinweist. Plane 2-3 lockere oder Ruhetage ein, um TSB steigen zu lassen. Vermeide harte Intervalle.',
        icon: Calendar
      })
    } else if (currentTSB < -30) {
      recommendations.push({
        type: 'warning',
        title: 'Stark ermüdet - Erholung notwendig',
        text: 'Dein TSB ist sehr negativ (<-30). Hohes Übertrainings-Risiko! Nimm 3-5 Tage komplette Ruhe oder nur sehr lockeres Training (Zone 1-2). Schlaf und Ernährung priorisieren.',
        icon: Info
      })
    }

    // CTL-based recommendations (Fitness)
    if (ctlWeeklyChange > 8) {
      recommendations.push({
        type: 'warning',
        title: 'CTL steigt zu schnell',
        text: `Deine Fitness (CTL) steigt um ${ctlWeeklyChange.toFixed(1)}%/Woche. Faustregel: Max. 5-8% pro Woche, sonst Verletzungsrisiko! Reduziere das Trainingsvolumen leicht.`,
        icon: TrendingUp
      })
    } else if (ctlWeeklyChange < -5) {
      recommendations.push({
        type: 'info',
        title: 'CTL sinkt',
        text: `Deine Fitness (CTL) sinkt (${ctlWeeklyChange.toFixed(1)}%/Woche). Wenn geplant (Taper/Pause), ist das OK. Sonst: Erhöhe Trainingsumfang leicht, um Fitness zu halten.`,
        icon: TrendingUp
      })
    } else if (ctlWeeklyChange >= 3 && ctlWeeklyChange <= 8) {
      recommendations.push({
        type: 'success',
        title: 'Optimaler Fitness-Aufbau',
        text: `Deine Fitness (CTL) steigt um ${ctlWeeklyChange.toFixed(1)}%/Woche. Das ist ideal! Halte diesen Aufbaurhythmus bei.`,
        icon: TrendingUp
      })
    }

    // ATL vs CTL ratio
    const rampRate = currentCTL > 0 ? currentATL / currentCTL : 0
    if (rampRate > 1.5) {
      recommendations.push({
        type: 'warning',
        title: 'Akute Belastung zu hoch',
        text: 'Deine kurzfristige Belastung (ATL) ist sehr hoch im Verhältnis zur Fitness (CTL). Risiko für Übertraining. Plane einen Erholungstag ein.',
        icon: Activity
      })
    }

    // Practical training tips based on current state
    if (currentTSB < 5) {
      recommendations.push({
        type: 'tip',
        title: 'Trainingsempfehlung',
        text: 'Fokus auf Regeneration: Lockere GA1-Einheiten (Zone 2), Mobility, Schlaf 8+ Stunden. Vermeide Intervalle oder harte Anstiege.',
        icon: Calendar
      })
    } else if (currentTSB >= 5 && currentTSB <= 15) {
      recommendations.push({
        type: 'tip',
        title: 'Trainingsempfehlung',
        text: 'Guter Zeitpunkt für Quality-Sessions: VO2max-Intervalle, Schwellentraining oder lange Grundlageneinheiten. Dein Körper kann die Belastung gut verkraften.',
        icon: Target
      })
    } else {
      recommendations.push({
        type: 'tip',
        title: 'Trainingsempfehlung',
        text: 'Du bist sehr ausgeruht. Entweder einen Wettkampf planen oder mit moderatem Training beginnen, um Fitness zu erhalten.',
        icon: Calendar
      })
    }

    return recommendations
  }, [currentCTL, currentATL, currentTSB, orderedData])

  const prioritizedRecommendations = useMemo(() => {
    const severity: Record<'warning' | 'info' | 'success' | 'tip', number> = {
      warning: 0,
      info: 1,
      success: 2,
      tip: 3,
    }
    return [...getTrainingRecommendations].sort((a, b) => severity[a.type] - severity[b.type])
  }, [getTrainingRecommendations])

  const visibleRecommendations = showAllRecommendations
    ? prioritizedRecommendations
    : prioritizedRecommendations.slice(0, 3)

  const toCompactText = (text: string) => {
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text
    if (firstSentence.length <= 140) return firstSentence
    return `${firstSentence.slice(0, 137)}...`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training Load (PMC)</CardTitle>
        <CardDescription>
          Performance Management Chart - Visualisierung deiner Trainingsbelastung, Fitness und Form
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Current Values */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CTL (Fitness)</p>
            <p className="text-2xl font-bold" style={{ color: ctlLineColor }}>
              {currentCTL.toFixed(1)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">42-day average</p>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">ATL (Fatigue)</p>
            <p className="text-2xl font-bold" style={{ color: atlLineColor }}>
              {currentATL.toFixed(1)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">7-day average</p>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">TSB (Form)</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-2xl font-bold" style={{ color: tsbLineColor }}>
                {currentTSB > 0 ? '+' : ''}{currentTSB.toFixed(1)}
              </p>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border"
                style={{
                  color: tsbStatus.color,
                  borderColor: tsbStatus.color,
                  backgroundColor: toRgba(tsbStatus.color, 0.12),
                }}
              >
                {tsbStatus.label}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">CTL - ATL</p>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
              <span>ACWR</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-primary/40 text-primary">NEU</span>
            </p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-2xl font-bold" style={{ color: acwrMetrics?.color || colors.textMuted }}>
                {acwrMetrics ? acwrMetrics.value.toFixed(2) : '—'}
              </p>
              {acwrMetrics && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full border"
                  style={{
                    color: acwrMetrics.color,
                    borderColor: acwrMetrics.color,
                    backgroundColor: toRgba(acwrMetrics.color, 0.12),
                  }}
                >
                  {acwrMetrics.label}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{acwrMetrics?.hint || 'mind. 28 Tage nötig'}</p>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
              <span>Monotony / Strain</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-primary/40 text-primary">NEU</span>
            </p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-xl font-bold" style={{ color: monotonyStrainMetrics?.color || colors.textMuted }}>
                {monotonyStrainMetrics ? monotonyStrainMetrics.monotony.toFixed(2) : '—'}
              </p>
              {monotonyStrainMetrics && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full border"
                  style={{
                    color: monotonyStrainMetrics.color,
                    borderColor: monotonyStrainMetrics.color,
                    backgroundColor: toRgba(monotonyStrainMetrics.color, 0.12),
                  }}
                >
                  {monotonyStrainMetrics.label}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {monotonyStrainMetrics
                ? `Strain ${Math.round(monotonyStrainMetrics.strain)} · ${monotonyStrainMetrics.strainBandLabel}`
                : 'mind. 7 Tage nötig'}
            </p>
            {monotonyStrainMetrics && monotonyStrainMetrics.strainRatio !== null && (
              <p
                className="text-[10px] mt-1"
                style={{ color: monotonyStrainMetrics.strainBandColor }}
              >
                {`${monotonyStrainMetrics.strainRatio.toFixed(2)}x deiner Basis`}
              </p>
            )}
          </div>
        </div>
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">ACWR</strong> vergleicht die letzten 7 Tage mit den letzten 28 Tagen.
                Grob gilt: <strong className="text-foreground">0.8-1.3</strong> meist stabil, deutlich darueber erhoehtes Belastungsrisiko.
              </p>
              <p>
                <strong className="text-foreground">Monotony / Strain</strong> zeigt, wie gleichfoermig und wie hoch deine Wochenbelastung ist.
                Hohe Monotony plus hoher Strain bedeutet oft zu wenig Variation.
              </p>
              <p>
                Einordnung Strain ueber deine Historie: <strong className="text-foreground">&lt;0.8x</strong> unter Basis,
                <strong className="text-foreground"> 0.8-1.2x</strong> im Rahmen, <strong className="text-foreground"> 1.2-1.5x</strong> erhoeht,
                <strong className="text-foreground"> &gt;1.5x</strong> deutlich erhoeht.
              </p>
              <p>
                Tipp: In <strong className="text-foreground">Settings &gt; Personal &gt; Koerperdaten & Leistung</strong>
                sollten FTP und Koerpergewicht sauber gepflegt sein.
              </p>
            </div>
            <Link
              to="/settings?tab=personal"
              className="inline-flex h-8 items-center justify-center rounded-md border border-primary/30 bg-background/70 px-3 text-xs font-medium text-foreground hover:bg-background"
            >
              Zu FTP & Gewicht
            </Link>
          </div>
        </div>

        {/* Training Recommendations */}
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Info size={16} className="text-primary" />
              Trainingshinweise
            </h4>
            {prioritizedRecommendations.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllRecommendations((prev) => !prev)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAllRecommendations ? 'Kompakt anzeigen' : `Alle anzeigen (${prioritizedRecommendations.length})`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {visibleRecommendations.map((rec, index) => {
              const Icon = rec.icon
              const bgColor = rec.type === 'success' ? 'bg-green-500/10 border-green-500/30' :
                             rec.type === 'warning' ? 'bg-orange-500/10 border-orange-500/30' :
                             rec.type === 'tip' ? 'bg-blue-500/10 border-blue-500/30' :
                             'bg-secondary/50 border-border/50'
              const iconColor = rec.type === 'success' ? 'text-green-500' :
                               rec.type === 'warning' ? 'text-orange-500' :
                               rec.type === 'tip' ? 'text-blue-500' :
                               'text-muted-foreground'

              return (
                <div key={index} className={`p-2.5 rounded-lg border h-full ${bgColor}`}>
                  <div className="flex items-start gap-3">
                    <Icon size={16} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold leading-tight">{rec.title}</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {showAllRecommendations ? rec.text : toCompactText(rec.text)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="dateFormatted"
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fill: colors.axis, fontSize: 12 }}
              label={{ value: 'Training Load', angle: -90, position: 'insideLeft', fill: colors.axis }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.background,
                border: `1px solid ${colors.grid}`,
                borderRadius: '8px',
                color: colors.text,
              }}
              labelStyle={{ color: colors.text, fontWeight: 'bold', marginBottom: '4px' }}
              formatter={(value: number | undefined) => value ? value.toFixed(1) : '0'}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
            />

            {/* Reference line at TSB = 0 */}
            <ReferenceLine y={0} stroke={colors.textMuted} strokeDasharray="3 3" />

            {/* Lines */}
            <Line
              type="monotone"
              dataKey="ctl"
              name="CTL (Fitness)"
              stroke={ctlLineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="atl"
              name="ATL (Fatigue)"
              stroke={atlLineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="tsb"
              name="TSB (Form)"
              stroke={tsbLineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* TSB Zones Legend */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.info }}></div>
            <span>Fresh (&gt;25)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.success }}></div>
            <span>Optimal (5-25)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.textMuted }}></div>
            <span>Neutral (-10-5)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.warning }}></div>
            <span>Fatigued (-30--10)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.danger }}></div>
            <span>Very Fatigued (&lt;-30)</span>
          </div>
        </div>

        {/* Explanation Section */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowExplanation((prev) => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showExplanation ? 'Erläuterungen ausblenden' : 'Erläuterungen anzeigen'}
          </button>
          {showExplanation && (
            <div className="mt-3 p-4 bg-secondary/30 rounded-lg space-y-3 text-sm">
              <div>
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  <span style={{ color: ctlLineColor }}>●</span> CTL (Chronic Training Load) - Fitness
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Exponentiell gewichteter Durchschnitt deines TSS über <strong>42 Tage</strong>.
                  Repräsentiert deine langfristige Ausdauerleistung und aerobe Kapazität.
                  Ein höherer CTL bedeutet bessere Grundlagenausdauer.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  <span style={{ color: atlLineColor }}>●</span> ATL (Acute Training Load) - Ermüdung
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Exponentiell gewichteter Durchschnitt deines TSS über <strong>7 Tage</strong>.
                  Zeigt deine kurzfristige Trainingsbelastung und aktuelle Ermüdung.
                  Steigt schnell bei intensivem Training und fällt bei Erholung.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  <span style={{ color: tsbLineColor }}>●</span> TSB (Training Stress Balance) - Form
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <strong>TSB = CTL - ATL</strong>. Indikator für deine aktuelle Form und Frische.
                  Positive Werte → ausgeruht, gut für Wettkämpfe.
                  Negative Werte → ermüdet, Fitness wird aufgebaut.
                  Optimal für Rennen: TSB zwischen +5 und +25.
                </p>
              </div>
              <div className="pt-2 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground italic">
                  <strong>Berechnung:</strong> Exponential Moving Average (EMA) mit k = 2/(n+1), wobei n die Zeitkonstante ist (CTL: 42, ATL: 7).
                  EMA<sub>heute</sub> = (TSS<sub>heute</sub> × k) + (EMA<sub>gestern</sub> × (1 - k))
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground italic">
                  <strong>ACWR:</strong> 7-Tage-Ø Load / 28-Tage-Ø Load. Zielbereich meist etwa 0.8 bis 1.3.
                  <br />
                  <strong>Monotony:</strong> 7-Tage-Ø Load / Standardabweichung der 7 Tage.
                  <br />
                  <strong>Strain:</strong> Wochenload × Monotony.
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
