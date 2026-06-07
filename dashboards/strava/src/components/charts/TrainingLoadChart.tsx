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
  scopeLabel?: string
  sourceSummary?: {
    totalTss: number
    powerTss: number
    heartRateTss: number
    activityCount: number
    powerActivityCount: number
    heartRateActivityCount: number
    missingActivityCount: number
    powerTssPercentage: number
    heartRateTssPercentage: number
    heartRateBasis: 'lthr' | 'hrr_estimate' | 'max_hr_estimate' | null
    thresholdHrUsed: number | null
    maxHrUsed: number | null
    restingHrUsed: number | null
  }
}

interface MetricGaugeCardProps {
  title: string
  shortName: string
  value: string
  status: string
  description: string
  detail: string
  color: string
  progress: number
  rangeLabel: string
}

function MetricGaugeCard({
  title,
  shortName,
  value,
  status,
  description,
  detail,
  color,
  progress,
  rangeLabel,
}: MetricGaugeCardProps) {
  const safeProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold leading-tight">{title} ({shortName})</div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
          style={{
            color,
            borderColor: color,
            backgroundColor: `${color}1f`,
          }}
        >
          {status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[7.5rem_1fr] items-center gap-3">
        <div className="relative h-[4.75rem] w-[7.5rem]">
          <svg viewBox="0 0 120 76" className="h-full w-full">
            <path
              d="M 16 62 A 44 44 0 0 1 104 62"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              className="text-muted-foreground/20"
              pathLength={100}
            />
            <path
              d="M 16 62 A 44 44 0 0 1 104 62"
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${safeProgress * 100} 100`}
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <div className="text-2xl font-bold tabular-nums">{value}</div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">{detail}</div>
          <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{rangeLabel}</div>
        </div>
      </div>
    </div>
  )
}

export function TrainingLoadChart({ data, currentCTL, currentATL, currentTSB, scopeLabel, sourceSummary }: TrainingLoadChartProps) {
  const { resolvedTheme } = useTheme()
  const colors = getChartColors(resolvedTheme === 'dark' ? 'dark' : 'light')
  const [showExplanation, setShowExplanation] = useState(false)

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

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

  const formatSigned = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`

  const getTSBStatus = (tsb: number) => {
    if (tsb > 25) return { label: 'Sehr frisch', color: colors.info }
    if (tsb > 5) return { label: 'Optimal', color: colors.success }
    if (tsb >= -10) return { label: 'Neutral', color: colors.textMuted }
    if (tsb >= -30) return { label: 'Ermüdet', color: colors.warning }
    return { label: 'Stark ermüdet', color: colors.danger }
  }

  const tsbStatus = getTSBStatus(currentTSB)

  const ctlWeeklyChange = useMemo(() => {
    if (orderedData.length < 7) return null
    const previousCtl = orderedData[orderedData.length - 7]?.ctl
    if (!previousCtl || previousCtl <= 0) return null
    return ((currentCTL - previousCtl) / previousCtl) * 100
  }, [currentCTL, orderedData])

  const ctlGauge = useMemo(() => {
    const historicalMax = Math.max(...orderedData.map((item) => item.ctl), currentCTL, 1)
    const progress = clamp(currentCTL / Math.max(40, historicalMax * 1.15), 0, 1)

    if (ctlWeeklyChange === null) {
      return {
        progress,
        status: 'Basis',
        color: colors.textMuted,
        detail: 'Noch kein stabiler 7-Tage-Trend.',
      }
    }
    if (ctlWeeklyChange > 8) {
      return {
        progress,
        status: 'Zu schnell',
        color: colors.warning,
        detail: `Fitness steigt ${formatSigned(ctlWeeklyChange)}% in 7 Tagen.`,
      }
    }
    if (ctlWeeklyChange >= 3) {
      return {
        progress,
        status: 'Aufbau',
        color: colors.success,
        detail: `Kontrollierter Aufbau: ${formatSigned(ctlWeeklyChange)}% in 7 Tagen.`,
      }
    }
    if (ctlWeeklyChange < -5) {
      return {
        progress,
        status: 'Sinkt',
        color: colors.info,
        detail: `Fitness faellt ${formatSigned(ctlWeeklyChange)}% in 7 Tagen.`,
      }
    }
    return {
      progress,
      status: 'Stabil',
      color: colors.success,
      detail: `Nahe am aktuellen Niveau: ${formatSigned(ctlWeeklyChange)}% in 7 Tagen.`,
    }
  }, [orderedData, currentCTL, ctlWeeklyChange, colors.info, colors.success, colors.textMuted, colors.warning])

  const atlGauge = useMemo(() => {
    const ratio = currentCTL > 0 ? currentATL / currentCTL : 0
    const progress = clamp((ratio - 0.45) / 1.15, 0, 1)

    if (currentCTL <= 0) {
      return {
        progress: 0,
        status: 'Basis',
        color: colors.textMuted,
        detail: 'Noch keine belastbare Relation zur Fitness.',
      }
    }
    if (ratio > 1.45) {
      return {
        progress,
        status: 'Hoch',
        color: colors.danger,
        detail: `Akute Last liegt bei ${ratio.toFixed(2)}x deiner Fitness.`,
      }
    }
    if (ratio > 1.15) {
      return {
        progress,
        status: 'Aufbau',
        color: colors.warning,
        detail: `Mehr Belastung als Basis: ${ratio.toFixed(2)}x Fitness.`,
      }
    }
    if (ratio >= 0.8) {
      return {
        progress,
        status: 'Stabil',
        color: colors.success,
        detail: `Akute Last passt zur Fitness: ${ratio.toFixed(2)}x.`,
      }
    }
    return {
      progress,
      status: 'Locker',
      color: colors.info,
      detail: `Aktuell eher entlastet: ${ratio.toFixed(2)}x Fitness.`,
    }
  }, [currentATL, currentCTL, colors.danger, colors.info, colors.success, colors.textMuted, colors.warning])

  const tsbGauge = {
    progress: clamp((currentTSB + 30) / 55, 0, 1),
    status: tsbStatus.label,
    color: tsbStatus.color,
    detail: currentTSB > 25
      ? 'Sehr viel Frische, aber laengere Pause kann Fitness kosten.'
      : currentTSB > 5
        ? 'Gute Frische fuer harte Einheiten oder Wettkampf.'
        : currentTSB >= -10
          ? 'Ausgeglichen: Aufbau ohne starke Ermuedung.'
          : currentTSB >= -30
            ? 'Belastet: Erholung oder lockere Einheiten einplanen.'
            : 'Sehr belastet: harte Einheiten besser verschieben.',
  }

  const heartRateBasisLabel = sourceSummary?.heartRateBasis === 'lthr'
    ? 'LTHR'
    : sourceSummary?.heartRateBasis === 'hrr_estimate'
      ? 'HF-Reserve'
      : sourceSummary?.heartRateBasis === 'max_hr_estimate'
        ? 'MaxHF'
        : null

  const acwrMetrics = useMemo(() => {
    const loads = toLoadArray(orderedData)
    if (loads.length < 28) return null

    const acuteWindow = loads.slice(-7)
    const chronicWindow = loads.slice(-28)
    const acuteAvg = mean(acuteWindow)
    const chronicAvg = mean(chronicWindow)
    if (chronicAvg <= 0) return null

    const value = acuteAvg / chronicAvg

    const progress = clamp((value - 0.6) / 1.0, 0, 1)

    if (value < 0.8) {
      return { value, label: 'Unterlast', color: colors.info, hint: '7d/28d', progress, detail: 'Akute Belastung liegt unter deiner 28-Tage-Basis.' }
    }
    if (value <= 1.3) {
      return { value, label: 'Im Ziel', color: colors.success, hint: '7d/28d', progress, detail: 'Akute und chronische Belastung passen gut zusammen.' }
    }
    if (value <= 1.5) {
      return { value, label: 'Erhoeht', color: colors.warning, hint: '7d/28d', progress, detail: 'Akute Belastung steigt spuerbar ueber deine Basis.' }
    }
    return { value, label: 'Hoch', color: colors.danger, hint: '7d/28d', progress, detail: 'Akute Belastung liegt deutlich ueber deiner Basis.' }
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
      progress: clamp((current.monotony - 0.8) / 1.4, 0, 1),
      label,
      color,
      hint: ratio !== null ? `Wochen-Strain ${ratio.toFixed(2)}x vs. Basis` : 'Wochen-Strain ohne Basis',
    }
  }, [orderedData, colors.danger, colors.info, colors.success, colors.textMuted, colors.warning])

  // Generate training recommendations based on PMC values
  const getTrainingRecommendations = useMemo(() => {
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
    if (ctlWeeklyChange !== null && ctlWeeklyChange > 8) {
      recommendations.push({
        type: 'warning',
        title: 'Fitness-Aufbau steigt zu schnell',
        text: `Deine Fitness (CTL) steigt um ${ctlWeeklyChange.toFixed(1)}%/Woche. Faustregel: Max. 5-8% pro Woche, sonst Verletzungsrisiko! Reduziere das Trainingsvolumen leicht.`,
        icon: TrendingUp
      })
    } else if (ctlWeeklyChange !== null && ctlWeeklyChange < -5) {
      recommendations.push({
        type: 'info',
        title: 'Fitness-Aufbau sinkt',
        text: `Deine Fitness (CTL) sinkt (${ctlWeeklyChange.toFixed(1)}%/Woche). Wenn geplant (Taper/Pause), ist das OK. Sonst: Erhöhe Trainingsumfang leicht, um Fitness zu halten.`,
        icon: TrendingUp
      })
    } else if (ctlWeeklyChange !== null && ctlWeeklyChange >= 3 && ctlWeeklyChange <= 8) {
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
  }, [currentATL, currentCTL, currentTSB, ctlWeeklyChange])

  const prioritizedRecommendations = useMemo(() => {
    const severity: Record<'warning' | 'info' | 'success' | 'tip', number> = {
      warning: 0,
      info: 1,
      success: 2,
      tip: 3,
    }
    return [...getTrainingRecommendations].sort((a, b) => severity[a.type] - severity[b.type])
  }, [getTrainingRecommendations])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trainingslast (PMC){scopeLabel ? ` - ${scopeLabel}` : ''}</CardTitle>
        <CardDescription>
          Gesamtbelastung aus Power-TSS, wo vorhanden, plus HF-geschaetztem Stress fuer Laeufe und Fahrten ohne Powermeter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <MetricGaugeCard
            title="Fitness-Aufbau"
            shortName="CTL"
            value={currentCTL.toFixed(1)}
            status={ctlGauge.status}
            description="42-Tage-Basis deiner Ausdauerbelastung."
            detail={ctlGauge.detail}
            color={ctlGauge.color}
            progress={ctlGauge.progress}
            rangeLabel="Ein hoher Wert ist nicht automatisch besser; entscheidend ist ein kontrollierter Verlauf."
          />
          <MetricGaugeCard
            title="Akute Ermuedung"
            shortName="ATL"
            value={currentATL.toFixed(1)}
            status={atlGauge.status}
            description="7-Tage-Belastung gegen deine Fitness-Basis."
            detail={atlGauge.detail}
            color={atlGauge.color}
            progress={atlGauge.progress}
            rangeLabel="Als Kontext zaehlt vor allem das Verhaeltnis zur Fitness (CTL)."
          />
          <MetricGaugeCard
            title="Form und Frische"
            shortName="TSB"
            value={formatSigned(currentTSB)}
            status={tsbGauge.status}
            description="Differenz aus Fitness und akuter Ermuedung."
            detail={tsbGauge.detail}
            color={tsbGauge.color}
            progress={tsbGauge.progress}
            rangeLabel="Praxiszonen: sehr belastet unter -30, neutral -10 bis +5, frisch +5 bis +25."
          />
          <MetricGaugeCard
            title="Belastungswechsel"
            shortName="ACWR"
            value={acwrMetrics ? acwrMetrics.value.toFixed(2) : '—'}
            status={acwrMetrics?.label || 'Zu wenig Daten'}
            description="7 Tage im Verhaeltnis zu 28 Tagen."
            detail={acwrMetrics?.detail || 'Mindestens 28 Tage Belastungsdaten noetig.'}
            color={acwrMetrics?.color || colors.textMuted}
            progress={acwrMetrics?.progress || 0}
            rangeLabel="Orientierung: 0.8-1.3 stabil, 1.3-1.5 erhoeht, darueber deutlich hoch."
          />
          <MetricGaugeCard
            title="Trainingsvariation"
            shortName="Monotony"
            value={monotonyStrainMetrics ? monotonyStrainMetrics.monotony.toFixed(2) : '—'}
            status={monotonyStrainMetrics?.label || 'Zu wenig Daten'}
            description="Wie gleichfoermig deine Woche belastet ist."
            detail={monotonyStrainMetrics
              ? `Wochen-Strain ${Math.round(monotonyStrainMetrics.strain)} · ${monotonyStrainMetrics.strainBandLabel}${monotonyStrainMetrics.strainRatio !== null ? ` · ${monotonyStrainMetrics.strainRatio.toFixed(2)}x Basis` : ''}`
              : 'Mindestens 7 Tage Belastungsdaten noetig.'}
            color={monotonyStrainMetrics?.color || colors.textMuted}
            progress={monotonyStrainMetrics?.progress || 0}
            rangeLabel="Unter 1.5 meist variabel, ueber 2.0 oft zu gleichfoermig."
          />
          {prioritizedRecommendations[0] && (() => {
            const recommendation = prioritizedRecommendations[0]
            const Icon = recommendation.icon
            const borderClass = recommendation.type === 'warning'
              ? 'border-orange-500/30 bg-orange-500/10'
              : recommendation.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : recommendation.type === 'tip'
                  ? 'border-blue-500/30 bg-blue-500/10'
                  : 'border-border/60 bg-background/60'

            return (
              <div className={`rounded-lg border p-4 ${borderClass}`}>
                <div className="flex items-start gap-3">
                  <Icon size={18} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <div className="text-sm font-semibold">Naechster sinnvoller Schritt</div>
                    <div className="mt-2 text-base font-semibold leading-tight">{recommendation.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{recommendation.text}</p>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {sourceSummary && (
          <div className="mb-5 rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Datenbasis fuer Trainingsstress</div>
                <div className="text-xs text-muted-foreground">
                  {sourceSummary.activityCount} Aktivitaeten · {sourceSummary.powerTssPercentage}% Power-TSS · {sourceSummary.heartRateTssPercentage}% HF-Schaetzung · {sourceSummary.missingActivityCount} ohne verwertbare Stressdaten.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/60 px-3 py-1">
                  Gesamt-TSS: {sourceSummary.totalTss.toFixed(0)}
                </span>
                {heartRateBasisLabel && (
                <span className="rounded-full border border-border/60 px-3 py-1">
                  HF-Basis: {heartRateBasisLabel}
                  {sourceSummary.thresholdHrUsed ? `, Schwelle ${sourceSummary.thresholdHrUsed} bpm` : ''}
                </span>
                )}
                <Link
                  to="/settings?tab=personal"
                  className="rounded-full border border-primary/30 px-3 py-1 text-foreground hover:bg-secondary"
                >
                  FTP & Gewicht pruefen
                </Link>
              </div>
            </div>
          </div>
        )}

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
              label={{ value: 'Trainingslast', angle: -90, position: 'insideLeft', fill: colors.axis }}
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
              name="Fitness-Aufbau (CTL)"
              stroke={ctlLineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="atl"
              name="Akute Ermuedung (ATL)"
              stroke={atlLineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="tsb"
              name="Form und Frische (TSB)"
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
            <span>Sehr frisch (&gt;25)</span>
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
            <span>Belastet (-30--10)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.danger }}></div>
            <span>Sehr belastet (&lt;-30)</span>
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
                  <span style={{ color: ctlLineColor }}>●</span> Fitness-Aufbau (CTL)
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Exponentiell gewichteter Durchschnitt deines TSS über <strong>42 Tage</strong>.
                  Repräsentiert deine langfristige Ausdauerleistung und aerobe Kapazität.
                  Ein höherer CTL bedeutet bessere Grundlagenausdauer.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  <span style={{ color: atlLineColor }}>●</span> Akute Ermuedung (ATL)
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Exponentiell gewichteter Durchschnitt deines TSS über <strong>7 Tage</strong>.
                  Zeigt deine kurzfristige Trainingsbelastung und aktuelle Ermüdung.
                  Steigt schnell bei intensivem Training und fällt bei Erholung.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  <span style={{ color: tsbLineColor }}>●</span> Form und Frische (TSB)
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
