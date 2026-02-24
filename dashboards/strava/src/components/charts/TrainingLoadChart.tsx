import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
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

  // Format data for chart
  const chartData = useMemo(() => {
    return data.map(item => ({
      ...item,
      dateFormatted: format(parseISO(item.date), 'dd MMM', { locale: de }),
    }))
  }, [data])

  const tsbLineColor = colors.secondary

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

  // Generate training recommendations based on PMC values
  const getTrainingRecommendations = useMemo(() => {
    const ctlWeeklyChange = data.length >= 7
      ? ((currentCTL - data[data.length - 7].ctl) / data[data.length - 7].ctl) * 100
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
  }, [currentCTL, currentATL, currentTSB, data])

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
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CTL (Fitness)</p>
            <p className="text-2xl font-bold" style={{ color: colors.accent3 }}>
              {currentCTL.toFixed(1)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">42-day average</p>
          </div>
          <div className="text-center p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">ATL (Fatigue)</p>
            <p className="text-2xl font-bold" style={{ color: colors.danger }}>
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
        </div>

        {/* Training Recommendations */}
        <div className="mb-6 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Info size={16} className="text-primary" />
            Trainingsempfehlungen basierend auf deinen Werten
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {getTrainingRecommendations.map((rec, index) => {
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
                <div key={index} className={`p-3 rounded-lg border h-full ${bgColor}`}>
                  <div className="flex items-start gap-3">
                    <Icon size={18} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold">{rec.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{rec.text}</p>
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
              stroke={colors.accent3}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="atl"
              name="ATL (Fatigue)"
              stroke={colors.danger}
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
                  <span style={{ color: colors.accent3 }}>●</span> CTL (Chronic Training Load) - Fitness
                </h4>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Exponentiell gewichteter Durchschnitt deines TSS über <strong>42 Tage</strong>.
                  Repräsentiert deine langfristige Ausdauerleistung und aerobe Kapazität.
                  Ein höherer CTL bedeutet bessere Grundlagenausdauer.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-1 flex items-center gap-2">
                  <span style={{ color: colors.danger }}>●</span> ATL (Acute Training Load) - Ermüdung
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
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
